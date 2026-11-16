// Test tích hợp CSDL: chỉ chạy khi có TEST_DATABASE_URL trỏ tới Postgres RỖNG dành cho test (tên DB phải chứa "test").
// Ví dụ: createdb classfund_test && TEST_DATABASE_URL=postgres://localhost/classfund_test npm run test:db
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const url = process.env.TEST_DATABASE_URL;
const run = url && /test/i.test(new URL(url).pathname) ? describe : describe.skip;
const T1 = "aaaaaaaa-0000-4000-8000-000000000001", T2 = "aaaaaaaa-0000-4000-8000-000000000002", OUT = "aaaaaaaa-0000-4000-8000-000000000003";
const uuid = () => crypto.randomUUID();

run("quy tắc kế toán và bảo mật (Postgres thật)", () => {
  let admin: Client;
  async function as<T>(uid: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: url }); await c.connect();
    try {
      await c.query("begin"); await c.query(`set local role ${uid ? "authenticated" : "anon"}`);
      if (uid) await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      const r = await fn(c); await c.query("commit"); return r;
    } catch (e) { await c.query("rollback").catch(() => {}); throw e; } finally { await c.end(); }
  }
  const rpc = (uid: string | null, sql: string, params: unknown[] = []) => as(uid, async (c) => (await c.query(sql, params)).rows);
  const status = async (s: string, c: string) => (await admin.query("select * from student_contribution_status where student_id=$1 and contribution_id=$2", [s, c])).rows[0];
  async function mk(type: "fixed" | "voluntary" | "custom", amount: number | null) {
    const c = (await rpc(T1, "select save_contribution(null,$1,null,$2,$3,null,null,'active',null) as id", [`K-${uuid()}`, type, amount]))[0].id;
    const s = (await rpc(T1, "select create_student($1,null) as id", [`HS ${uuid()}`]))[0].id;
    return { c, s };
  }
  const pay = (s: string, c: string, amt: number, method = "cash", key = uuid()) =>
    rpc(T1, "select record_payment($1,$2,$3,$4,null,null,$5) as id", [s, c, amt, method, key]);

  beforeAll(async () => {
    admin = new Client({ connectionString: url }); await admin.connect();
    await admin.query("drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; create schema auth;");
    await admin.query(`create table auth.users(id uuid primary key default gen_random_uuid(), email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
        if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
      grant usage on schema auth, public to anon, authenticated;`);
    const dir = path.resolve(__dirname, "../../supabase/migrations");
    for (const f of readdirSync(dir).sort()) await admin.query(readFileSync(path.join(dir, f), "utf8"));
    await admin.query("insert into auth.users(id,email) values ($1,'a@x'),($2,'b@x'),($3,'c@x')", [T1, T2, OUT]);
    await admin.query("insert into user_roles(user_id,role) values ($1,'treasurer'),($2,'treasurer')", [T1, T2]);
  });
  afterAll(async () => { await admin?.end(); });

  it("nhiều khoản nộp một phần được lưu thành các bản ghi riêng", async () => {
    const { c, s } = await mk("fixed", 50000);
    await pay(s, c, 20000); await pay(s, c, 15000); expect((await status(s, c)).status).toBe("partially_paid");
    await pay(s, c, 15000);
    const st = await status(s, c);
    expect(st.status).toBe("fully_paid"); expect(Number(st.outstanding_amount)).toBe(0);
    expect((await admin.query("select count(*)::int n from payments where student_id=$1", [s])).rows[0].n).toBe(3);
  });
  it("nộp dư không bị bỏ qua", async () => {
    const { c, s } = await mk("fixed", 50000); await pay(s, c, 60000);
    const st = await status(s, c); expect(st.status).toBe("overpaid"); expect(Number(st.overpaid_amount)).toBe(10000);
  });
  it("không cho giảm nghĩa vụ vượt quá mức phải nộp", async () => {
    const { c, s } = await mk("fixed", 50000);
    await expect(rpc(T1, "select add_adjustment($1,$2,60000,'điều chỉnh sai')", [s, c])).rejects.toThrow(/adjustment_exceeds_required/);
    await rpc(T1, "select add_adjustment($1,$2,20000,'đã thống nhất giảm')", [s, c]);
    await expect(rpc(T1, "select add_adjustment($1,$2,40000,'giảm thêm')", [s, c])).rejects.toThrow(/adjustment_exceeds_required/);
  });
  it("không cho thay đổi nghĩa vụ sau khi đã ghi nhận giao dịch", async () => {
    const { c, s } = await mk("fixed", 50000);
    await pay(s, c, 10000);
    await expect(rpc(T1, "select set_assignment($1,$2,'exempt',null,'miễn đóng')", [c, s])).rejects.toThrow(/assignment_locked/);
  });
  it("tự nguyện không tạo nợ", async () => {
    const { c, s } = await mk("voluntary", 20000);
    const st = await status(s, c); expect(st.status).toBe("voluntary_none"); expect(Number(st.outstanding_amount)).toBe(0);
    await pay(s, c, 10000); expect((await status(s, c)).status).toBe("voluntary_paid");
  });
  it("tiền tự nguyện không làm tăng tiến độ nghĩa vụ công khai", async () => {
    const fixed = await mk("fixed", 100000);
    const voluntary = await mk("voluntary", 100000);
    await pay(fixed.s, fixed.c, 10000);
    const before = (await rpc(null, "select public_progress() as p"))[0].p;
    await pay(voluntary.s, voluntary.c, 50000);
    const after = (await rpc(null, "select public_progress() as p"))[0].p;
    expect(after.progress_percent).toBe(before.progress_percent);
    expect(Number(after.required_received)).toBe(Number(before.required_received));
    expect(Number(after.total_received)).toBe(Number(before.total_received) + 50000);
  });
  it("miễn đóng: trạng thái exempt và không nhận khoản nộp", async () => {
    const { c, s } = await mk("fixed", 50000);
    await rpc(T1, "select set_assignment($1,$2,'exempt',null,'hoàn cảnh khó khăn')", [c, s]);
    expect((await status(s, c)).status).toBe("exempt");
    await expect(pay(s, c, 1000)).rejects.toThrow(/student_not_liable/);
  });
  it("chuyển khoản chờ đối soát không tính là đã thu cho đến khi đối soát", async () => {
    const { c, s } = await mk("fixed", 50000); const [{ id }] = await pay(s, c, 50000, "bank_transfer");
    let st = await status(s, c); expect(st.status).toBe("pending_reconciliation"); expect(Number(st.received_amount)).toBe(0);
    await rpc(T1, "select reconcile_payment($1,null)", [id]);
    st = await status(s, c); expect(st.status).toBe("fully_paid");
  });
  it("đảo và hoàn tiền làm giảm tiền đã thu, không xoá lịch sử", async () => {
    const { c, s } = await mk("fixed", 50000);
    const [{ id }] = await pay(s, c, 50000); await rpc(T1, "select refund_payment($1,20000,'hoàn nhầm')", [id]);
    expect(Number((await status(s, c)).received_amount)).toBe(30000);
    await expect(rpc(T1, "select reverse_payment($1,'nhầm')", [id])).rejects.toThrow(/payment_has_refund/);
    const [{ id: id2 }] = await pay(s, c, 10000); await rpc(T1, "select reverse_payment($1,'ghi nhầm')", [id2]);
    expect(Number((await status(s, c)).received_amount)).toBe(30000);
    expect((await admin.query("select count(*)::int n from payments where student_id=$1", [s])).rows[0].n).toBe(2);
  });
  it("hứa nộp không làm tăng tiền đã thu", async () => {
    const { c, s } = await mk("fixed", 50000); await rpc(T1, "select add_promise($1,$2,50000,null,'tuần sau')", [s, c]);
    expect(Number((await status(s, c)).received_amount)).toBe(0);
  });
  it("idempotency: gửi lại cùng khoá chỉ tạo một giao dịch, kể cả song song", async () => {
    const { c, s } = await mk("fixed", 50000); const key = uuid();
    const [a, b] = await Promise.all([pay(s, c, 5000, "cash", key), pay(s, c, 5000, "cash", key)]);
    expect(a[0].id).toBe(b[0].id);
    expect((await admin.query("select count(*)::int n from payments where student_id=$1", [s])).rows[0].n).toBe(1);
  });
  it("từ chối số tiền không hợp lệ và tham chiếu sai", async () => {
    const { c, s } = await mk("fixed", 50000);
    await expect(pay(s, c, -5)).rejects.toThrow(); await expect(pay(s, c, 0)).rejects.toThrow(/invalid_amount/);
    await expect(pay(uuid(), c, 100)).rejects.toThrow(/student_not_found/); await expect(pay(s, uuid(), 100)).rejects.toThrow(/contribution_not_found/);
  });
  it("ghi nhật ký với actor lấy từ phiên", async () => {
    const { c, s } = await mk("fixed", 50000); const [{ id }] = await pay(s, c, 1000);
    const r = await admin.query("select actor_id from audit_logs where entity_type='payments' and entity_id=$1", [id]);
    expect(r.rows[0].actor_id).toBe(T1);
  });
  it("giao dịch và nhật ký bất biến", async () => {
    await expect(admin.query("update payments set amount=1")).rejects.toThrow(/immutable_record/);
    await expect(admin.query("delete from audit_logs")).rejects.toThrow(/immutable_record/);
    await expect(admin.query("truncate payments")).rejects.toThrow();
  });
  it("người không phải thủ quỹ và khách công khai bị chặn", async () => {
    const { c, s } = await mk("fixed", 50000);
    await expect(rpc(OUT, "select record_payment($1,$2,1000,'cash',null,null,$3)", [s, c, uuid()])).rejects.toMatchObject({ code: "42501" });
    expect(await rpc(OUT, "select * from students")).toEqual([]);
    await expect(rpc(T1, "insert into payments(student_id,contribution_id,amount,method,recorded_by,initial_status,idempotency_key) values ($1,$2,1,'cash',$3,'verified',$4)", [s, c, T1, uuid()])).rejects.toMatchObject({ code: "42501" });
    await expect(rpc(null, "select * from students")).rejects.toThrow();
    const pub = (await rpc(null, "select public_progress() as p"))[0].p; expect(Object.keys(pub).sort()).toEqual(["completed_contributions", "progress_percent", "required_received", "total_contributions", "total_received", "total_required"]);
  });
  it("tối đa 2 thủ quỹ", async () => {
    await expect(admin.query("insert into user_roles(user_id,role) values (gen_random_uuid(),'treasurer')")).rejects.toThrow();
  });
});

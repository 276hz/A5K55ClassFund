import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeTreasurer } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { STATUS_LABEL, METHOD_LABEL } from "@/lib/labels";
import { rateLimit } from "@/lib/rate-limit";

const deny = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 1000;

async function fetchAll<T>(build: () => any): Promise<{ data: T[]; error: any }> {
  const rows: T[] = [];
  for (let offset = 0; offset < 100_000; offset += PAGE_SIZE) {
    const { data, error } = await build().range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: [], error };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
  return { data: rows, error: new Error("Export vượt giới hạn an toàn 100.000 dòng.") };
}

const csvResponse = (name: string, body: string) =>
  new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });

// Xuất file KHÔNG gồm ghi chú riêng, mã tham chiếu hay nhật ký.
export async function GET(req: Request) {
  const supabase = await createClient();
  const auth = await authorizeTreasurer(supabase);
  if (!auth.ok) return deny(auth.status, auth.message);
  const { data: accountProfile, error: profileError } = await supabase.from("profiles").select("must_change_password").eq("id", auth.userId).maybeSingle();
  if (profileError || !accountProfile) return deny(403, "Tài khoản chưa được thiết lập đầy đủ.");
  if (accountProfile.must_change_password) return deny(428, "Hãy đổi mật khẩu khởi tạo trước khi sử dụng ClassFund.");
  if (!rateLimit(`export:${auth.userId}`, 20)) return deny(429, "Thao tác quá nhanh.");
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const day = new Date().toISOString().slice(0, 10);

  if (type === "students") {
    const { data, error } = await fetchAll<any>(() => supabase.from("student_overall").select("*").order("full_name").order("student_id"));
    if (error) return deny(500, "Không thể xuất dữ liệu.");
    return csvResponse(`hoc-sinh-${day}.csv`, toCsv(
      ["Họ và tên", "Phải nộp (VND)", "Đã thu (VND)", "Chờ đối soát (VND)", "Còn thiếu (VND)", "Trạng thái"],
      (data ?? []).map((r) => [r.full_name, r.required_total, r.received_total, r.pending_total, r.outstanding_total, STATUS_LABEL[r.overall_status] ?? r.overall_status])));
  }
  if (type === "status") {
    const c = url.searchParams.get("contribution");
    const student = url.searchParams.get("s");
    const status = url.searchParams.get("st");
    const { data, error } = await fetchAll<any>(() => {
      let q = supabase.from("student_contribution_status").select("*").order("full_name").order("student_id").order("contribution_id");
      if (c && UUID.test(c)) q = q.eq("contribution_id", c);
      if (student && UUID.test(student)) q = q.eq("student_id", student);
      if (status) q = q.eq("status", status);
      return q;
    });
    if (error) return deny(500, "Không thể xuất dữ liệu.");
    return csvResponse(`cong-no-${day}.csv`, toCsv(
      ["Họ và tên", "Khoản thu", "Phải nộp (VND)", "Đã thu (VND)", "Chờ đối soát (VND)", "Còn thiếu (VND)", "Nộp dư (VND)", "Trạng thái"],
      (data ?? []).map((r) => [r.full_name, r.contribution_name, r.effective_required, r.received_amount, r.pending_amount, r.outstanding_amount, r.overpaid_amount, STATUS_LABEL[r.status] ?? r.status])));
  }
  if (type === "payments") {
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    const contribution = url.searchParams.get("c");
    const student = url.searchParams.get("s");
    const method = url.searchParams.get("m");
    const status = url.searchParams.get("st");
    const [{ data, error }, st, ct] = await Promise.all([
      fetchAll<any>(() => {
        let q = supabase.from("payments_v").select("*").order("paid_at", { ascending: false }).order("id");
        if (from && DAY.test(from)) q = q.gte("paid_at", `${from}T00:00:00+07:00`);
        if (to && DAY.test(to)) q = q.lte("paid_at", `${to}T23:59:59+07:00`);
        if (contribution && UUID.test(contribution)) q = q.eq("contribution_id", contribution);
        if (student && UUID.test(student)) q = q.eq("student_id", student);
        if (method && ["cash", "bank_transfer", "other"].includes(method)) q = q.eq("method", method);
        if (status === "pending") q = q.eq("verified", false).eq("reversed", false);
        if (status === "verified") q = q.eq("verified", true).eq("reversed", false);
        if (status === "reversed") q = q.eq("reversed", true);
        return q;
      }),
      supabase.from("students").select("id,full_name"),
      supabase.from("contributions").select("id,name"),
    ]);
    if (error) return deny(500, "Không thể xuất dữ liệu.");
    const studentRows = (st.data ?? []) as { id: string; full_name: string }[];
    const contributionRows = (ct.data ?? []) as { id: string; name: string }[];
    const paymentRows = (data ?? []) as any[];
    const sn = new Map(studentRows.map((s) => [s.id, s.full_name]));
    const cn = new Map(contributionRows.map((c) => [c.id, c.name]));
    return csvResponse(`giao-dich-${day}.csv`, toCsv(
      ["Thời gian", "Học sinh", "Khoản thu", "Số tiền (VND)", "Đã hoàn (VND)", "Phương thức", "Tình trạng"],
      paymentRows.map((p) => [p.paid_at, sn.get(p.student_id) ?? "", cn.get(p.contribution_id) ?? "", p.amount, p.refunded, METHOD_LABEL[p.method] ?? p.method,
        p.reversed ? "Đã đảo" : p.verified ? "Đã xác minh" : "Chờ đối soát"])));
  }
  return deny(400, "Loại xuất không hợp lệ.");
}

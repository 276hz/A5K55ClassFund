import { describe, it, expect, beforeEach } from "vitest";
import { authorizeTreasurer, sameOrigin, safeNext, type AuthClient } from "../src/lib/auth";
import { rateLimit, resetRateLimit } from "../src/lib/rate-limit";
import { mapDbError } from "../src/lib/errors";
import { rpcSchemas, toRpcArgs } from "../src/lib/schemas";

const client = (user: { id: string } | null, isTreasurer: boolean): AuthClient => ({
  auth: { getUser: async () => ({ data: { user }, error: null }) },
  rpc: async () => ({ data: isTreasurer, error: null }),
});
const U = "11111111-1111-4111-8111-111111111111";

describe("phân quyền", () => {
  it("401 khi chưa đăng nhập", async () => { expect(await authorizeTreasurer(client(null, false))).toMatchObject({ ok: false, status: 401 }); });
  it("403 khi đã đăng nhập nhưng không phải thủ quỹ", async () => { expect(await authorizeTreasurer(client({ id: "x" }, false))).toMatchObject({ ok: false, status: 403 }); });
  it("cho phép thủ quỹ", async () => { expect(await authorizeTreasurer(client({ id: "t" }, true))).toEqual({ ok: true, userId: "t" }); });
  it("kiểm tra origin (CSRF)", () => {
    expect(sameOrigin({ headers: { get: (n: string) => (n === "origin" ? "https://a.app" : "a.app") } })).toBe(true);
    expect(sameOrigin({ headers: { get: (n: string) => (n === "origin" ? "https://evil.com" : "a.app") } })).toBe(false);
    expect(sameOrigin({ headers: { get: () => null } })).toBe(false);
  });
  it("chặn open-redirect", () => {
    expect(safeNext("//evil.com")).toBe("/tong-quan");
    expect(safeNext("https://evil.com")).toBe("/tong-quan");
    expect(safeNext("/dat-lai-mat-khau")).toBe("/dat-lai-mat-khau");
  });
  it("hiển thị lỗi nghiệp vụ mới bằng thông báo dễ hiểu", () => {
    expect(mapDbError({ message: "assignment_locked" }).status).toBe(400);
    expect(mapDbError({ message: "adjustment_exceeds_required" }).message).toContain("vượt quá nghĩa vụ");
  });
  it("lỗi 42501 từ CSDL thành 403, lỗi lạ không lộ chi tiết", () => {
    expect(mapDbError({ code: "42501" }).status).toBe(403);
    const m = mapDbError({ code: "XX000", message: "relation payments secret detail" });
    expect(m.status).toBe(500);
    expect(m.message).not.toContain("secret");
  });
});

describe("giới hạn tốc độ", () => {
  beforeEach(resetRateLimit);
  it("chặn khi vượt ngưỡng và mở lại sau cửa sổ", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("u", 3, 1000, 0)).toBe(true);
    expect(rateLimit("u", 3, 1000, 10)).toBe(false);
    expect(rateLimit("u", 3, 1000, 1500)).toBe(true);
  });
});

describe("kiểm tra đầu vào (zod)", () => {
  const base = { student_id: U, contribution_id: U, method: "cash", idempotency_key: U };
  it("nhận khoản nộp hợp lệ", () => { expect(rpcSchemas.record_payment.safeParse({ ...base, amount: 20000 }).success).toBe(true); });
  it("từ chối số tiền âm, 0, thập phân, quá lớn", () => {
    for (const amount of [-1, 0, 1.5, 2_000_000_000]) expect(rpcSchemas.record_payment.safeParse({ ...base, amount }).success).toBe(false);
  });
  it("từ chối id hoặc phương thức sai", () => {
    expect(rpcSchemas.record_payment.safeParse({ ...base, amount: 1, student_id: "abc" }).success).toBe(false);
    expect(rpcSchemas.record_payment.safeParse({ ...base, amount: 1, method: "bitcoin" }).success).toBe(false);
  });
  it("loại bỏ actor/role do client gửi", () => {
    const r = rpcSchemas.record_payment.parse({ ...base, amount: 1, recorded_by: "evil", actor_id: "evil", role: "admin", total_received: 9 });
    expect(Object.keys(toRpcArgs(r))).not.toContain("p_recorded_by");
    expect(Object.keys(toRpcArgs(r)).sort()).toEqual(["p_amount", "p_contribution_id", "p_idempotency_key", "p_method", "p_note", "p_reference", "p_student_id"]);
  });
  it("bắt buộc lý do khi đảo/hoàn", () => {
    expect(rpcSchemas.reverse_payment.safeParse({ payment_id: U, reason: "" }).success).toBe(false);
    expect(rpcSchemas.refund_payment.safeParse({ payment_id: U, amount: 5, reason: "nhầm" }).success).toBe(true);
  });
  it("khoản cố định cần số tiền > 0", () => {
    const c = { id: null, name: "Quỹ", type: "fixed" };
    expect(rpcSchemas.save_contribution.safeParse({ ...c, amount: null }).success).toBe(false);
    expect(rpcSchemas.save_contribution.safeParse({ ...c, amount: 50000 }).success).toBe(true);
    expect(rpcSchemas.save_contribution.safeParse({ id: null, name: "TN", type: "voluntary" }).success).toBe(true);
  });
  it("chuẩn hóa ngày bỏ trống thành null và từ chối ngày không tồn tại", () => {
    const base = { id: null, name: "Quỹ", type: "fixed", amount: 50000 };
    expect(rpcSchemas.save_contribution.safeParse({ ...base, start_date: "", due_date: "" }).success).toBe(true);
    expect(rpcSchemas.save_contribution.safeParse({ ...base, start_date: "2026-02-30", due_date: "" }).success).toBe(false);
    expect(rpcSchemas.add_promise.safeParse({ student_id: U, contribution_id: U, amount: 10000, expected_date: "", note: "" }).success).toBe(true);
  });
});

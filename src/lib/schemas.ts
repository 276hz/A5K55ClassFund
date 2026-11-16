import { z } from "zod";
import { MAX_AMOUNT } from "./money";

const uuid = z.string().uuid();
const req = (max: number) => z.string().trim().min(1).max(max);
const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const reason = z.string().trim().min(3, "Cần nhập lý do (tối thiểu 3 ký tự).").max(300);
const date = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ.").nullable(),
).refine((value) => {
  if (value === null) return true;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "Ngày không tồn tại.");
const amount = z.number().int().positive().max(MAX_AMOUNT);

/** Tên RPC -> schema. Không có trường actor/role: người thực hiện luôn lấy từ phiên đăng nhập trong CSDL. */
export const rpcSchemas = {
  create_student: z.object({ full_name: req(120), student_number: opt(30) }),
  update_student: z.object({ id: uuid, full_name: req(120), student_number: opt(30) }),
  archive_student: z.object({ id: uuid, reason }),
  import_students: z.object({
    rows: z.array(z.object({ full_name: req(120), student_number: opt(30) })).min(1).max(500),
  }),
  save_contribution: z.object({
    id: uuid.nullish().transform((v) => v ?? null),
    name: req(120), description: opt(500), type: z.enum(["fixed", "voluntary", "custom"]),
    amount: z.number().int().min(0).max(MAX_AMOUNT).nullish().transform((v) => v ?? null),
    start_date: date, due_date: date,
    status: z.enum(["active", "closed"]).nullish().transform((v) => v ?? null), notes: opt(1000),
  }).refine((v) => v.type !== "fixed" || (v.amount ?? 0) > 0, { message: "Khoản cố định cần số tiền > 0.", path: ["amount"] }),
  set_assignment: z.object({
    contribution_id: uuid, student_id: uuid, status: z.enum(["required", "exempt", "excluded"]),
    required_amount: z.number().int().min(1).max(MAX_AMOUNT).nullish().transform((v) => v ?? null), reason: opt(300),
  }),
  record_payment: z.object({
    student_id: uuid, contribution_id: uuid, amount, method: z.enum(["cash", "bank_transfer", "other"]),
    reference: opt(100), note: opt(500), idempotency_key: uuid,
  }),
  reconcile_payment: z.object({ payment_id: uuid, note: opt(300) }),
  reverse_payment: z.object({ payment_id: uuid, reason }),
  refund_payment: z.object({ payment_id: uuid, amount, reason }),
  add_adjustment: z.object({ student_id: uuid, contribution_id: uuid, amount, reason }),
  add_promise: z.object({
    student_id: uuid, contribution_id: uuid.nullish().transform((v) => v ?? null), amount,
    expected_date: date, note: opt(500),
  }),
} as const;

export type RpcName = keyof typeof rpcSchemas;
export const isRpcName = (n: string): n is RpcName => Object.prototype.hasOwnProperty.call(rpcSchemas, n);

/** Đổi khoá thành tham số p_* của hàm Postgres. */
export function toRpcArgs(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [`p_${k}`, v]));
}

export const STATUS_LABEL: Record<string, string> = {
  not_paid: "Chưa nộp", partially_paid: "Đã nộp một phần", fully_paid: "Đã hoàn thành", overpaid: "Nộp dư",
  exempt: "Miễn đóng", excluded: "Không áp dụng", pending_reconciliation: "Chờ đối soát",
  voluntary_paid: "Đã đóng góp", voluntary_none: "Chưa đóng góp", no_obligations: "Chưa có khoản thu",
};
export const STATUS_TONE: Record<string, string> = {
  not_paid: "bg-red-50 text-red-700 ring-red-200", partially_paid: "bg-amber-50 text-amber-800 ring-amber-200",
  fully_paid: "bg-emerald-50 text-emerald-800 ring-emerald-200", overpaid: "bg-sky-50 text-sky-800 ring-sky-200",
  exempt: "bg-slate-100 text-slate-700 ring-slate-200", excluded: "bg-slate-100 text-slate-700 ring-slate-200",
  pending_reconciliation: "bg-violet-50 text-violet-800 ring-violet-200", voluntary_paid: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  voluntary_none: "bg-slate-100 text-slate-700 ring-slate-200", no_obligations: "bg-slate-100 text-slate-700 ring-slate-200",
};
export const TYPE_LABEL: Record<string, string> = { fixed: "Cố định", voluntary: "Tự nguyện", custom: "Tuỳ chỉnh" };
export const METHOD_LABEL: Record<string, string> = { cash: "Tiền mặt", bank_transfer: "Chuyển khoản", other: "Khác" };
export const ACTION_LABEL: Record<string, string> = {
  insert: "Tạo", update: "Cập nhật", delete: "Xoá", archive: "Lưu trữ",
};
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
}
export const ENTITY_LABEL: Record<string, string> = {
  students: "Học sinh", contributions: "Khoản thu", contribution_assignments: "Giao khoản/miễn đóng", payments: "Giao dịch",
  payment_reversals: "Đảo giao dịch", refunds: "Hoàn tiền", adjustments: "Điều chỉnh", payment_promises: "Hứa nộp",
  reconciliation_records: "Đối soát", user_roles: "Phân quyền",
};
export const payStatus = (p: { reversed: boolean; verified: boolean }) => (p.reversed ? "Đã đảo" : p.verified ? "Đã xác minh" : "Chờ đối soát");

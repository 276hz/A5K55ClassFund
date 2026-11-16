const MESSAGES: Record<string, string> = {
  duplicate_student: "Học sinh này đã tồn tại.",
  student_not_found: "Không tìm thấy học sinh.",
  contribution_not_found: "Không tìm thấy khoản thu.",
  contribution_closed: "Khoản thu đã đóng.",
  contribution_locked: "Không thể đổi loại/số tiền của khoản thu đã có giao dịch hoặc phân công.",
  assignment_locked: "Không thể thay đổi nghĩa vụ sau khi đã phát sinh giao dịch hoặc điều chỉnh.",
  adjustment_exceeds_required: "Số tiền điều chỉnh vượt quá nghĩa vụ còn có thể điều chỉnh.",
  student_not_liable: "Học sinh được miễn/loại trừ hoặc chưa được giao khoản này.",
  invalid_amount: "Số tiền không hợp lệ.",
  payment_not_found: "Không tìm thấy giao dịch.",
  payment_reversed: "Giao dịch đã bị đảo.",
  payment_has_refund: "Giao dịch đã có hoàn tiền nên không thể đảo.",
  payment_not_verified: "Giao dịch chưa được đối soát.",
  already_verified: "Giao dịch đã được xác minh.",
  reason_required: "Cần nhập lý do.",
  amount_required: "Cần nhập số tiền cho khoản tuỳ chỉnh.",
  invalid_import: "Dữ liệu nhập không hợp lệ.",
  treasurer_limit: "Chỉ được tối đa 2 tài khoản thủ quỹ.",
};

/** Trả về {status, message}. Không bao giờ lộ nội dung lỗi nội bộ của CSDL. */
export function mapDbError(err: { code?: string; message?: string }): { status: number; message: string } {
  if (err.code === "42501") return { status: 403, message: "Bạn không có quyền thực hiện thao tác này." };
  const known = err.message ? MESSAGES[err.message] : undefined;
  if (known) return { status: 400, message: known };
  if (err.code === "23505") return { status: 409, message: "Dữ liệu bị trùng." };
  if (err.code === "23503" || err.code === "23514" || err.code === "22P02") return { status: 400, message: "Dữ liệu không hợp lệ." };
  return { status: 500, message: "Có lỗi hệ thống. Vui lòng thử lại." };
}

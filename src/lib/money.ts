/** Tiền luôn là số nguyên VND (không dùng số thực). Mọi giá trị ≤ 1.000.000.000 nên an toàn với Number. */
export const MAX_AMOUNT = 1_000_000_000;

export function formatVnd(n: number | null | undefined): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.trunc(n ?? 0))} ₫`;
}

/** Chuyển "50.000", "50,000", "50 000", "50000đ" thành số nguyên; trả về null nếu không hợp lệ. */
export function parseVnd(input: string): number | null {
  const cleaned = input.replace(/[\s.,₫đĐ]|vnd/gi, "");
  if (!/^\d{1,10}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 && n <= MAX_AMOUNT ? n : null;
}

export type PaymentLike = { amount: number; refunded: number; verified: boolean; reversed: boolean };

/** Quy tắc thống nhất với CSDL: đã thu = đã xác minh, chưa đảo, trừ phần hoàn. */
export function netReceived(p: PaymentLike): number {
  return p.verified && !p.reversed ? Math.max(p.amount - p.refunded, 0) : 0;
}
export function pendingAmount(p: PaymentLike): number {
  return !p.verified && !p.reversed ? p.amount : 0;
}

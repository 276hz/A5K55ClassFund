import { describe, it, expect } from "vitest";
import { formatVnd, parseVnd, netReceived, pendingAmount } from "../src/lib/money";

describe("tiền VND", () => {
  it("định dạng số nguyên", () => { expect(formatVnd(50000)).toBe("50.000 ₫"); });
  it("đọc số nhập tay", () => {
    expect(parseVnd("50.000")).toBe(50000);
    expect(parseVnd("50,000đ")).toBe(50000);
    expect(parseVnd("1 500 000")).toBe(1500000);
  });
  it("từ chối số không hợp lệ", () => {
    for (const s of ["", "0", "-5", "abc", "1.5e3", "2000000000", "12a"]) expect(parseVnd(s)).toBeNull();
  });
  it("đã thu: chỉ tính giao dịch đã xác minh, chưa đảo, trừ hoàn", () => {
    expect(netReceived({ amount: 50000, refunded: 0, verified: true, reversed: false })).toBe(50000);
    expect(netReceived({ amount: 50000, refunded: 20000, verified: true, reversed: false })).toBe(30000);
    expect(netReceived({ amount: 50000, refunded: 0, verified: false, reversed: false })).toBe(0);
    expect(netReceived({ amount: 50000, refunded: 0, verified: true, reversed: true })).toBe(0);
  });
  it("chờ đối soát không tính vào đã thu", () => {
    const p = { amount: 30000, refunded: 0, verified: false, reversed: false };
    expect(pendingAmount(p)).toBe(30000);
    expect(netReceived(p)).toBe(0);
    expect(pendingAmount({ ...p, reversed: true })).toBe(0);
  });
});

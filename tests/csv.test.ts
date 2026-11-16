import { describe, it, expect } from "vitest";
import { parseCsv, parseStudentCsv, toCsv, guardCell } from "../src/lib/csv";

describe("nhập CSV học sinh", () => {
  it("đọc CSV hợp lệ, tiếng Việt Unicode, BOM", () => {
    const r = parseStudentCsv("\uFEFFfull_name,student_number\nĐẶNG THÙY DUNG,\nNguyễn  Thùy Trang,A12\n");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.full_name)).toEqual(["ĐẶNG THÙY DUNG", "Nguyễn Thùy Trang"]);
    expect(r.rows[1].student_number).toBe("A12");
  });
  it("nhận tiêu đề tiếng Việt và dấu chấm phẩy", () => {
    const r = parseStudentCsv("Họ và tên;Mã học sinh\nLÊ VĂN DUY;5\n");
    expect(r.rows[0].full_name).toBe("LÊ VĂN DUY");
  });
  it("báo lỗi thiếu cột bắt buộc", () => {
    const r = parseStudentCsv("ten,ma\nA,1\n");
    expect(r.rows.length).toBe(0);
    expect(r.errors[0].message).toContain("full_name");
  });
  it("phát hiện trùng và dòng lỗi, vẫn giữ dòng hợp lệ", () => {
    const r = parseStudentCsv("full_name,student_number\nAn,\nan,\n,5\nBình,\n");
    expect(r.rows.map((x) => x.full_name)).toEqual(["An", "Bình"]);
    expect(r.errors.length).toBe(2);
  });
  it("từ chối tên quá dài và quá nhiều dòng", () => {
    expect(parseStudentCsv(`full_name\n${"a".repeat(121)}\n`).errors.length).toBe(1);
    expect(parseStudentCsv("full_name\n" + Array.from({ length: 501 }, (_, i) => `HS ${i}`).join("\n")).errors[0].message).toContain("500");
  });
  it("xử lý ngoặc kép và xuống dòng trong ô", () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')[1]).toEqual(["x, y", 'he said "hi"']);
  });
  it("từ chối CSV có ngoặc kép chưa đóng", () => {
    const r = parseStudentCsv('full_name\n"Nguyễn Văn A\n');
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0].message).toContain("ngoặc kép chưa đóng");
  });
  it("công thức trong tệp nhập không được thực thi (chỉ là văn bản)", () => {
    expect(parseStudentCsv("full_name\n=1+1\n").rows[0].full_name).toBe("=1+1");
  });
});

describe("xuất CSV", () => {
  it("chống chèn công thức", () => {
    for (const s of ["=SUM(A1)", "+1", "-1", "@cmd", "\tx"]) expect(guardCell(s)).toBe(`'${s}`);
    expect(guardCell("Bình")).toBe("Bình");
    expect(toCsv(["a"], [["=HYPERLINK(1)"]])).toContain("'=HYPERLINK(1)");
  });
  it("giữ tiếng Việt, có BOM cho Excel, số là số nguyên", () => {
    const out = toCsv(["Họ tên", "Tiền"], [["Nguyễn Thị Bảo Ngọc", 50000], ["A, B", -3]]);
    expect(out.startsWith("\uFEFF")).toBe(true);
    expect(out).toContain("Nguyễn Thị Bảo Ngọc,50000");
    expect(out).toContain('"A, B",-3');
  });
});

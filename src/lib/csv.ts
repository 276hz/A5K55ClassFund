export const MAX_IMPORT_BYTES = 200_000;
export const MAX_IMPORT_ROWS = 500;

/** Bộ đọc CSV an toàn (không thực thi công thức). Hỗ trợ dấu phẩy/chấm phẩy, ngoặc kép, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Chống chèn công thức khi mở bằng Excel/Sheets: tiền tố ' cho ô văn bản bắt đầu bằng = + - @ tab CR. */
export function guardCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? String(Math.trunc(v)) : guardCell(v);
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

const normHeader = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const NAME_HEADERS = new Set(["full_name", "name", "ho_ten", "ho_va_ten", "ho_ten_hoc_sinh"]);
const NUM_HEADERS = new Set(["student_number", "ma_hoc_sinh", "so_bao_danh", "stt_ma"]);

export type ImportRow = { line: number; full_name: string; student_number: string | null };
export type ImportResult = { rows: ImportRow[]; errors: { line: number; message: string }[] };

function hasUnclosedQuote(text: string): boolean {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue;
    if (quoted && text[i + 1] === '"') { i++; continue; }
    quoted = !quoted;
  }
  return quoted;
}

export function parseStudentCsv(text: string): ImportResult {
  const errors: ImportResult["errors"] = [];
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return { rows: [], errors: [{ line: 0, message: "Tệp quá lớn (tối đa 200 KB)." }] };
  if (hasUnclosedQuote(text)) return { rows: [], errors: [{ line: 0, message: "Tệp CSV có ngoặc kép chưa đóng." }] };
  const data = parseCsv(text);
  if (data.length === 0) return { rows: [], errors: [{ line: 0, message: "Tệp trống." }] };
  const header = data[0].map(normHeader);
  const nameIdx = header.findIndex((h) => NAME_HEADERS.has(h));
  const numIdx = header.findIndex((h) => NUM_HEADERS.has(h));
  if (nameIdx < 0) return { rows: [], errors: [{ line: 1, message: "Thiếu cột bắt buộc: full_name (hoặc 'Họ và tên')." }] };
  if (data.length - 1 > MAX_IMPORT_ROWS) return { rows: [], errors: [{ line: 0, message: `Tối đa ${MAX_IMPORT_ROWS} dòng.` }] };
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  data.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = (r[nameIdx] ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
    const num = numIdx >= 0 ? (r[numIdx] ?? "").trim() : "";
    if (!name) return void errors.push({ line, message: "Thiếu họ tên." });
    if (name.length > 120) return void errors.push({ line, message: "Họ tên quá dài (tối đa 120 ký tự)." });
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(name)) return void errors.push({ line, message: "Họ tên chứa ký tự không hợp lệ." });
    if (num.length > 30) return void errors.push({ line, message: "Mã học sinh quá dài (tối đa 30 ký tự)." });
    const key = name.toLowerCase();
    if (seen.has(key)) return void errors.push({ line, message: `Trùng trong tệp: ${name}` });
    seen.add(key);
    rows.push({ line, full_name: name, student_number: num || null });
  });
  return { rows, errors };
}

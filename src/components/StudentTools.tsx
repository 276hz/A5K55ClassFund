"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import RpcForm from "./RpcForm";
import { postRpc } from "@/lib/client-api";
import { parseStudentCsv, type ImportResult } from "@/lib/csv";

export default function StudentTools() {
  const router = useRouter();
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setMsg(null); setPreview(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && !file.type.includes("csv") && file.type !== "text/plain") { setMsg("Chỉ hỗ trợ tệp .csv (UTF-8). Hãy lưu Excel thành CSV UTF-8 trước."); return; }
    if (file.size > 200_000) { setMsg("Tệp quá lớn (tối đa 200 KB)."); return; }
    setPreview(parseStudentCsv(await file.text()));
  }
  async function doImport() {
    if (!preview || preview.rows.length === 0) return;
    setBusy(true);
    const r = await postRpc("import_students", { rows: preview.rows.map(({ full_name, student_number }) => ({ full_name, student_number })) });
    setBusy(false);
    if (!r.ok) return setMsg(r.message ?? "Nhập không thành công.");
    const d = r.data as { inserted: number; skipped: string[] };
    setMsg(`Đã nhập ${d.inserted} học sinh.${d.skipped.length ? ` Bỏ qua ${d.skipped.length} người đã có/không hợp lệ: ${d.skipped.join(", ")}.` : ""}`);
    setPreview(null); router.refresh();
  }
  return (
    <div className="space-y-3">
      <details className="card"><summary className="cursor-pointer text-sm font-medium">Thêm học sinh</summary>
        <div className="mt-3"><RpcForm rpc="create_student" submitLabel="Thêm học sinh" resetOnSuccess
          fields={[{ name: "full_name", label: "Họ và tên", required: true, maxLength: 120 }, { name: "student_number", label: "Mã học sinh (không bắt buộc)", maxLength: 30 }]} /></div></details>
      <details className="card"><summary className="cursor-pointer text-sm font-medium">Nhập danh sách từ CSV</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-600">Tệp CSV UTF-8 có cột <code>full_name</code> (hoặc “Họ và tên”) và tuỳ chọn <code>student_number</code>. Xem trước trước khi nhập.</p>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" aria-label="Chọn tệp CSV" />
          {preview && (
            <div className="space-y-2">
              <p className="text-sm">{preview.rows.length} dòng hợp lệ, {preview.errors.length} dòng lỗi.</p>
              {preview.errors.length > 0 && <ul className="list-disc pl-5 text-sm text-red-700">{preview.errors.map((er) => <li key={er.line}>Dòng {er.line}: {er.message}</li>)}</ul>}
              <ul className="max-h-48 overflow-auto rounded-lg border border-slate-200 text-sm">{preview.rows.map((r) => <li key={r.line} className="border-b border-slate-100 px-3 py-1.5 last:border-0">{r.full_name}</li>)}</ul>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={() => setPreview(null)} disabled={busy}>Huỷ</button>
                <button className="btn-primary flex-1" onClick={doImport} disabled={busy || preview.rows.length === 0}>{busy ? "Đang nhập…" : `Nhập ${preview.rows.length} học sinh`}</button>
              </div>
              {preview.errors.length > 0 && <p className="text-xs text-slate-600">Các dòng lỗi sẽ không được nhập.</p>}
            </div>)}
          {msg && <p role="status" className="text-sm">{msg}</p>}
        </div>
      </details>
    </div>
  );
}

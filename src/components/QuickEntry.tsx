"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postRpc } from "@/lib/client-api";
import { formatVnd, parseVnd } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/labels";
import ConfirmDialog from "./ConfirmDialog";

type S = { id: string; full_name: string };
type C = { id: string; name: string; type: string };
type Row = { student_id: string; contribution_id: string; outstanding_amount: number; status: string };
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();

export default function QuickEntry({ students, contributions, rows, initialStudent }: { students: S[]; contributions: C[]; rows: Row[]; initialStudent?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [studentId, setStudentId] = useState(initialStudent ?? "");
  const [contributionId, setContributionId] = useState(contributions[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => (q ? students.filter((s) => norm(s.full_name).includes(norm(q))).slice(0, 6) : []), [q, students]);
  const student = students.find((s) => s.id === studentId);
  const contribution = contributions.find((c) => c.id === contributionId);
  const row = rows.find((r) => r.student_id === studentId && r.contribution_id === contributionId);
  const parsed = parseVnd(amount);

  function review() {
    setMsg(null);
    if (!student) return setMsg({ ok: false, text: "Chọn học sinh." });
    if (!contribution) return setMsg({ ok: false, text: "Chọn khoản thu." });
    if (parsed === null) return setMsg({ ok: false, text: "Số tiền không hợp lệ (số nguyên VND lớn hơn 0)." });
    setConfirming(true);
  }
  async function submit() {
    setBusy(true);
    const r = await postRpc("record_payment", { student_id: studentId, contribution_id: contributionId, amount: parsed, method, reference, note, idempotency_key: key });
    setBusy(false); setConfirming(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message ?? "Không ghi nhận được." });
    setMsg({ ok: true, text: `Đã ghi nhận ${formatVnd(parsed)} cho ${student?.full_name}.` });
    setAmount(""); setNote(""); setReference(""); setKey(crypto.randomUUID()); router.refresh();
  }

  return (
    <div className="card space-y-4">
      <div>
        <label className="label" htmlFor="q">Học sinh</label>
        {student ? (
          <div className="flex items-center justify-between rounded-lg bg-brand-soft px-3 py-2"><span className="font-medium">{student.full_name}</span>
            <button className="text-sm text-brand-dark underline" onClick={() => { setStudentId(""); setQ(""); }}>Đổi</button></div>
        ) : (
          <>
            <input id="q" className="input" placeholder="Gõ tên để tìm…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            <ul className="mt-2 space-y-1">{matches.map((s) => (
              <li key={s.id}><button className="btn-ghost w-full justify-start" onClick={() => { setStudentId(s.id); setTimeout(() => amountRef.current?.focus(), 0); }}>{s.full_name}</button></li>))}
              {q && matches.length === 0 && <li className="text-sm text-slate-500">Không tìm thấy học sinh.</li>}</ul>
          </>)}
      </div>
      <div>
        <label className="label" htmlFor="contribution">Khoản thu</label>
        <select id="contribution" className="input" value={contributionId} onChange={(e) => setContributionId(e.target.value)}>
          {contributions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {student && row && (
          <p className="mt-1 text-sm text-slate-600" aria-live="polite">
            {STATUS_LABEL[row.status] ?? row.status}{row.outstanding_amount > 0 && <> · còn thiếu <button type="button" className="font-medium text-brand underline" onClick={() => setAmount(new Intl.NumberFormat("vi-VN").format(row.outstanding_amount))}>{formatVnd(row.outstanding_amount)}</button></>}
          </p>)}
      </div>
      <div>
        <label className="label" htmlFor="amount">Số tiền thực nhận (VND)</label>
        <input id="amount" ref={amountRef} className="input text-lg" type="text" inputMode="numeric" autoComplete="off" placeholder="50.000" value={amount}
          onChange={(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 10); setAmount(d ? new Intl.NumberFormat("vi-VN").format(Number(d)) : ""); }} />
      </div>
      <fieldset>
        <legend className="label">Phương thức</legend>
        <div className="grid grid-cols-3 gap-2">{[["cash", "Tiền mặt"], ["bank_transfer", "Chuyển khoản"], ["other", "Khác"]].map(([v, l]) => (
          <label key={v} className={`btn-ghost cursor-pointer ${method === v ? "!border-brand !bg-brand-soft" : ""}`}><input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} className="sr-only" />{l}</label>))}</div>
        {method === "bank_transfer" && <p className="mt-1 text-xs text-slate-600">Chuyển khoản sẽ ở trạng thái “Chờ đối soát” cho đến khi bạn xác nhận đã nhận tiền.</p>}
      </fieldset>
      <div><label className="label" htmlFor="ref">Mã tham chiếu (không bắt buộc)</label><input id="ref" className="input" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} /></div>
      <div><label className="label" htmlFor="note">Ghi chú riêng (không bắt buộc)</label><input id="note" className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></div>
      <div aria-live="polite" className="min-h-5 text-sm">{msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-emerald-700" : "text-red-700"}>{msg.text}</p>}</div>
      <button className="btn-primary w-full text-base" onClick={review} disabled={busy}>Xem lại và ghi nhận</button>
      <ConfirmDialog open={confirming} title="Xác nhận ghi nhận" confirmLabel="Ghi nhận" busy={busy} onConfirm={submit} onCancel={() => setConfirming(false)}>
        <p><b>{student?.full_name}</b> nộp <b>{parsed !== null ? formatVnd(parsed) : ""}</b> cho “{contribution?.name}” bằng {method === "cash" ? "tiền mặt" : method === "bank_transfer" ? "chuyển khoản (chờ đối soát)" : "hình thức khác"}.</p>
      </ConfirmDialog>
    </div>
  );
}

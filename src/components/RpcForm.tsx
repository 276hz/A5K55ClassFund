"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postRpc } from "@/lib/client-api";
import { parseVnd } from "@/lib/money";
import ConfirmDialog from "./ConfirmDialog";

export type Field = {
  name: string; label: string; type?: "text" | "money" | "number" | "date" | "select" | "textarea";
  options?: { value: string; label: string }[]; required?: boolean; defaultValue?: string; placeholder?: string; maxLength?: number;
};

const fmt = (s: string) => { const d = s.replace(/\D/g, "").slice(0, 10); return d ? new Intl.NumberFormat("vi-VN").format(Number(d)) : ""; };

export default function RpcForm({ rpc, fields, hidden, submitLabel, confirm, idempotent, danger, resetOnSuccess, onDone }: {
  rpc: string; fields: Field[]; hidden?: Record<string, unknown>; submitLabel: string; confirm?: string;
  idempotent?: boolean; danger?: boolean; resetOnSuccess?: boolean; onDone?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function collect(): Record<string, unknown> | null {
    const f = new FormData(formRef.current!);
    const body: Record<string, unknown> = { ...hidden };
    for (const fld of fields) {
      const raw = String(f.get(fld.name) ?? "").trim();
      if (fld.type === "money") {
        if (!raw) { if (fld.required) { setMsg({ ok: false, text: `Nhập ${fld.label.toLowerCase()}.` }); return null; } continue; }
        const n = parseVnd(raw);
        if (n === null) { setMsg({ ok: false, text: `${fld.label} không hợp lệ.` }); return null; }
        body[fld.name] = n;
      } else if (fld.type === "number") {
        if (raw) body[fld.name] = Number(raw.replace(/\D/g, ""));
      } else body[fld.name] = raw;
    }
    if (idempotent) body.idempotency_key = key;
    return body;
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    const r = await postRpc(rpc, body);
    setBusy(false); setPending(null);
    if (r.ok) {
      setMsg({ ok: true, text: "Đã lưu thành công." });
      if (resetOnSuccess) formRef.current?.reset();
      if (idempotent) setKey(crypto.randomUUID());
      onDone?.(); router.refresh();
    } else setMsg({ ok: false, text: r.message ?? "Không thành công." });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    const body = collect();
    if (!body) return;
    if (confirm) setPending(body); else void send(body);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3" noValidate={false}>
      {fields.map((fld) => {
        const id = `${rpc}-${fld.name}`;
        const common = { id, name: fld.name, required: fld.required, className: "input", defaultValue: fld.defaultValue, maxLength: fld.maxLength, placeholder: fld.placeholder };
        return (
          <div key={fld.name}>
            <label className="label" htmlFor={id}>{fld.label}{fld.required ? " *" : ""}</label>
            {fld.type === "select" ? (
              <select {...common}>{fld.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            ) : fld.type === "textarea" ? (
              <textarea {...common} rows={2} className="input py-2" />
            ) : fld.type === "money" ? (
              <input {...common} type="text" inputMode="numeric" autoComplete="off" onInput={(e) => { e.currentTarget.value = fmt(e.currentTarget.value); }} />
            ) : fld.type === "number" ? (
              <input {...common} type="text" inputMode="numeric" autoComplete="off" />
            ) : (
              <input {...common} type={fld.type === "date" ? "date" : "text"} autoComplete="off" />
            )}
          </div>
        );
      })}
      <div aria-live="polite" className="min-h-5 text-sm">
        {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-emerald-700" : "text-red-700"}>{msg.text}</p>}
      </div>
      <button className={danger ? "btn-danger w-full" : "btn-primary w-full"} disabled={busy}>{busy ? "Đang lưu…" : submitLabel}</button>
      <ConfirmDialog open={pending !== null} title="Xác nhận" confirmLabel="Xác nhận" busy={busy}
        onConfirm={() => pending && void send(pending)} onCancel={() => setPending(null)}>{confirm}</ConfirmDialog>
    </form>
  );
}

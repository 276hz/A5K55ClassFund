"use client";
import { useEffect, useRef } from "react";

export default function ConfirmDialog({ open, title, children, confirmLabel, busy, onConfirm, onCancel }: {
  open: boolean; title: string; children: React.ReactNode; confirmLabel: string; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }} aria-labelledby="dlg-title"
      className="w-[calc(100%-2rem)] max-w-sm rounded-xl p-0 backdrop:bg-slate-900/40">
      <div className="space-y-3 p-4">
        <h2 id="dlg-title" className="text-lg font-semibold">{title}</h2>
        <div className="text-sm text-slate-700">{children}</div>
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onCancel} disabled={busy}>Huỷ</button>
          <button type="button" className="btn-primary flex-1" onClick={onConfirm} disabled={busy}>{busy ? "Đang lưu…" : confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

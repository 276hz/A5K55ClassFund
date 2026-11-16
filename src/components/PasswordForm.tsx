"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function PasswordForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const pw = String(f.get("password")), again = String(f.get("again"));
    if (pw.length < 12) return setMsg({ ok: false, text: "Mật khẩu cần tối thiểu 12 ký tự." });
    if (pw !== again) return setMsg({ ok: false, text: "Hai mật khẩu không khớp." });
    setBusy(true); setMsg(null);
    const client = createClient();
    const { error } = await client.auth.updateUser({ password: pw });
    if (error) { setBusy(false); return setMsg({ ok: false, text: "Không đổi được mật khẩu. Hãy thử lại." }); }
    const { error: profileError } = await client.rpc("complete_initial_password_change");
    setBusy(false);
    if (profileError) return setMsg({ ok: false, text: "Mật khẩu đã đổi nhưng chưa hoàn tất trạng thái tài khoản. Hãy tải lại trang hoặc liên hệ quản trị." });
    form.reset(); setMsg({ ok: true, text: "Đã đổi mật khẩu và hoàn tất thiết lập tài khoản." });
    router.refresh();
    if (redirectTo) router.replace(redirectTo);
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div><label className="label" htmlFor="pw">Mật khẩu mới</label><input id="pw" name="password" type="password" autoComplete="new-password" minLength={12} required className="input" /></div>
      <div><label className="label" htmlFor="pw2">Nhập lại mật khẩu</label><input id="pw2" name="again" type="password" autoComplete="new-password" required className="input" /></div>
      <p className="text-xs text-slate-500">Dùng mật khẩu riêng, tối thiểu 12 ký tự; không dùng chung với tài khoản khác.</p>
      <div aria-live="polite" className="min-h-5 text-sm">{msg && <p className={msg.ok ? "text-emerald-700" : "text-red-700"}>{msg.text}</p>}</div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Đang cập nhật…" : "Đổi mật khẩu"}</button>
    </form>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { usernameToAuthEmail } from "@/lib/auth-identity";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = usernameToAuthEmail(String(f.get("username") ?? ""));
    const password = String(f.get("password") ?? "");
    if (!email) { setError("Tên đăng nhập không hợp lệ."); return; }
    setBusy(true); setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) { setError("Tên đăng nhập hoặc mật khẩu không đúng."); setBusy(false); return; }
    router.replace("/tong-quan"); router.refresh();
  }
  return (
    <main className="mx-auto max-w-sm p-4 pt-16">
      <p className="text-sm font-medium text-brand">CLASSFUND · 11A5</p>
      <h1 className="mt-1 text-2xl font-semibold">Đăng nhập thủ quỹ</h1>
      <p className="mt-2 text-sm text-slate-600">Sử dụng tên đăng nhập được cấp. Không cần email.</p>
      <form onSubmit={onSubmit} className="card mt-6 space-y-4">
        <div><label className="label" htmlFor="username">Tên đăng nhập</label>
          <input id="username" name="username" type="text" autoComplete="username" required className="input" autoCapitalize="none" spellCheck={false} /></div>
        <div><label className="label" htmlFor="password">Mật khẩu</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" /></div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
        <a href="/quen-mat-khau" className="block text-center text-sm text-brand">Không đăng nhập được?</a>
      </form>
    </main>
  );
}

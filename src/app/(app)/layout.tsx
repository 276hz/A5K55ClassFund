import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { authorizeTreasurer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const auth = await authorizeTreasurer(supabase);
  if (!auth.ok && auth.status === 401) redirect("/login");
  if (auth.ok) {
    const { data: profile, error: profileError } = await supabase.from("profiles").select("must_change_password").eq("id", auth.userId).maybeSingle();
    if (profileError || !profile) redirect("/login?error=setup");
    if (profile.must_change_password) redirect("/dat-lai-mat-khau");
  }
  if (!auth.ok) {
    return (
      <main className="mx-auto max-w-md p-4 pt-16">
        <h1 className="text-xl font-semibold">403 – Không có quyền truy cập</h1>
        <p className="mt-2 text-sm text-slate-600">Tài khoản này chưa được cấp quyền thủ quỹ. Hãy liên hệ người quản trị dự án.</p>
      </main>
    );
  }
  return (
    <div className="min-h-screen pb-20 md:pb-8">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-5xl px-4 py-3"><p className="text-sm font-semibold text-brand">ClassFund · 11A5 THPT Cẩm Bình</p></div></header>
      <Nav />
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}

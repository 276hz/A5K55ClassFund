import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import PasswordForm from "@/components/PasswordForm";
import SignOutButton from "@/components/SignOutButton";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [roles, profiles, mine] = await Promise.all([
    supabase.from("user_roles").select("user_id"),
    supabase.from("profiles").select("id,full_name,username"),
    user ? supabase.from("profiles").select("username,full_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
  return (
    <>
      <PageHeader title="Cài đặt" />
      <section className="card mb-4"><h2 className="font-semibold">Tài khoản</h2><p className="mt-1 text-sm text-slate-600">Tên đăng nhập: <strong>{mine.data?.username ?? "Chưa thiết lập"}</strong></p><p className="mt-1 text-sm text-slate-600">{user?.user_metadata?.full_name ?? mine.data?.full_name}</p>
        <p className="mt-1 text-xs text-slate-500">Tài khoản được cấp riêng bởi người quản lý dự án. Không sử dụng email cá nhân.</p>
        <div className="mt-3"><SignOutButton /></div></section>
      <section className="card mb-4"><h2 className="mb-3 font-semibold">Đổi mật khẩu</h2><PasswordForm /></section>
      <section className="card"><h2 className="font-semibold">Thủ quỹ</h2><ul className="mt-2 text-sm">{(roles.data ?? []).map((r) => <li key={r.user_id}>{names.get(r.user_id) ?? "Thủ quỹ"}</li>)}</ul></section>
    </>
  );
}

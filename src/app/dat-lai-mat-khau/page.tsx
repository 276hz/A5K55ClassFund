import { redirect } from "next/navigation";
import PasswordForm from "@/components/PasswordForm";
import { createClient } from "@/lib/supabase/server";
export default async function ResetPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (<main className="mx-auto max-w-sm p-4 pt-16"><p className="text-sm font-medium text-brand">CLASSFUND</p><h1 className="mt-1 text-2xl font-semibold">Đổi mật khẩu khởi tạo</h1><p className="mt-2 text-sm text-slate-600">Để bảo vệ tài khoản, hãy tạo mật khẩu riêng trước khi tiếp tục.</p><div className="card mt-6"><PasswordForm redirectTo="/tong-quan" /></div></main>);
}

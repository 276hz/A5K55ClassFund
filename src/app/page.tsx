import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";

export const dynamic = "force-dynamic";
type Progress = { total_received: number; required_received: number; total_required: number; progress_percent: number; completed_contributions: number; total_contributions: number };

export default async function PublicPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_progress");
  const p = data as Progress | null;
  return (
    <main className="mx-auto max-w-xl p-4 pt-10">
      <p className="text-sm font-medium text-brand">ClassFund</p>
      <h1 className="mt-1 text-2xl font-semibold">Quỹ lớp 11A5 – THPT Cẩm Bình</h1>
      <p className="mt-1 text-sm text-slate-600">Trang công khai chỉ đọc. Chỉ hiển thị số liệu tổng hợp của cả lớp.</p>
      {error || !p ? (
        <div role="alert" className="card mt-6 text-sm text-red-700">Không tải được số liệu. Vui lòng thử lại sau.</div>
      ) : (
        <section className="card mt-6" aria-label="Tiến độ thu quỹ">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-600">Số tiền đã thu</span>
            <span className="text-2xl font-semibold">{formatVnd(p.total_received)}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={p.progress_percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ thu">
            <div className="h-full bg-brand" style={{ width: `${p.progress_percent}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-600">{p.progress_percent}% · đã thu khoản bắt buộc {formatVnd(p.required_received)} / {formatVnd(p.total_required)}</p>
          <p className="mt-4 text-sm">Đã hoàn thành {p.completed_contributions}/{p.total_contributions} khoản thu</p>
        </section>
      )}
      <Link href="/login" className="btn-ghost mt-6">Đăng nhập dành cho thủ quỹ</Link>
    </main>
  );
}

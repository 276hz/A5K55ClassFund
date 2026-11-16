import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/labels";
import { Empty, ErrorCard, PageHeader, StatusBadge } from "@/components/ui";
import StudentTools from "@/components/StudentTools";

export default async function Students({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "" } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("student_overall").select("*").order("full_name").limit(500);
  const term = q.replace(/[%_\\,()*]/g, " ").trim().slice(0, 60);
  if (term) query = query.ilike("full_name", `%${term}%`);
  if (status in STATUS_LABEL) query = query.eq("overall_status", status);
  const { data, error } = await query;
  return (
    <>
      <PageHeader title="Học sinh"><a className="btn-ghost" href="/api/export?type=students">Xuất CSV</a></PageHeader>
      <form className="mb-3 flex gap-2" role="search">
        <input name="q" defaultValue={q} className="input" placeholder="Tìm theo tên" aria-label="Tìm theo tên" />
        <select name="status" defaultValue={status} className="input max-w-40" aria-label="Lọc theo trạng thái">
          <option value="">Tất cả</option>{["fully_paid", "partially_paid", "not_paid", "no_obligations"].map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
        </select>
        <button className="btn-primary">Lọc</button>
      </form>
      <StudentTools />
      <div className="mt-3">{error ? <ErrorCard /> : !data?.length ? <Empty text="Chưa có học sinh phù hợp. Hãy thêm hoặc nhập danh sách từ CSV." /> : (
        <ul className="card divide-y divide-slate-100 p-0">{data.map((s) => (
          <li key={s.student_id}><Link href={`/hoc-sinh/${s.student_id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50">
            <div><p className="font-medium">{s.full_name}</p><p className="text-xs text-slate-500">Đã thu {formatVnd(s.received_total)} · còn thiếu {formatVnd(s.outstanding_total)}</p></div>
            <StatusBadge status={s.overall_status} /></Link></li>))}</ul>)}</div>
    </>
  );
}

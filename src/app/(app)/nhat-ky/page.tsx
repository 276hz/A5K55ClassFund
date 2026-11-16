import { createClient } from "@/lib/supabase/server";
import { ACTION_LABEL, ENTITY_LABEL, formatDateTime } from "@/lib/labels";
import { Empty, ErrorCard, PageHeader } from "@/components/ui";

const PAGE = 50;
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const page = Math.max(1, Math.min(1000, Number((await searchParams).p) || 1));
  const supabase = await createClient();
  const [logs, profiles] = await Promise.all([
    supabase.from("audit_logs").select("*").order("id", { ascending: false }).range((page - 1) * PAGE, page * PAGE),
    supabase.from("profiles").select("id,full_name"),
  ]);
  if (logs.error) return <ErrorCard />;
  const pn = new Map((profiles.data ?? []).map((x) => [x.id, x.full_name]));
  const more = logs.data.length > PAGE;
  const rows = logs.data.slice(0, PAGE);
  return (
    <>
      <PageHeader title="Nhật ký hoạt động" />
      <p className="mb-3 text-sm text-slate-600">Nhật ký chỉ ghi thêm, không thể sửa hoặc xoá.</p>
      {rows.length === 0 ? <Empty text="Chưa có hoạt động." /> : <ul className="space-y-2">{rows.map((a) => (
        <li key={a.id} className="card text-sm"><p className="font-medium">{ENTITY_LABEL[a.entity_type] ?? a.entity_type} · {ACTION_LABEL[a.action.split(".")[1]] ?? a.action}</p>
          <p className="text-xs text-slate-500">{pn.get(a.actor_id) ?? "Hệ thống"} · {formatDateTime(a.created_at)}{a.reason && ` · Lý do: ${a.reason}`}</p>
          <details className="mt-1"><summary className="cursor-pointer text-xs text-brand">Chi tiết trước/sau</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify({ truoc: a.before_data, sau: a.after_data }, null, 1)}</pre></details></li>))}</ul>}
      <div className="mt-4 flex justify-between">{page > 1 ? <a className="btn-ghost" href={`?p=${page - 1}`}>← Trước</a> : <span />}{more && <a className="btn-ghost" href={`?p=${page + 1}`}>Sau →</a>}</div>
    </>
  );
}

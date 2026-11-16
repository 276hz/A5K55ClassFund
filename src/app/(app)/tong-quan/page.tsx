import { createClient } from "@/lib/supabase/server";
import { formatVnd, netReceived } from "@/lib/money";
import { formatDateTime, METHOD_LABEL, ENTITY_LABEL, ACTION_LABEL, payStatus } from "@/lib/labels";
import { Empty, ErrorCard, PageHeader, Stat } from "@/components/ui";

export default async function Dashboard() {
  const supabase = await createClient();
  const [sum, pays, audit, students, scs, profiles] = await Promise.all([
    supabase.from("class_summary").select("*").single(),
    supabase.from("payments_v").select("*").order("paid_at", { ascending: false }).limit(8),
    supabase.from("audit_logs").select("id,actor_id,action,entity_type,created_at,reason").order("created_at", { ascending: false }).limit(8),
    supabase.from("students").select("id,full_name"),
    supabase.from("student_contribution_status").select("contribution_id,contribution_name,type,effective_required,received_amount,outstanding_amount"),
    supabase.from("profiles").select("id,full_name"),
  ]);
  if (sum.error || !sum.data) return <ErrorCard />;
  const s = sum.data;
  const sn = new Map((students.data ?? []).map((x) => [x.id, x.full_name]));
  const pn = new Map((profiles.data ?? []).map((x) => [x.id, x.full_name]));
  const byC = new Map<string, { name: string; type: string; req: number; rec: number; out: number }>();
  for (const r of scs.data ?? []) {
    const c = byC.get(r.contribution_id) ?? { name: r.contribution_name, type: r.type, req: 0, rec: 0, out: 0 };
    c.req += r.effective_required; c.rec += r.received_amount; c.out += r.outstanding_amount; byC.set(r.contribution_id, c);
  }
  return (
    <>
      <PageHeader title="Tổng quan" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Số tiền đã thu" value={formatVnd(s.total_received)} hint="Đã xác minh, trừ hoàn/đảo" tone="text-brand-dark" />
        <Stat label="Tổng phải thu" value={formatVnd(s.total_required)} hint="Chỉ khoản bắt buộc" />
        <Stat label="Số tiền còn thiếu" value={formatVnd(s.total_outstanding)} tone="text-red-700" />
        <Stat label="Tự nguyện đã nhận" value={formatVnd(s.voluntary_received)} hint="Không tính vào còn thiếu" />
        <Stat label="Chờ đối soát" value={formatVnd(s.pending_reconciliation)} hint="Chưa tính là đã thu" />
        <Stat label="Tổng tiền từng được hứa" value={formatVnd(s.promised_total)} hint="Tổng lịch sử lời hứa; không phải tiền đã thu hoặc số dư cam kết còn lại" />
        <Stat label="Học sinh" value={String(s.student_count)} hint={`${s.fully_paid_count} xong · ${s.partially_paid_count} một phần · ${s.not_paid_count} chưa nộp`} />
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Tiến độ từng khoản thu</h2>
      {byC.size === 0 ? <Empty text="Chưa có khoản thu nào." /> : (
        <div className="space-y-2">{[...byC.entries()].map(([id, c]) => {
          const pct = c.req > 0 ? Math.min(100, Math.floor((100 * Math.min(c.rec, c.req)) / c.req)) : 0;
          return (<div key={id} className="card"><div className="flex justify-between text-sm"><span className="font-medium">{c.name}</span>
            <span>{c.type === "voluntary" ? `Đã nhận ${formatVnd(c.rec)}` : `${pct}% · còn ${formatVnd(c.out)}`}</span></div>
            {c.type !== "voluntary" && <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Tiến độ ${c.name}`}><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>}</div>);
        })}</div>)}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section><h2 className="mb-2 font-semibold">Giao dịch gần đây</h2>
          {(pays.data ?? []).length === 0 ? <Empty text="Chưa có giao dịch." /> : <ul className="card divide-y divide-slate-100 p-0">{pays.data!.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 px-4 py-3 text-sm"><div><p className="font-medium">{sn.get(p.student_id)}</p><p className="text-xs text-slate-500">{formatDateTime(p.paid_at)} · {METHOD_LABEL[p.method]} · {payStatus(p)}</p></div>
              <span className={`font-medium ${netReceived(p) === 0 ? "text-slate-400" : ""}`}>{formatVnd(p.amount)}</span></li>))}</ul>}</section>
        <section><h2 className="mb-2 font-semibold">Hoạt động gần đây</h2>
          {(audit.data ?? []).length === 0 ? <Empty text="Chưa có hoạt động." /> : <ul className="card divide-y divide-slate-100 p-0">{audit.data!.map((a) => (
            <li key={a.id} className="px-4 py-3 text-sm"><p>{ENTITY_LABEL[a.entity_type] ?? a.entity_type} · {ACTION_LABEL[a.action.split(".")[1]] ?? a.action.split(".")[1]}</p>
              <p className="text-xs text-slate-500">{pn.get(a.actor_id) ?? "Hệ thống"} · {formatDateTime(a.created_at)}</p></li>))}</ul>}</section>
      </div>
    </>
  );
}

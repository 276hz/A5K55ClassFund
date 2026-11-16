import { createClient } from "@/lib/supabase/server";
import { formatVnd, netReceived, pendingAmount } from "@/lib/money";
import { METHOD_LABEL, STATUS_LABEL } from "@/lib/labels";
import { Empty, ErrorCard, PageHeader, Stat } from "@/components/ui";

type Q = { from?: string; to?: string; c?: string; s?: string; m?: string; st?: string };
type PaymentRow = { id: string; paid_at: string; amount: number; refunded: number; verified: boolean; reversed: boolean; contribution_id: string; student_id: string; method: string };
type ContributionRow = { id: string; name: string; type: string };
type StudentRow = { id: string; full_name: string };
type StatusRow = { contribution_id: string; outstanding_amount: number; status: string };
const D = /^\d{4}-\d{2}-\d{2}$/, U = /^[0-9a-f-]{36}$/i;
const vnDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const REPORT_PAGE_SIZE = 1000;
async function fetchReportPayments(supabase: any, f: Q) {
  const rows: any[] = [];
  for (let offset = 0; offset < 50_000; offset += REPORT_PAGE_SIZE) {
    let q = supabase.from("payments_v").select("*").order("paid_at").order("id");
    if (f.from && D.test(f.from)) q = q.gte("paid_at", `${f.from}T00:00:00+07:00`);
    if (f.to && D.test(f.to)) q = q.lte("paid_at", `${f.to}T23:59:59+07:00`);
    if (f.c && U.test(f.c)) q = q.eq("contribution_id", f.c);
    if (f.s && U.test(f.s)) q = q.eq("student_id", f.s);
    if (f.m && f.m in METHOD_LABEL) q = q.eq("method", f.m);
    if (f.st === "pending") q = q.eq("verified", false).eq("reversed", false);
    if (f.st === "verified") q = q.eq("verified", true).eq("reversed", false);
    if (f.st === "reversed") q = q.eq("reversed", true);
    const { data, error } = await q.range(offset, offset + REPORT_PAGE_SIZE - 1);
    if (error) return { data: rows, error, truncated: false };
    rows.push(...(data ?? []));
    if (!data || data.length < REPORT_PAGE_SIZE) return { data: rows, error: null, truncated: false };
  }
  return { data: rows, error: null, truncated: true };
}

export default async function Reports({ searchParams }: { searchParams: Promise<Q> }) {
  const f = await searchParams;
  const supabase = await createClient();
  const [pays, ct, st, scs] = await Promise.all([fetchReportPayments(supabase, f), supabase.from("contributions").select("id,name,type"), supabase.from("students").select("id,full_name").order("full_name"),
    supabase.from("student_contribution_status").select("contribution_id,outstanding_amount,status")]);
  if (pays.error || ct.error || st.error || scs.error) return <ErrorCard />;
  const P = pays.data as PaymentRow[];
  const contributions = (ct.data ?? []) as ContributionRow[];
  const students = (st.data ?? []) as StudentRow[];
  const statusRows = (scs.data ?? []) as StatusRow[];
  const total = P.reduce((a, p) => a + netReceived(p), 0);
  const pending = P.reduce((a, p) => a + pendingAmount(p), 0);
  const refunds = P.filter((p) => !p.reversed).reduce((a, p) => a + p.refunded, 0);
  const reversedTotal = P.filter((p) => p.reversed).reduce((a, p) => a + p.amount, 0);
  const sum = (key: (p: (typeof P)[number]) => string) => { const m = new Map<string, number>(); P.forEach((p) => m.set(key(p), (m.get(key(p)) ?? 0) + netReceived(p))); return [...m.entries()]; };
  const byC = sum((p) => p.contribution_id), byM = sum((p) => p.method), byD = sum((p) => vnDay(p.paid_at));
  const cn = new Map(contributions.map((c) => [c.id, c.name]));
  const outstanding = new Map<string, number>(); const statusCount = new Map<string, number>();
  statusRows.forEach((r) => { outstanding.set(r.contribution_id, (outstanding.get(r.contribution_id) ?? 0) + r.outstanding_amount); statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1); });
  const exportParams = new URLSearchParams();
  for (const [key, value] of Object.entries(f)) if (value) exportParams.set(key, value);
  const qs = exportParams.toString();
  return (
    <>
      <PageHeader title="Báo cáo" />
      {pays.truncated && <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Báo cáo đã đạt giới hạn hiển thị 50.000 giao dịch. Hãy thu hẹp bộ lọc ngày để xem đầy đủ dữ liệu.</p>}
      <form className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" role="search" aria-label="Bộ lọc báo cáo">
        <div><label className="label" htmlFor="from">Từ ngày</label><input id="from" type="date" name="from" defaultValue={f.from} className="input" /></div>
        <div><label className="label" htmlFor="to">Đến ngày</label><input id="to" type="date" name="to" defaultValue={f.to} className="input" /></div>
        <div><label className="label" htmlFor="c">Khoản thu</label><select id="c" name="c" defaultValue={f.c ?? ""} className="input"><option value="">Tất cả</option>{contributions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className="label" htmlFor="s">Học sinh</label><select id="s" name="s" defaultValue={f.s ?? ""} className="input"><option value="">Tất cả</option>{students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
        <div><label className="label" htmlFor="m">Phương thức</label><select id="m" name="m" defaultValue={f.m ?? ""} className="input"><option value="">Tất cả</option>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="st">Tình trạng giao dịch</label><select id="st" name="st" defaultValue={f.st ?? ""} className="input"><option value="">Tất cả</option><option value="verified">Đã xác minh</option><option value="pending">Chờ đối soát</option><option value="reversed">Đã đảo</option></select></div>
        <div className="col-span-2 flex items-end gap-2"><button className="btn-primary flex-1">Áp dụng</button><a className="btn-ghost flex-1" href={`/api/export?type=payments&${qs}`}>Xuất CSV</a></div>
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tổng đã thu" value={formatVnd(total)} tone="text-brand-dark" /><Stat label="Chờ đối soát" value={formatVnd(pending)} />
        <Stat label="Đã hoàn" value={formatVnd(refunds)} /><Stat label="Đã đảo" value={formatVnd(reversedTotal)} />
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Theo khoản thu</h2>
      {byC.length === 0 ? <Empty text="Không có giao dịch trong bộ lọc." /> : <ul className="card divide-y divide-slate-100 p-0">{byC.map(([id, v]) => (
        <li key={id} className="flex justify-between px-4 py-3 text-sm"><span>{cn.get(id)}</span><span>{formatVnd(v)}{(outstanding.get(id) ?? 0) > 0 && <span className="ml-2 text-xs text-red-700">còn thiếu {formatVnd(outstanding.get(id)!)}</span>}</span></li>))}</ul>}
      <h2 className="mb-2 mt-6 font-semibold">Theo phương thức</h2>
      <ul className="card divide-y divide-slate-100 p-0">{byM.map(([k, v]) => <li key={k} className="flex justify-between px-4 py-3 text-sm"><span>{METHOD_LABEL[k]}</span><span>{formatVnd(v)}</span></li>)}</ul>
      <h2 className="mb-2 mt-6 font-semibold">Theo ngày</h2>
      <ul className="card max-h-72 divide-y divide-slate-100 overflow-auto p-0">{byD.map(([k, v]) => <li key={k} className="flex justify-between px-4 py-2 text-sm"><span>{k}</span><span>{formatVnd(v)}</span></li>)}</ul>
      <h2 className="mb-2 mt-6 font-semibold">Công nợ theo trạng thái (toàn bộ, không theo bộ lọc)</h2>
      <ul className="card divide-y divide-slate-100 p-0">{[...statusCount.entries()].map(([k, v]) => <li key={k} className="flex justify-between px-4 py-2 text-sm"><span>{STATUS_LABEL[k] ?? k}</span><span>{v}</span></li>)}</ul>
      <a className="btn-ghost mt-3 w-full" href="/api/export?type=status">Xuất công nợ từng học sinh (CSV)</a>
    </>
  );
}

import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { formatDateTime, METHOD_LABEL, payStatus } from "@/lib/labels";
import { Empty, ErrorCard, PageHeader } from "@/components/ui";
import PaymentActions from "@/components/PaymentActions";

const PAGE = 100;
type TransactionRow = { id: string; student_id: string; contribution_id: string; amount: number; paid_at: string; method: string; refunded: number; verified: boolean; reversed: boolean };
export default async function Transactions({ searchParams }: { searchParams: Promise<{ s?: string; p?: string }> }) {
  const { s = "", p: rawPage = "1" } = await searchParams;
  const page = Math.max(1, Math.min(10000, Number(rawPage) || 1));
  const supabase = await createClient();
  let q = supabase.from("payments_v").select("*").order("paid_at", { ascending: false }).order("id").range((page - 1) * PAGE, page * PAGE);
  if (s === "pending") q = q.eq("verified", false).eq("reversed", false);
  if (s === "verified") q = q.eq("verified", true).eq("reversed", false);
  if (s === "reversed") q = q.eq("reversed", true);
  const [{ data, error }, st, ct] = await Promise.all([q, supabase.from("students").select("id,full_name"), supabase.from("contributions").select("id,name")]);
  if (error) return <ErrorCard />;
  const fetchedRows = (data ?? []) as TransactionRow[];
  const rows = fetchedRows.slice(0, PAGE);
  const more = fetchedRows.length > PAGE;
  const studentRows = (st.data ?? []) as { id: string; full_name: string }[];
  const contributionRows = (ct.data ?? []) as { id: string; name: string }[];
  const sn = new Map(studentRows.map((x) => [x.id, x.full_name]));
  const cn = new Map(contributionRows.map((x) => [x.id, x.name]));
  return (
    <>
      <PageHeader title="Lịch sử giao dịch"><a className="btn-ghost" href="/api/export?type=payments">Xuất CSV</a></PageHeader>
      <nav className="mb-3 flex gap-2 overflow-x-auto" aria-label="Lọc giao dịch">{[["", "Tất cả"], ["pending", "Chờ đối soát"], ["verified", "Đã xác minh"], ["reversed", "Đã đảo"]].map(([v, l]) => (
        <a key={v} href={v ? `?s=${v}` : "?"} aria-current={s === v ? "true" : undefined} className={`btn-ghost whitespace-nowrap ${s === v ? "!border-brand !bg-brand-soft" : ""}`}>{l}</a>))}</nav>
      {!rows.length ? <Empty text="Chưa có giao dịch." /> : <ul className="space-y-2">{rows.map((p) => (
        <li key={p.id} className="card text-sm"><div className="flex justify-between gap-2"><span className="font-medium">{sn.get(p.student_id)}</span><span className="font-medium">{formatVnd(p.amount)}</span></div>
          <p className="text-xs text-slate-500">{cn.get(p.contribution_id)} · {formatDateTime(p.paid_at)} · {METHOD_LABEL[p.method]} · {payStatus(p)}{p.refunded > 0 && ` · đã hoàn ${formatVnd(p.refunded)}`}</p>
          <PaymentActions p={p} /></li>))}</ul>}
      <div className="mt-4 flex justify-between">{page > 1 ? <a className="btn-ghost" href={`?s=${encodeURIComponent(s)}&p=${page - 1}`}>← Trước</a> : <span />}{more && <a className="btn-ghost" href={`?s=${encodeURIComponent(s)}&p=${page + 1}`}>Sau →</a>}</div>
    </>
  );
}

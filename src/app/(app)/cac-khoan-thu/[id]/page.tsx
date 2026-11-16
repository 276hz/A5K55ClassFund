import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/labels";
import { ErrorCard, PageHeader, StatusBadge } from "@/components/ui";
import RpcForm from "@/components/RpcForm";
import { contributionFields } from "@/lib/contribution-fields";

export default async function ContributionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [c, rows, st] = await Promise.all([
    supabase.from("contributions").select("*").eq("id", id).maybeSingle(),
    supabase.from("student_contribution_status").select("*").eq("contribution_id", id).order("full_name"),
    supabase.from("students").select("id,full_name").eq("active", true).order("full_name"),
  ]);
  if (c.error || rows.error) return <ErrorCard />;
  if (!c.data) notFound();
  const k = c.data;
  return (
    <>
      <PageHeader title={k.name} back="/cac-khoan-thu" />
      <p className="mb-3 text-sm text-slate-600">{TYPE_LABEL[k.type]}{k.amount ? ` · ${formatVnd(k.amount)}` : ""}</p>
      <details className="card mb-3"><summary className="cursor-pointer text-sm font-medium">Sửa khoản thu</summary>
        <div className="mt-3"><RpcForm rpc="save_contribution" hidden={{ id: k.id }} submitLabel="Lưu thay đổi" fields={contributionFields(k)} />
          <p className="mt-2 text-xs text-slate-500">Khi đã có giao dịch, không thể đổi loại hoặc số tiền để bảo toàn lịch sử.</p></div></details>
      {k.type !== "fixed" && (
        <details className="card mb-3"><summary className="cursor-pointer text-sm font-medium">{k.type === "custom" ? "Đặt số tiền riêng cho học sinh" : "Miễn đóng / loại trừ"}</summary>
          <div className="mt-3"><RpcForm rpc="set_assignment" hidden={{ contribution_id: k.id }} submitLabel="Lưu" confirm="Lưu thay đổi cho học sinh này?"
            fields={[{ name: "student_id", label: "Học sinh", type: "select", required: true, options: (st.data ?? []).map((s) => ({ value: s.id, label: s.full_name })) },
              { name: "status", label: "Trạng thái", type: "select", options: [{ value: "required", label: "Phải nộp" }, { value: "exempt", label: "Miễn đóng" }, { value: "excluded", label: "Không áp dụng" }] },
              { name: "required_amount", label: "Số tiền phải nộp (khoản tuỳ chỉnh)", type: "money" }, { name: "reason", label: "Lý do", maxLength: 300 }]} /></div></details>)}
      <a className="btn-ghost mb-3 w-full" href={`/api/export?type=status&contribution=${k.id}`}>Xuất CSV khoản này</a>
      <ul className="card divide-y divide-slate-100 p-0">{rows.data!.map((r) => (
        <li key={r.student_id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
          <Link href={`/hoc-sinh/${r.student_id}`} className="min-w-0"><p className="truncate font-medium">{r.full_name}</p>
            <p className="text-xs text-slate-500">Đã thu {formatVnd(r.received_amount)}{r.is_liable ? ` / ${formatVnd(r.effective_required)}` : ""}</p></Link>
          <StatusBadge status={r.status} /></li>))}</ul>
    </>
  );
}

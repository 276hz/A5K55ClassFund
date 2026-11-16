import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/labels";
import { Empty, ErrorCard, PageHeader } from "@/components/ui";
import RpcForm from "@/components/RpcForm";
import { contributionFields } from "@/lib/contribution-fields";

export default async function Contributions() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contributions").select("*").order("created_at", { ascending: false });
  return (
    <>
      <PageHeader title="Các khoản thu" />
      <details className="card mb-3"><summary className="cursor-pointer text-sm font-medium">Tạo khoản thu mới</summary>
        <div className="mt-3"><RpcForm rpc="save_contribution" hidden={{ id: null }} submitLabel="Tạo khoản thu" resetOnSuccess fields={contributionFields()} /></div></details>
      {error ? <ErrorCard /> : !data?.length ? <Empty text="Chưa có khoản thu. Hãy tạo khoản đầu tiên." /> : <ul className="card divide-y divide-slate-100 p-0">{data.map((c) => (
        <li key={c.id}><Link href={`/cac-khoan-thu/${c.id}`} className="flex justify-between gap-2 px-4 py-3 hover:bg-slate-50"><div><p className="font-medium">{c.name}</p>
          <p className="text-xs text-slate-500">{TYPE_LABEL[c.type]}{c.amount ? ` · ${formatVnd(c.amount)}` : ""}{c.due_date ? ` · hạn ${c.due_date}` : ""}</p></div>
          <span className="text-xs text-slate-500">{c.status === "active" ? "Đang thu" : "Đã đóng"}</span></Link></li>))}</ul>}
    </>
  );
}

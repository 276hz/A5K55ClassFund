import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { formatDateTime, METHOD_LABEL, payStatus } from "@/lib/labels";
import { Empty, ErrorCard, PageHeader, StatusBadge } from "@/components/ui";
import RpcForm from "@/components/RpcForm";
import PaymentActions from "@/components/PaymentActions";
import Link from "next/link";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [st, scs, pays, promises, adjs, contribs] = await Promise.all([
    supabase.from("students").select("id,full_name,student_number,active").eq("id", id).maybeSingle(),
    supabase.from("student_contribution_status").select("*").eq("student_id", id),
    supabase.from("payments_v").select("*").eq("student_id", id).order("paid_at", { ascending: false }),
    supabase.from("payment_promises").select("*").eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("adjustments").select("*").eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("contributions").select("id,name,type").order("created_at"),
  ]);
  if (st.error) return <ErrorCard />;
  if (!st.data) notFound();
  const s = st.data;
  const cn = new Map((contribs.data ?? []).map((c) => [c.id, c.name]));
  const opts = (contribs.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const nonVol = (contribs.data ?? []).filter((c) => c.type !== "voluntary").map((c) => ({ value: c.id, label: c.name }));
  return (
    <>
      <PageHeader title={s.full_name} back="/hoc-sinh" />
      {!s.active && <p className="card mb-3 text-sm">Học sinh đã được lưu trữ.</p>}
      <h2 className="mb-2 font-semibold">Các khoản thu</h2>
      {!scs.data?.length ? <Empty text="Chưa có khoản thu." /> : <ul className="card divide-y divide-slate-100 p-0">{scs.data.map((r) => (
        <li key={r.contribution_id} className="px-4 py-3 text-sm"><div className="flex justify-between"><span className="font-medium">{r.contribution_name}</span><StatusBadge status={r.status} /></div>
          <p className="mt-1 text-xs text-slate-600">Phải nộp {formatVnd(r.effective_required)} · đã thu {formatVnd(r.received_amount)} · còn thiếu {formatVnd(r.outstanding_amount)}
            {r.overpaid_amount > 0 && ` · nộp dư ${formatVnd(r.overpaid_amount)}`}{r.pending_amount > 0 && ` · chờ đối soát ${formatVnd(r.pending_amount)}`}</p></li>))}</ul>}
      <Link href={`/ghi-nhan?student=${s.id}`} className="btn-primary mt-3 w-full">Ghi nhận khoản nộp</Link>
      <h2 className="mb-2 mt-6 font-semibold">Lịch sử giao dịch</h2>
      {!pays.data?.length ? <Empty text="Chưa có giao dịch." /> : <ul className="space-y-2">{pays.data.map((p) => (
        <li key={p.id} className="card text-sm"><div className="flex justify-between"><span className="font-medium">{formatVnd(p.amount)} · {cn.get(p.contribution_id)}</span><span className="text-xs text-slate-500">{payStatus(p)}</span></div>
          <p className="text-xs text-slate-500">{formatDateTime(p.paid_at)} · {METHOD_LABEL[p.method]}{p.refunded > 0 && ` · đã hoàn ${formatVnd(p.refunded)}`}</p>
          {p.note && <p className="mt-1 text-xs italic text-slate-600">Ghi chú riêng: {p.note}</p>}
          <PaymentActions p={p} /></li>))}</ul>}
      <h2 className="mb-2 mt-6 font-semibold">Lịch sử hứa nộp</h2>
      {promises.data?.map((p) => <p key={p.id} className="card mb-2 text-sm">{formatVnd(p.amount)}{p.contribution_id && ` · ${cn.get(p.contribution_id)}`}{p.expected_date && ` · dự kiến ${p.expected_date}`}{p.note && ` · ${p.note}`}</p>)}
      <details className="card"><summary className="cursor-pointer text-sm font-medium">Ghi nhận lời hứa nộp</summary><div className="mt-3"><RpcForm rpc="add_promise" hidden={{ student_id: s.id }} submitLabel="Lưu lời hứa" resetOnSuccess
        fields={[{ name: "contribution_id", label: "Khoản thu", type: "select", options: opts, required: true }, { name: "amount", label: "Số tiền hứa", type: "money", required: true }, { name: "expected_date", label: "Ngày dự kiến", type: "date" }, { name: "note", label: "Ghi chú", maxLength: 500 }]} /></div></details>
      {s.active && (<>
        <h2 className="mb-2 mt-6 font-semibold">Miễn đóng, loại trừ, điều chỉnh</h2>
        <details className="card mb-2"><summary className="cursor-pointer text-sm font-medium">Miễn đóng / loại trừ / số tiền riêng</summary><div className="mt-3"><RpcForm rpc="set_assignment" hidden={{ student_id: s.id }} submitLabel="Lưu" confirm="Lưu thay đổi áp dụng cho học sinh này?"
          fields={[{ name: "contribution_id", label: "Khoản thu", type: "select", options: opts, required: true }, { name: "status", label: "Trạng thái", type: "select", options: [{ value: "required", label: "Phải nộp" }, { value: "exempt", label: "Miễn đóng" }, { value: "excluded", label: "Không áp dụng" }] }, { name: "required_amount", label: "Số tiền phải nộp riêng (khoản tuỳ chỉnh)", type: "money" }, { name: "reason", label: "Lý do (bắt buộc khi miễn/loại trừ)", maxLength: 300 }]} /></div></details>
        <details className="card mb-2"><summary className="cursor-pointer text-sm font-medium">Điều chỉnh giảm số tiền phải nộp</summary><div className="mt-3"><RpcForm rpc="add_adjustment" hidden={{ student_id: s.id }} submitLabel="Ghi điều chỉnh" confirm="Điều chỉnh sẽ làm giảm số tiền phải nộp và không thể xoá."
          fields={[{ name: "contribution_id", label: "Khoản thu", type: "select", options: nonVol, required: true }, { name: "amount", label: "Số tiền giảm", type: "money", required: true }, { name: "reason", label: "Lý do", required: true, maxLength: 300 }]} /></div></details>
        {adjs.data?.map((a) => <p key={a.id} className="mb-1 text-xs text-slate-600">Điều chỉnh −{formatVnd(a.amount)} · {cn.get(a.contribution_id)} · {a.reason}</p>)}
        <h2 className="mb-2 mt-6 font-semibold">Thông tin học sinh</h2>
        <details className="card mb-2"><summary className="cursor-pointer text-sm font-medium">Sửa thông tin</summary><div className="mt-3"><RpcForm rpc="update_student" hidden={{ id: s.id }} submitLabel="Lưu"
          fields={[{ name: "full_name", label: "Họ và tên", required: true, defaultValue: s.full_name, maxLength: 120 }, { name: "student_number", label: "Mã học sinh", defaultValue: s.student_number ?? "", maxLength: 30 }]} /></div></details>
        <details className="card"><summary className="cursor-pointer text-sm font-medium text-red-700">Lưu trữ học sinh</summary><div className="mt-3"><RpcForm rpc="archive_student" hidden={{ id: s.id }} submitLabel="Lưu trữ" danger confirm="Học sinh sẽ bị ẩn khỏi danh sách; lịch sử giao dịch vẫn được giữ."
          fields={[{ name: "reason", label: "Lý do", required: true, maxLength: 300 }]} /></div></details></>)}
    </>
  );
}

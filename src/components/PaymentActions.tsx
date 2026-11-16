import RpcForm from "./RpcForm";
import { formatVnd } from "@/lib/money";

export default function PaymentActions({ p }: { p: { id: string; amount: number; refunded: number; verified: boolean; reversed: boolean } }) {
  if (p.reversed) return null;
  const refundable = p.amount - p.refunded;
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-sm">
      {!p.verified && (
        <details className="w-full"><summary className="btn-ghost cursor-pointer">Đối soát</summary>
          <div className="mt-2"><RpcForm rpc="reconcile_payment" hidden={{ payment_id: p.id }} submitLabel="Xác nhận đã nhận tiền" confirm="Xác nhận đã nhận đủ khoản chuyển khoản này vào tài khoản?"
            fields={[{ name: "note", label: "Ghi chú đối soát", maxLength: 300 }]} /></div></details>)}
      {p.verified && refundable > 0 && (
        <details className="w-full"><summary className="btn-ghost cursor-pointer">Hoàn tiền</summary>
          <div className="mt-2"><RpcForm rpc="refund_payment" hidden={{ payment_id: p.id }} submitLabel="Hoàn tiền" danger confirm={`Hoàn tiền cho giao dịch này (tối đa ${formatVnd(refundable)})?`}
            fields={[{ name: "amount", label: `Số tiền hoàn (tối đa ${formatVnd(refundable)})`, type: "money", required: true, defaultValue: String(refundable) }, { name: "reason", label: "Lý do", required: true, maxLength: 300 }]} /></div></details>)}
      {p.refunded === 0 && (
        <details className="w-full"><summary className="btn-danger cursor-pointer">Đảo giao dịch</summary>
          <div className="mt-2"><RpcForm rpc="reverse_payment" hidden={{ payment_id: p.id }} submitLabel="Đảo giao dịch" danger confirm="Giao dịch sẽ không còn được tính là tiền đã thu. Lịch sử vẫn được giữ lại."
            fields={[{ name: "reason", label: "Lý do", required: true, maxLength: 300 }]} /></div></details>)}
    </div>
  );
}

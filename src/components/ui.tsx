import Link from "next/link";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/labels";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_TONE[status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>{STATUS_LABEL[status] ?? status}</span>;
}
export function PageHeader({ title, back, children }: { title: string; back?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <div>{back && <Link href={back} className="text-sm text-brand">← Quay lại</Link>}<h1 className="text-xl font-semibold">{title}</h1></div>
      {children}
    </div>
  );
}
export function ErrorCard({ text = "Không tải được dữ liệu. Vui lòng thử lại." }: { text?: string }) {
  return <div role="alert" className="card text-sm text-red-700">{text}</div>;
}
export function Empty({ text }: { text: string }) {
  return <div className="card text-center text-sm text-slate-500">{text}</div>;
}
export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone ?? ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

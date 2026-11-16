import Link from "next/link";
import { PageHeader } from "@/components/ui";
import SignOutButton from "@/components/SignOutButton";

export default function More() {
  return (
    <>
      <PageHeader title="Khác" />
      <ul className="card divide-y divide-slate-100 p-0">{[["/cac-khoan-thu", "Các khoản thu"], ["/bao-cao", "Báo cáo"], ["/nhat-ky", "Nhật ký hoạt động"], ["/cai-dat", "Cài đặt"]].map(([h, l]) => (
        <li key={h}><Link href={h} className="block px-4 py-4 text-sm font-medium hover:bg-slate-50">{l}</Link></li>))}</ul>
      <div className="mt-4"><SignOutButton /></div>
    </>
  );
}

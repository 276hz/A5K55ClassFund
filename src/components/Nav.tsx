"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, HandCoins, Receipt, Menu } from "lucide-react";

const MAIN = [
  { href: "/tong-quan", label: "Tổng quan", Icon: LayoutDashboard },
  { href: "/hoc-sinh", label: "Học sinh", Icon: Users },
  { href: "/ghi-nhan", label: "Ghi nhận", Icon: HandCoins },
  { href: "/giao-dich", label: "Giao dịch", Icon: Receipt },
  { href: "/khac", label: "Khác", Icon: Menu },
];
const DESKTOP = [
  ["/tong-quan", "Tổng quan"], ["/hoc-sinh", "Học sinh"], ["/cac-khoan-thu", "Các khoản thu"], ["/ghi-nhan", "Ghi nhận khoản nộp"],
  ["/giao-dich", "Lịch sử giao dịch"], ["/bao-cao", "Báo cáo"], ["/nhat-ky", "Nhật ký hoạt động"], ["/cai-dat", "Cài đặt"],
];

export default function Nav() {
  const path = usePathname();
  const active = (h: string) => path === h || path.startsWith(h + "/");
  return (
    <>
      <nav aria-label="Điều hướng chính" className="hidden border-b border-slate-200 bg-white md:block">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-1 px-4 py-2">
          {DESKTOP.map(([h, l]) => (
            <Link key={h} href={h} aria-current={active(h) ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm ${active(h) ? "bg-brand-soft font-medium text-brand-dark" : "text-slate-600 hover:bg-slate-100"}`}>{l}</Link>
          ))}
        </div>
      </nav>
      <nav aria-label="Điều hướng chính" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-5">
          {MAIN.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${active(href) ? "font-medium text-brand" : "text-slate-500"}`}>
                <Icon size={20} aria-hidden />{label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

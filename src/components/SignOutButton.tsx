"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button className="btn-ghost w-full" onClick={async () => { await createClient().auth.signOut(); router.replace("/login"); router.refresh(); }}>
      <LogOut size={16} aria-hidden /> Đăng xuất
    </button>
  );
}

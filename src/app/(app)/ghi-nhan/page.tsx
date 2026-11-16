import { createClient } from "@/lib/supabase/server";
import { ErrorCard, PageHeader, Empty } from "@/components/ui";
import QuickEntry from "@/components/QuickEntry";

export default async function RecordPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { student } = await searchParams;
  const supabase = await createClient();
  const [st, ct, rows] = await Promise.all([
    supabase.from("students").select("id,full_name").eq("active", true).order("full_name"),
    supabase.from("contributions").select("id,name,type").eq("status", "active").order("created_at"),
    supabase.from("student_contribution_status").select("student_id,contribution_id,outstanding_amount,status"),
  ]);
  if (st.error || ct.error || rows.error) return <ErrorCard />;
  const initial = student && st.data.some((s) => s.id === student) ? student : undefined;
  return (
    <>
      <PageHeader title="Ghi nhận khoản nộp" />
      {ct.data.length === 0 ? <Empty text="Chưa có khoản thu đang mở. Hãy tạo khoản thu trước." /> : st.data.length === 0 ? <Empty text="Chưa có học sinh." /> :
        <QuickEntry students={st.data} contributions={ct.data} rows={rows.data} initialStudent={initial} />}
    </>
  );
}

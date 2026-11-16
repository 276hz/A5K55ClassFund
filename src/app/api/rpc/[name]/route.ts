import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeTreasurer, sameOrigin } from "@/lib/auth";
import { isRpcName, rpcSchemas, toRpcArgs } from "@/lib/schemas";
import { mapDbError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

const fail = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!sameOrigin(req)) return fail(403, "Yêu cầu không hợp lệ.");
  const supabase = await createClient();
  const auth = await authorizeTreasurer(supabase);
  if (!auth.ok) return fail(auth.status, auth.message);
  const { data: accountProfile, error: profileError } = await supabase.from("profiles").select("must_change_password").eq("id", auth.userId).maybeSingle();
  if (profileError || !accountProfile) return fail(403, "Tài khoản chưa được thiết lập đầy đủ.");
  if (accountProfile.must_change_password) return fail(428, "Hãy đổi mật khẩu khởi tạo trước khi sử dụng ClassFund.");
  if (!rateLimit(`rpc:${auth.userId}`)) return fail(429, "Thao tác quá nhanh. Vui lòng thử lại sau ít phút.");
  if (!isRpcName(name)) return fail(404, "Không tìm thấy thao tác.");
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail(415, "Định dạng không hỗ trợ.");
  const raw = await req.text();
  if (raw.length > 200_000) return fail(413, "Dữ liệu quá lớn.");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail(400, "JSON không hợp lệ."); }
  const parsed = rpcSchemas[name].safeParse(body);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.");
  const { data, error } = await supabase.rpc(name, toRpcArgs(parsed.data as Record<string, unknown>));
  if (error) {
    const m = mapDbError(error);
    return fail(m.status, m.message);
  }
  // Chỉ báo thành công sau khi CSDL đã commit (rpc trả về không lỗi).
  return NextResponse.json({ ok: true, data });
}

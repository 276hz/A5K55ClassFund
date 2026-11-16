export type AuthClient = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};
export type AuthResult = { ok: true; userId: string } | { ok: false; status: 401 | 403; message: string };

/** 401 nếu chưa đăng nhập; 403 nếu đã đăng nhập nhưng không phải thủ quỹ. */
export async function authorizeTreasurer(client: AuthClient): Promise<AuthResult> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { ok: false, status: 401, message: "Vui lòng đăng nhập." };
  const { data: isT, error: e2 } = await client.rpc("is_treasurer");
  if (e2 || isT !== true) return { ok: false, status: 403, message: "Bạn không có quyền truy cập." };
  return { ok: true, userId: data.user.id };
}

export function sameOrigin(req: { headers: { get(n: string): string | null } }): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export function safeNext(next: string | null): string {
  return next && /^\/(?!\/)[\w\-/]*$/.test(next) ? next : "/tong-quan";
}

export type ApiResult = { ok: boolean; message?: string; data?: unknown };
export async function postRpc(name: string, body: Record<string, unknown>): Promise<ApiResult> {
  try {
    const res = await fetch(`/api/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as ApiResult;
    if (res.status === 401) { window.location.href = "/login"; return { ok: false, message: "Phiên đăng nhập đã hết hạn." }; }
    return res.ok && json.ok ? json : { ok: false, message: json.message ?? "Thao tác không thành công." };
  } catch {
    return { ok: false, message: "Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại." };
  }
}

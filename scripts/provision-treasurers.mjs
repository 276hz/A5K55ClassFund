#!/usr/bin/env node
// Creates or verifies the two ClassFund treasurer accounts. Run locally, never in Workers.
// Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// Optional: --reset-passwords rotates both passwords and re-enables first-login change.
import { randomBytes } from "node:crypto";

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resetPasswords = process.argv.includes("--reset-passwords");
const domain = "login.classfund.invalid";
const accounts = [
  { username: "thuydung", full_name: "Đặng Thùy Dung" },
  { username: "thuytrang", full_name: "Nguyễn Thùy Trang" },
];
const fail = (message) => { console.error(`Lỗi: ${message}`); process.exit(1); };
if (!url || !/^https:\/\//.test(url) || !key) fail("Cần SUPABASE_URL (hoặc NEXT_PUBLIC_SUPABASE_URL) và SUPABASE_SERVICE_ROLE_KEY.");

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
async function call(path, init = {}) {
  const response = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const bodyText = await response.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = bodyText; }
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);
  return body;
}
async function listUsers() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const data = await call(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = data?.users || [];
    out.push(...users);
    if (users.length < 200) break;
  }
  return out;
}
async function findUser(email) {
  return (await listUsers()).find((user) => user.email?.toLowerCase() === email.toLowerCase()) || null;
}

async function ensureAccount(account) {
  const email = `${account.username}@${domain}`;
  let user = await findUser(email);
  let profiles = user
    ? await call(`/rest/v1/profiles?id=eq.${user.id}&select=id,username,must_change_password`)
    : [];
  if (!Array.isArray(profiles)) fail(`Không đọc được profile của ${account.username}.`);
  if (profiles[0]?.username && profiles[0].username !== account.username) {
    fail(`Username của ${account.full_name} đã được gán khác. Không tự ghi đè.`);
  }

  // If the auth user exists but profile provisioning did not finish, rotate the
  // password and print a fresh one-time credential rather than leaving it unknown.
  const shouldReset = !user || resetPasswords || profiles.length === 0 || !profiles[0]?.username;
  let temporaryPassword = null;
  if (shouldReset) {
    temporaryPassword = `${randomBytes(24).toString("base64url")}A9!`;
    if (user) {
      user = await call(`/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ password: temporaryPassword, email_confirm: true,
          app_metadata: { classfund_account: true, must_change_password: true } }),
      });
    } else {
      user = await call("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, password: temporaryPassword, email_confirm: true,
          user_metadata: { username: account.username, full_name: account.full_name },
          app_metadata: { classfund_account: true, must_change_password: true } }),
      });
    }
    if (!user?.id) fail(`Không xác định được user ID cho ${account.username}.`);
    // Print immediately so a later profile/role error cannot lose the only copy.
    console.log(`\nĐã tạo/cấp lại ${account.full_name} — username: ${account.username}`);
    console.log(`MẬT KHẨU TẠM (chỉ hiển thị lần này): ${temporaryPassword}\n`);
  }
  if (!user?.id) fail(`Không xác định được user ID cho ${account.username}.`);

  const provisionedAt = user.updated_at || new Date().toISOString();
  if (profiles.length === 0) {
    await call("/rest/v1/profiles", { method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ id: user.id, full_name: account.full_name, username: account.username,
        must_change_password: true, password_provisioned_at: provisionedAt }) });
  } else {
    const patch = { full_name: account.full_name, username: account.username };
    if (shouldReset) { patch.must_change_password = true; patch.password_provisioned_at = provisionedAt; }
    await call(`/rest/v1/profiles?id=eq.${user.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
  }

  const roles = await call("/rest/v1/user_roles?select=user_id,role");
  const current = roles.find((row) => row.user_id === user.id && row.role === "treasurer");
  if (!current) {
    if (roles.length >= 2) fail("Đã có đủ hai vai trò thủ quỹ được cấp. Hãy kiểm tra user_roles trước khi tiếp tục.");
    await call("/rest/v1/user_roles", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: user.id, role: "treasurer" }) });
  }
  return { ...account, temporaryPassword };
}

try {
  const results = [];
  for (const account of accounts) results.push(await ensureAccount(account));
  console.log("\nĐÃ XÁC MINH HAI TÀI KHOẢN CLASSFUND");
  for (const result of results) {
    console.log(`- ${result.full_name}: ${result.username}${result.temporaryPassword ? " (đã cấp mật khẩu tạm ở phía trên)" : " (giữ nguyên mật khẩu hiện tại)"}`);
  }
  console.log("\nLần đăng nhập đầu tiên sau khi cấp/reset sẽ yêu cầu đổi mật khẩu. Không gửi thông tin này vào nhóm lớp.");
  if (!resetPasswords && results.every((r) => !r.temporaryPassword)) {
    console.log("Muốn cấp lại mật khẩu khởi tạo cho cả hai: npm run provision -- --reset-passwords");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : "Không thể cấp tài khoản.");
}

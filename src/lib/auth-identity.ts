export const AUTH_EMAIL_DOMAIN = "login.classfund.invalid";

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return /^[a-z][a-z0-9_]{2,31}$/.test(value);
}

export function usernameToAuthEmail(value: string): string | null {
  const username = normalizeUsername(value);
  if (!isValidUsername(username)) return null;
  return `${username}@${AUTH_EMAIL_DOMAIN}`;
}

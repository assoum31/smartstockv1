// Account naming rules shared by the browser and the server.
// Workers sign in with a store code + username. Behind the scenes each
// account gets a private, never-emailed address built from both, so the
// same username can exist in two different stores.

export const MASTER_CODE = "admin";
export const EMAIL_DOMAIN = "stockipro.app";
export const MIN_PASSWORD_LENGTH = 6;
export const PIN_LENGTH = 6;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_TTL_DAYS = 7;

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;
export const STORE_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;
export const PIN_PATTERN = /^\d{6}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeStoreCode(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string) {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function isValidStoreCode(value: string) {
  const code = normalizeStoreCode(value);
  return code !== MASTER_CODE && STORE_CODE_PATTERN.test(code);
}

export function accountEmail(storeCode: string, username: string) {
  return `${normalizeUsername(username)}@${normalizeStoreCode(storeCode)}.${EMAIL_DOMAIN}`;
}

/** The one master account. Its first sign-in uses admin / admin, then a new password is required. */
export const MASTER_USERNAME = "admin";
export const DEFAULT_MASTER_PASSWORD = "admin";

export function isDefaultMasterLogin(username: string, password: string) {
  return normalizeUsername(username) === MASTER_USERNAME && password === DEFAULT_MASTER_PASSWORD;
}

/** Each kind of account has its own sign-in page. */
export type Portal = "manager" | "worker";

export function portalFor(roles: readonly string[]): Portal | "master" {
  if (roles.includes("master")) return "master";
  return roles.includes("manager") ? "manager" : "worker";
}

export function portalAccepts(portal: Portal, roles: readonly string[]) {
  return portalFor(roles) === portal;
}

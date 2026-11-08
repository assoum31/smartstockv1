// Server-only helpers for accounts and one-time activation PINs.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PIN_LENGTH, PIN_TTL_DAYS, accountEmail } from "./identity";

type Admin = SupabaseClient<Database>;
type Role = Database["public"]["Enums"]["app_role"];

const ITERATIONS = 60_000;

function toHex(buf: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(secret: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashSecret(secret: string) {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${await derive(secret, salt)}`;
}

export async function verifySecret(secret: string, stored: string) {
  const [, , saltHex, hash] = stored.split("$");
  if (!saltHex || !hash) return false;
  const candidate = await derive(secret, fromHex(saltHex));
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export function randomPin() {
  const values = crypto.getRandomValues(new Uint32Array(PIN_LENGTH));
  return Array.from(values, (v) => String(v % 10)).join("");
}

/** A long random password nobody knows, used until the person activates. */
export function randomPassword() {
  return toHex(crypto.getRandomValues(new Uint8Array(24)));
}

export async function issuePin(admin: Admin, userId: string) {
  const pin = randomPin();
  const expires = new Date(Date.now() + PIN_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const { error } = await admin.from("worker_activations").upsert({
    user_id: userId,
    pin_hash: await hashSecret(pin),
    expires_at: expires,
    attempts: 0,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`pin_failed: ${error.message}`);
  return { pin, expiresAt: expires };
}

export async function createAccount(
  admin: Admin,
  input: {
    tenantId: string | null;
    storeCode: string;
    username: string;
    fullName: string;
    role: Role;
    password?: string;
  },
) {
  const email = accountEmail(input.storeCode, input.username);
  const activated = Boolean(input.password);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password ?? randomPassword(),
    email_confirm: true,
    app_metadata: { tenant_id: input.tenantId, role: input.role },
    user_metadata: { full_name: input.fullName, username: input.username },
  });
  if (error || !data.user) {
    const msg = error?.message ?? "";
    if (/already|exists|registered/i.test(msg))
      return { ok: false as const, reason: "username_taken" };
    if (error?.name === "AuthWeakPasswordError" || /weak|pwned|guess/i.test(msg))
      return { ok: false as const, reason: "weak_password" };
    console.error("createUser failed", error);
    return { ok: false as const, reason: "create_failed" };
  }
  const userId = data.user.id;

  const rollback = async () => {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  };

  const { error: profileErr } = await admin.from("profiles").insert({
    id: userId,
    tenant_id: input.tenantId,
    username: input.username,
    full_name: input.fullName,
    must_activate: !activated,
  });
  if (profileErr) {
    await rollback();
    if (profileErr.code === "23505") return { ok: false as const, reason: "username_taken" };
    console.error("profile insert failed", profileErr);
    return { ok: false as const, reason: "create_failed" };
  }

  const { error: roleErr } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: input.role });
  if (roleErr) {
    await rollback();
    console.error("role insert failed", roleErr);
    return { ok: false as const, reason: "create_failed" };
  }

  if (activated) return { ok: true as const, userId, pin: null, expiresAt: null };
  const { pin, expiresAt } = await issuePin(admin, userId);
  return { ok: true as const, userId, pin, expiresAt };
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MASTER_CODE,
  MASTER_MIN_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PIN_MAX_ATTEMPTS,
  PIN_PATTERN,
  STORE_CODE_PATTERN,
  MASTER_USERNAME,
  USERNAME_PATTERN,
  accountEmail,
  isDefaultMasterLogin,
  normalizeStoreCode,
  normalizeUsername,
  portalFor,
} from "./identity";
import { createAccount, issuePin, randomPassword, verifySecret } from "./accounts.server";

const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .refine((v) => USERNAME_PATTERN.test(v), "invalid_username");
const storeCodeSchema = z
  .string()
  .transform(normalizeStoreCode)
  .refine((v) => v !== MASTER_CODE && STORE_CODE_PATTERN.test(v), "invalid_store_code");
const fullNameSchema = z.string().trim().min(2).max(80);
export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(128);
export const masterPasswordSchema = z.string().min(MASTER_MIN_PASSWORD_LENGTH).max(128);

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AuthedCtx = {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
  userId: string;
};

/** Who is calling, read with the caller's own permissions. */
async function callerScope(ctx: AuthedCtx) {
  const [{ data: roles }, { data: profile }] = await Promise.all([
    ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId),
    ctx.supabase.from("profiles").select("tenant_id, is_active").eq("id", ctx.userId).maybeSingle(),
  ]);
  const list = (roles ?? []).map((r) => r.role);
  const active = profile?.is_active !== false;
  return {
    isMaster: active && list.includes("master"),
    isManager: active && list.includes("manager") && Boolean(profile?.tenant_id),
    tenantId: profile?.tenant_id ?? null,
  };
}

/** Manager of the member's store, or master. Returns the member's profile. */
async function authorizeOverMember(ctx: AuthedCtx, memberId: string) {
  const scope = await callerScope(ctx);
  const admin = await loadAdmin();
  const { data: member } = await admin
    .from("profiles")
    .select("id, tenant_id, username, full_name")
    .eq("id", memberId)
    .maybeSingle();
  if (!member || !member.tenant_id) throw new Error("not_found");
  if (!scope.isMaster && !(scope.isManager && scope.tenantId === member.tenant_id)) {
    throw new Error("forbidden");
  }
  return { admin, member, scope };
}

// ---------- The single master account (private /master page) ----------

type AdminClient = Awaited<ReturnType<typeof loadAdmin>>;

/** No master yet, an unclaimed one still waiting for its password, or a claimed one. */
async function masterClaimState(admin: AdminClient) {
  const { data: masters } = await admin.from("user_roles").select("user_id").eq("role", "master");
  const ids = (masters ?? []).map((m) => m.user_id);
  if (ids.length === 0) return { kind: "none" as const };
  const { data: waiting } = await admin
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("must_activate", true)
    .limit(1)
    .maybeSingle();
  return waiting
    ? { kind: "unclaimed" as const, userId: waiting.id }
    : { kind: "claimed" as const };
}

/** Whether admin / admin still opens the "choose your password" step. */
export const checkDefaultMaster = createServerFn({ method: "POST" })
  .validator((d) => z.object({ username: z.string(), password: z.string() }).parse(d))
  .handler(async ({ data }) => {
    if (!isDefaultMasterLogin(data.username, data.password)) return { claimable: false };
    const state = await masterClaimState(await loadAdmin());
    return { claimable: state.kind !== "claimed" };
  });

/**
 * First sign-in of the master with the default credentials. Creates the master
 * (or takes over the unclaimed one) and sets the password the owner chooses,
 * so the default password never works as a real password.
 */
export const claimMaster = createServerFn({ method: "POST" })
  .validator((d) =>
    z.object({ username: z.string(), password: z.string(), newPassword: masterPasswordSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const fail = { ok: false as const, reason: "invalid_login" };
    if (!isDefaultMasterLogin(data.username, data.password)) return fail;
    if (isDefaultMasterLogin(MASTER_USERNAME, data.newPassword))
      return { ok: false as const, reason: "weak_password" };
    const admin = await loadAdmin();

    const state = await masterClaimState(admin);
    if (state.kind === "none") {
      const res = await createAccount(admin, {
        tenantId: null,
        storeCode: MASTER_CODE,
        username: MASTER_USERNAME,
        fullName: "المدير العام",
        role: "master",
        password: data.newPassword,
      });
      return res.ok ? { ok: true as const } : { ok: false as const, reason: res.reason };
    }
    if (state.kind === "claimed") return fail;
    const profile = { id: state.userId };

    const { error } = await admin.auth.admin.updateUserById(profile.id, {
      email: accountEmail(MASTER_CODE, MASTER_USERNAME),
      email_confirm: true,
      password: data.newPassword,
    });
    if (error) {
      console.error("master claim failed", error);
      const weak =
        error.name === "AuthWeakPasswordError" || /weak|pwned|guess/i.test(error.message);
      return { ok: false as const, reason: weak ? "weak_password" : "failed" };
    }
    await admin
      .from("profiles")
      .update({ username: MASTER_USERNAME, must_activate: false })
      .eq("id", profile.id);
    return { ok: true as const };
  });

// ---------- Activation with the one-time PIN (public) ----------

export const activateAccount = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        storeCode: z.string().transform(normalizeStoreCode),
        username: z.string().transform(normalizeUsername),
        pin: z.string().regex(PIN_PATTERN),
        password: passwordSchema,
        portal: z.enum(["manager", "worker"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const fail = { ok: false as const, reason: "invalid_pin" };
    if (data.storeCode === MASTER_CODE) return fail;
    const admin = await loadAdmin();

    const { data: tenant } = await admin
      .from("tenants")
      .select("id, is_active")
      .eq("code", data.storeCode)
      .maybeSingle();
    if (!tenant) return fail;

    const { data: profile } = await admin
      .from("profiles")
      .select("id, is_active, must_activate")
      .eq("tenant_id", tenant.id)
      .eq("username", data.username)
      .maybeSingle();
    if (!profile || !profile.is_active || !profile.must_activate) return fail;

    const { data: activation } = await admin
      .from("worker_activations")
      .select("pin_hash, expires_at")
      .eq("user_id", profile.id)
      .maybeSingle();
    if (!activation) return fail;

    const { data: claimedAttempt } = await admin.rpc("claim_pin_attempt", {
      _user_id: profile.id,
      _max: PIN_MAX_ATTEMPTS,
    });
    if (claimedAttempt === null) return fail;
    if (new Date(activation.expires_at).getTime() < Date.now()) return fail;

    const good = await verifySecret(data.pin, activation.pin_hash);
    if (!good) return fail;
    // Correct PIN, but the store is suspended: say so, and keep the PIN usable for later.
    if (!tenant.is_active) return { ok: false as const, reason: "store_suspended" };

    // Managers and workers each activate on their own page; keep the PIN for the right one.
    if (data.portal) {
      const { data: roleRows } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", profile.id);
      const portal = portalFor((roleRows ?? []).map((r) => r.role));
      if (portal !== data.portal) {
        return {
          ok: false as const,
          reason: portal === "manager" ? "use_manager_page" : "use_worker_page",
        };
      }
    }

    const { error: pwErr } = await admin.auth.admin.updateUserById(profile.id, {
      password: data.password,
    });
    if (pwErr) {
      console.error("activation password update failed", pwErr);
      return {
        ok: false as const,
        reason: pwErr.message.toLowerCase().includes("weak") ? "weak_password" : "failed",
      };
    }
    await admin.from("profiles").update({ must_activate: false }).eq("id", profile.id);
    await admin.from("worker_activations").delete().eq("user_id", profile.id);
    return { ok: true as const };
  });

// ---------- Master: stores ----------

export const createStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        code: storeCodeSchema,
        managerUsername: usernameSchema,
        managerFullName: fullNameSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const scope = await callerScope(context);
    if (!scope.isMaster) throw new Error("forbidden");
    const admin = await loadAdmin();
    const { data: tenant, error } = await admin
      .from("tenants")
      .insert({ name: data.name, code: data.code })
      .select("id, code")
      .single();
    if (error || !tenant) {
      if (error?.code === "23505") return { ok: false as const, reason: "code_taken" };
      console.error("store insert failed", error);
      return { ok: false as const, reason: "failed" };
    }
    const res = await createAccount(admin, {
      tenantId: tenant.id,
      storeCode: tenant.code,
      username: data.managerUsername,
      fullName: data.managerFullName,
      role: "manager",
    });
    if (!res.ok) {
      // Store stays (soft-deletable), but report the manager problem.
      return { ok: false as const, reason: res.reason, storeCreated: true };
    }
    return {
      ok: true as const,
      storeCode: tenant.code,
      username: data.managerUsername,
      pin: res.pin,
      expiresAt: res.expiresAt,
    };
  });

export const setStoreActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ storeId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await callerScope(context);
    if (!scope.isMaster) throw new Error("forbidden");
    const admin = await loadAdmin();
    const { error } = await admin
      .from("tenants")
      .update({ is_active: data.active })
      .eq("id", data.storeId);
    if (error) throw error;
    return { ok: true as const };
  });

// ---------- Managers (and master): team ----------

export const createMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        username: usernameSchema,
        fullName: fullNameSchema,
        role: z.enum(["worker", "manager", "cashier", "pricer", "observer", "auditor", "sales_manager", "storekeeper"]),
        storeId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const scope = await callerScope(context);
    const tenantId =
      scope.isMaster && data.storeId ? data.storeId : scope.isManager ? scope.tenantId : null;
    if (!tenantId) throw new Error("forbidden");
    const admin = await loadAdmin();
    const { data: tenant } = await admin
      .from("tenants")
      .select("id, code")
      .eq("id", tenantId)
      .single();
    if (!tenant) throw new Error("not_found");
    const res = await createAccount(admin, {
      tenantId,
      storeCode: tenant.code,
      username: data.username,
      fullName: data.fullName,
      role: data.role,
    });
    if (!res.ok) return { ok: false as const, reason: res.reason };
    return {
      ok: true as const,
      storeCode: tenant.code,
      username: data.username,
      pin: res.pin,
      expiresAt: res.expiresAt,
    };
  });

export const resetMemberPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, member } = await authorizeOverMember(context, data.memberId);
    if (member.id === context.userId) throw new Error("forbidden");
    // Old password stops working; the person must activate again with the new PIN.
    const { error: resetErr } = await admin.auth.admin.updateUserById(member.id, { password: randomPassword() });
    if (resetErr) throw new Error("failed");
    const { error: profileErr } = await admin.from("profiles").update({ must_activate: true }).eq("id", member.id);
    if (profileErr) throw new Error("failed");
    const { pin, expiresAt } = await issuePin(admin, member.id);
    const { data: tenant } = await admin
      .from("tenants")
      .select("code")
      .eq("id", member.tenant_id!)
      .single();
    return {
      ok: true as const,
      storeCode: tenant?.code ?? "",
      username: member.username,
      pin,
      expiresAt,
    };
  });

export const setMemberActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ memberId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, member } = await authorizeOverMember(context, data.memberId);
    if (member.id === context.userId) throw new Error("forbidden");
    const { error: banErr } = await admin.auth.admin.updateUserById(member.id, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (banErr) throw new Error("failed");
    const { error: profileErr } = await admin.from("profiles").update({ is_active: data.active }).eq("id", member.id);
    if (profileErr) throw new Error("failed");
    return { ok: true as const };
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        memberId: z.string().uuid(),
        fullName: fullNameSchema,
        role: z.enum(["worker", "manager", "cashier", "pricer", "observer", "auditor", "sales_manager", "storekeeper"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, member } = await authorizeOverMember(context, data.memberId);
    if (member.id === context.userId) throw new Error("forbidden");
    const { error: pErr } = await admin
      .from("profiles")
      .update({ full_name: data.fullName })
      .eq("id", member.id);
    if (pErr) throw new Error("failed");
    const { error: dErr } = await admin.from("user_roles").delete().eq("user_id", member.id);
    if (dErr) throw new Error("failed");
    const { error: rErr } = await admin
      .from("user_roles")
      .insert({ user_id: member.id, role: data.role });
    if (rErr) throw new Error("failed");
    return { ok: true as const };
  });

export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, member } = await authorizeOverMember(context, data.memberId);
    if (member.id === context.userId) throw new Error("forbidden");
    await admin.from("worker_activations").delete().eq("user_id", member.id);
    await admin.from("user_roles").delete().eq("user_id", member.id);
    const { error } = await admin.auth.admin.deleteUser(member.id);
    if (error) {
      console.error("delete member failed", error);
      throw new Error("failed");
    }
    await admin.from("profiles").delete().eq("id", member.id);
    return { ok: true as const };
  });

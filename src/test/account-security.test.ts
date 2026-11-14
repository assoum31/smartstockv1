import { describe, expect, it } from "vitest";
import {
  MASTER_MIN_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/identity";
import { masterPasswordSchema, passwordSchema } from "@/lib/accounts.functions";

describe("account password policy", () => {
  it("requires 10 characters for new account passwords", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(passwordSchema.safeParse("a".repeat(9)).success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(10)).success).toBe(true);
  });

  it("requires 12 characters for the master's new password", () => {
    expect(MASTER_MIN_PASSWORD_LENGTH).toBe(12);
    expect(masterPasswordSchema.safeParse("a".repeat(11)).success).toBe(false);
    expect(masterPasswordSchema.safeParse("a".repeat(12)).success).toBe(true);
  });
});

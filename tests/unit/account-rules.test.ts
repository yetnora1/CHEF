import { describe, expect, it } from "vitest";
import {
  emailChangeStatus,
  isValidUsername,
  normaliseUsername,
  passwordProblem,
} from "@/features/account/rules";
import { signInBucket } from "@/features/auth/sign-in-limits";

describe("usernames", () => {
  it("are compared in lower case, without surrounding spaces", () => {
    expect(normaliseUsername("  Chef.SIS ")).toBe("chef.sis");
  });

  it("can never look like an email address, which is how the sign-in form tells them apart", () => {
    expect(isValidUsername("chef@example.test")).toBe(false);
    expect(isValidUsername("@chef")).toBe(false);
  });
});

describe("the password policy", () => {
  it("accepts a long, mixed password", () => {
    expect(passwordProblem("Fresh-Kitchen-Salt-42")).toBeNull();
    expect(passwordProblem("Abcdefghijk1")).toBeNull();
  });

  it("refuses anything under 12 characters", () => {
    expect(passwordProblem("Abcdefghij1")).toBe("passwordTooShort");
    expect(passwordProblem("")).toBe("passwordTooShort");
  });

  it("asks for upper case, lower case and a number", () => {
    expect(passwordProblem("alllowercase1234")).toBe("passwordNeedsMix");
    expect(passwordProblem("ALLUPPERCASE1234")).toBe("passwordNeedsMix");
    expect(passwordProblem("NoNumbersAtAllHere")).toBe("passwordNeedsMix");
  });

  it("refuses what Auth would silently cut short at 72 bytes, counting bytes and not characters", () => {
    expect(passwordProblem(`Aa1${"x".repeat(69)}`)).toBeNull();
    expect(passwordProblem(`Aa1${"x".repeat(70)}`)).toBe("passwordTooLong");
    expect(passwordProblem(`Aa1${"የ".repeat(24)}`)).toBe("passwordTooLong");
  });
});

describe("where an email change stands", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const current = "old@example.test";
  const next = "new@example.test";

  it("is nothing when no change was asked for", () => {
    expect(emailChangeStatus({ email: current }, now)).toEqual({ pendingEmail: null, lapsedEmail: null });
  });

  it("is waiting while a link sent recently can still work", () => {
    const user = { email: current, new_email: next, email_change_sent_at: "2026-11-04T11:00:00Z" };
    expect(emailChangeStatus(user, now)).toEqual({ pendingEmail: next, lapsedEmail: null });
  });

  it("has lapsed once a password change cancelled the link, which Auth shows by clearing when it was sent", () => {
    expect(emailChangeStatus({ email: current, new_email: next }, now)).toEqual({
      pendingEmail: null,
      lapsedEmail: next,
    });
  });

  it("has lapsed once the link is too old to work", () => {
    const user = { email: current, new_email: next, email_change_sent_at: "2026-11-03T11:00:00Z" };
    expect(emailChangeStatus(user, now)).toEqual({ pendingEmail: null, lapsedEmail: next });
  });

  it("is nothing once the new address is the current one, or for a date it cannot read", () => {
    expect(emailChangeStatus({ email: next, new_email: next }, now)).toEqual({
      pendingEmail: null,
      lapsedEmail: null,
    });
    const unreadable = { email: current, new_email: next, email_change_sent_at: "soon" };
    expect(emailChangeStatus(unreadable, now).lapsedEmail).toBe(next);
  });
});

describe("sign-in limits", () => {
  it("never store the username or address they count", () => {
    const bucket = signInBucket("username", "chef.sis", "secret");
    expect(bucket).toMatch(/^sign-in:username:/);
    expect(bucket).not.toContain("chef.sis");
    expect(signInBucket("ip", "203.0.113.7", "secret")).not.toContain("203.0.113.7");
  });

  it("count each scope apart, so that one cannot use up another", () => {
    expect(signInBucket("username", "same", "secret")).not.toBe(signInBucket("ip", "same", "secret"));
  });
});

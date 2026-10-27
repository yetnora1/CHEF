import { describe, expect, it } from "vitest";
import { CONTACT_LIMITS, parseContactMessage } from "@/features/contact/message-schema";

const valid = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Selam Tesfaye",
  email: "Selam@Example.test",
  phone: "",
  subject: "",
  message: "Do you cater small family dinners at home?",
  consent: "on",
  ...overrides,
});

describe("parseContactMessage", () => {
  it("normalises a valid message and turns empty optional fields into null", () => {
    expect(parseContactMessage(valid())).toEqual({
      success: true,
      data: {
        fullName: "Selam Tesfaye",
        email: "selam@example.test",
        phone: null,
        subject: null,
        message: "Do you cater small family dinners at home?",
      },
    });
  });

  it("keeps an optional phone number and subject", () => {
    const result = parseContactMessage(valid({ phone: "+251 91 123 4567", subject: "Menu question" }));
    expect(result).toMatchObject({
      success: true,
      data: { phone: "+251 91 123 4567", subject: "Menu question" },
    });
  });

  it("reports each problem as a stable code, never echoing input", () => {
    expect(parseContactMessage({})).toEqual({
      success: false,
      fieldErrors: {
        fullName: "required",
        email: "required",
        message: "required",
        consent: "consentRequired",
      },
    });
    expect(
      parseContactMessage(
        valid({
          fullName: "S",
          email: "not-an-email",
          phone: "call me",
          subject: "x".repeat(CONTACT_LIMITS.subjectMax + 1),
          message: "Hi",
        }),
      ),
    ).toEqual({
      success: false,
      fieldErrors: {
        fullName: "tooShort",
        email: "invalidEmail",
        phone: "invalidPhone",
        subject: "tooLong",
        message: "tooShort",
      },
    });
  });

  it("refuses addresses that could add parameters to a mailto: link", () => {
    expect(parseContactMessage(valid({ email: "a@example.test?cc=b@example.test" }))).toMatchObject({
      success: false,
      fieldErrors: { email: "invalidEmail" },
    });
  });

  it("enforces the message length limit after cleaning", () => {
    expect(parseContactMessage(valid({ message: "x".repeat(CONTACT_LIMITS.messageMax + 1) }))).toMatchObject({
      success: false,
      fieldErrors: { message: "tooLong" },
    });
    // Invisible characters do not count towards the minimum.
    expect(parseContactMessage(valid({ message: `Hi${"\u200b".repeat(8)}` }))).toMatchObject({
      success: false,
      fieldErrors: { message: "tooShort" },
    });
  });
});

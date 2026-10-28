import { describe, expect, it } from "vitest";
import {
  businessToday,
  cleanMultiline,
  eventDateBounds,
  INQUIRY_LIMITS,
  isValidPhone,
  parseInquiry,
} from "@/features/bookings/inquiry-schema";

// 2026-10-24 21:30 UTC is already 2026-10-25 in Addis Ababa (UTC+3).
const NOW = new Date("2026-10-24T21:30:00Z");
const now = () => NOW;

const valid = {
  fullName: "  Selam   Tesfaye ",
  email: " Selam@Example.COM ",
  phone: "",
  contactMethod: "email",
  eventType: "wedding",
  eventDate: "2027-03-14",
  guestCount: " 250 ",
  venue: "Addis Ababa",
  requirements: "Lunch buffet\r\n\r\n\r\n\r\nand coffee",
  message: "",
  consent: "on",
};

const errorsFor = (overrides: Record<string, unknown>) => {
  const result = parseInquiry({ ...valid, ...overrides }, now);
  return result.success ? {} : result.fieldErrors;
};

describe("parseInquiry", () => {
  it("accepts a valid inquiry and normalises it", () => {
    expect(parseInquiry(valid, now)).toEqual({
      success: true,
      data: {
        fullName: "Selam Tesfaye",
        email: "selam@example.com",
        phone: null,
        contactMethod: "email",
        eventType: "wedding",
        eventDate: "2027-03-14",
        guestCount: 250,
        venue: "Addis Ababa",
        requirements: "Lunch buffet\n\nand coffee",
        message: null,
      },
    });
  });

  it("reports every missing required field", () => {
    const result = parseInquiry({}, now);
    expect(result).toEqual({
      success: false,
      fieldErrors: {
        fullName: "required",
        email: "required",
        eventType: "required",
        guestCount: "required",
        requirements: "required",
        consent: "consentRequired",
      },
    });
  });

  it("accepts an inquiry without an event date (not decided yet)", () => {
    const result = parseInquiry({ ...valid, eventDate: "" }, now);
    expect(result.success && result.data.eventDate).toBeNull();
  });

  it.each([
    ["fullName", "x".repeat(INQUIRY_LIMITS.nameMax + 1)],
    ["venue", "x".repeat(INQUIRY_LIMITS.venueMax + 1)],
    ["requirements", "x".repeat(INQUIRY_LIMITS.requirementsMax + 1)],
    ["message", "x".repeat(INQUIRY_LIMITS.messageMax + 1)],
    ["email", `${"x".repeat(250)}@example.com`],
  ])("rejects an excessively long %s", (field, value) => {
    expect(errorsFor({ [field]: value })[field as "fullName"]).toBe("tooLong");
  });

  it.each([
    ["2026-10-25", "dateNotFuture"], // today in Addis Ababa
    ["2026-10-01", "dateNotFuture"],
    ["2029-12-31", "dateTooFar"],
    ["2027-02-30", "invalidDate"],
    ["14/03/2027", "invalidDate"],
    ["not a date", "invalidDate"],
  ])("rejects the event date %s (%s)", (eventDate, code) => {
    expect(errorsFor({ eventDate }).eventDate).toBe(code);
  });

  it("accepts tomorrow (business time) as the earliest date", () => {
    expect(eventDateBounds(NOW).min).toBe("2026-10-26");
    expect(businessToday(NOW)).toBe("2026-10-25");
    expect(parseInquiry({ ...valid, eventDate: "2026-10-26" }, now).success).toBe(true);
  });

  it.each([
    ["0", "guestMin"],
    ["-5", "notWholeNumber"],
    ["12.5", "notWholeNumber"],
    ["1e3", "notWholeNumber"],
    ["abc", "notWholeNumber"],
    ["10001", "guestMax"],
    ["99999999", "notWholeNumber"],
  ])("rejects the guest count %s", (guestCount, code) => {
    expect(errorsFor({ guestCount }).guestCount).toBe(code);
  });

  // The form validates one step at a time, so these rules must not wait for the other fields.
  it("checks the event date even while every other field is still empty", () => {
    expect(parseInquiry({ eventDate: "2020-01-01" }, now)).toMatchObject({
      success: false,
      fieldErrors: { eventDate: "dateNotFuture" },
    });
    expect(parseInquiry({ eventDate: "2026-02-30" }, now)).toMatchObject({
      fieldErrors: { eventDate: "invalidDate" },
    });
  });

  it("reports a missing phone number together with other problems", () => {
    expect(parseInquiry({ contactMethod: "messaging_app", phone: "" }, now)).toMatchObject({
      success: false,
      fieldErrors: { phone: "phoneRequired", fullName: "required", consent: "consentRequired" },
    });
  });

  it("requires a phone number when phone or messaging contact is preferred", () => {
    expect(errorsFor({ contactMethod: "phone", phone: "" }).phone).toBe("phoneRequired");
    expect(errorsFor({ contactMethod: "messaging_app", phone: "" }).phone).toBe("phoneRequired");
    expect(parseInquiry({ ...valid, contactMethod: "phone", phone: "+251 91 123 4567" }, now).success).toBe(
      true,
    );
  });

  it.each(["+251 91 123 4567", "0911234567", "+1 (415) 555-0100", "+44 20 7946 0958", "091.123.4567"])(
    "accepts the international phone number %s",
    (phone) => expect(isValidPhone(phone)).toBe(true),
  );

  it.each(["123", "+251-ABC-1234", "1234567890123456", "+", "phone: 0911"])(
    "rejects the phone number %s",
    (phone) => {
      expect(isValidPhone(phone)).toBe(false);
    },
  );

  it.each(["plainaddress", "a@b", "@example.com", "two@@example.com"])("rejects the email %s", (email) => {
    expect(errorsFor({ email }).email).toBe("invalidEmail");
  });

  it("rejects unknown choices for selects", () => {
    expect(errorsFor({ eventType: "concert" }).eventType).toBe("invalidChoice");
    expect(errorsFor({ contactMethod: "fax" }).contactMethod).toBe("invalidChoice");
  });

  it("requires consent", () => {
    expect(errorsFor({ consent: undefined }).consent).toBe("consentRequired");
    expect(errorsFor({ consent: "off" }).consent).toBe("consentRequired");
  });

  it("keeps markup as plain text (escaped on output, never interpreted)", () => {
    const payload = `<script>alert('x')</script><img src=x onerror=alert(1)>`;
    const result = parseInquiry({ ...valid, fullName: payload, requirements: payload }, now);
    expect(result.success && result.data.fullName).toBe(payload);
  });

  it("removes control and bidirectional-override characters", () => {
    const result = parseInquiry({ ...valid, fullName: "Abe‮be\u0000 Kebede​" }, now);
    expect(result.success && result.data.fullName).toBe("Abebe Kebede");
  });

  it("ignores client-supplied status, assignment and identity fields", () => {
    const result = parseInquiry(
      { ...valid, status: "confirmed", assigned_to: "x", user_id: "y", source: "staff" },
      now,
    );
    expect(result.success && Object.keys(result.data).sort()).toEqual(
      [
        "contactMethod",
        "email",
        "eventDate",
        "eventType",
        "fullName",
        "guestCount",
        "message",
        "phone",
        "requirements",
        "venue",
      ].sort(),
    );
  });

  it("keeps Amharic text intact", () => {
    const result = parseInquiry({ ...valid, fullName: "ሰላም ተስፋዬ", requirements: "የምሳ ግብዣ" }, now);
    expect(result.success && result.data.fullName).toBe("ሰላም ተስፋዬ");
  });
});

describe("cleanMultiline", () => {
  it("normalises line endings and collapses runs of blank lines", () => {
    expect(cleanMultiline("  a \r\n\r\n\r\n b\t\tc  ")).toBe("a\n\nb c");
  });
});

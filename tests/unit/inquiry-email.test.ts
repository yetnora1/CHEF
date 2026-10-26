import { describe, expect, it, vi } from "vitest";
import type { EmailConfig } from "@/features/bookings/server/config";
import {
  customerAcknowledgement,
  escapeHtml,
  sendWithResend,
  staffNewInquiry,
} from "@/features/bookings/server/email";
import { deliverNotifications } from "@/features/bookings/server/notifications";
import type { ClaimedNotification } from "@/features/bookings/server/store";

const email: EmailConfig = {
  provider: "resend",
  apiKey: "re_test",
  from: "Chef Harena <inquiries@mail.example>",
  staffRecipients: ["owner@example.test"],
  siteUrl: new URL("https://chefharena.example"),
};

const summary = {
  reference: "CH-0123456789",
  eventType: "wedding" as const,
  eventDate: "2027-03-14",
  guestCount: 250,
};

describe("email templates", () => {
  it("escape text for HTML", () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });

  it("carry no free text from the submission in the acknowledgement", () => {
    // Anyone can type any address into the form; the message must not be a
    // way to send a chosen text to a third party.
    for (const locale of ["en", "am"] as const) {
      const message = customerAcknowledgement(locale, { ...summary, email: "c@example.test" });
      expect(message.text.split("\n\n")[0]).toBe(locale === "en" ? "Hello," : "ሰላም፣");
      expect(message.to).toEqual(["c@example.test"]);
    }
  });

  it("never claim the booking is confirmed or the date available", () => {
    for (const locale of ["en", "am"] as const) {
      const message = customerAcknowledgement(locale, { ...summary, email: "c@example.test" });
      expect(message.text).toContain("CH-0123456789");
    }
    const en = customerAcknowledgement("en", { ...summary, email: "c@example.test" });
    expect(en.text).toContain("It is not a booking confirmation");
    expect(en.text).not.toMatch(/your (booking|event) is confirmed|date is available/i);
  });

  it("localise the acknowledgement", () => {
    const am = customerAcknowledgement("am", { ...summary, email: "c@example.test" });
    expect(am.subject).toMatch(/[ሀ-᎟]/);
    expect(am.text).toContain("ሠርግ");
  });

  it("keep contact details out of staff alerts and link to the admin inbox", () => {
    const message = staffNewInquiry(summary, email.staffRecipients, email.siteUrl);
    expect(message.text).not.toContain("<script>");
    expect(message.text).toContain("https://chefharena.example/admin/bookings/CH-0123456789");
  });
});

describe("sendWithResend", () => {
  it("sends with an idempotency key", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "email_1" }));
    const result = await sendWithResend(
      email,
      staffNewInquiry(summary, ["a@example.test"], email.siteUrl),
      "key-1",
      fetchImpl,
    );
    expect(result).toEqual({ ok: true, providerId: "email_1" });
    expect((fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>)["Idempotency-Key"]).toBe("key-1");
  });

  it("reports provider and network failures without throwing", async () => {
    expect(
      await sendWithResend(
        email,
        staffNewInquiry(summary, [], email.siteUrl),
        "k",
        vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 500 })),
      ),
    ).toEqual({ ok: false, error: "provider responded 500" });
    expect(
      await sendWithResend(
        email,
        staffNewInquiry(summary, [], email.siteUrl),
        "k",
        vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")),
      ),
    ).toEqual({ ok: false, error: "TypeError" });
  });
});

describe("deliverNotifications", () => {
  const claimed: ClaimedNotification[] = [
    {
      notification_id: "11111111-1111-4111-8111-111111111111",
      kind: "customer_acknowledgement",
      attempts: 1,
      booking_reference: "CH-0123456789",
      contact_email: "selam@example.test",
      preferred_locale: "en",
      event_type: "wedding",
      event_date: null,
      guest_count: 10,
    },
    {
      notification_id: "22222222-2222-4222-8222-222222222222",
      kind: "staff_new_inquiry",
      attempts: 1,
      booking_reference: "CH-0123456789",
      contact_email: null,
      preferred_locale: "en",
      event_type: "wedding",
      event_date: null,
      guest_count: 10,
    },
  ];

  it("records each outcome and survives provider failures", async () => {
    const store = {
      claimNotifications: vi.fn().mockResolvedValue(claimed),
      completeNotification: vi.fn().mockResolvedValue(undefined),
    };
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "provider responded 503" })
      .mockRejectedValueOnce(new Error("boom"));

    const report = await deliverNotifications({ store, email, send });

    expect(report).toEqual({ claimed: 2, sent: 0, failed: 2 });
    expect(store.completeNotification).toHaveBeenCalledWith(claimed[0]!.notification_id, {
      ok: false,
      error: "provider responded 503",
    });
    expect(send.mock.calls[0]![1]).toBe(claimed[0]!.notification_id);
    expect(send.mock.calls[0]![0].to).toEqual(["selam@example.test"]);
    expect(send.mock.calls[1]![0].to).toEqual(["owner@example.test"]);
  });

  it("fails an acknowledgement that has no recipient instead of sending it", async () => {
    const store = {
      claimNotifications: vi.fn().mockResolvedValue([{ ...claimed[0]!, contact_email: null }]),
      completeNotification: vi.fn().mockResolvedValue(undefined),
    };
    const send = vi.fn();
    expect(await deliverNotifications({ store, email, send })).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(store.completeNotification).toHaveBeenCalledWith(claimed[0]!.notification_id, {
      ok: false,
      error: "no recipient",
    });
  });

  it("does not throw if recording the outcome fails", async () => {
    const store = {
      claimNotifications: vi.fn().mockResolvedValue([claimed[0]]),
      completeNotification: vi.fn().mockRejectedValue(new Error("db down")),
    };
    const send = vi.fn().mockResolvedValue({ ok: true, providerId: "x" });
    await expect(deliverNotifications({ store, email, send })).resolves.toEqual({
      claimed: 1,
      sent: 1,
      failed: 0,
    });
  });
});

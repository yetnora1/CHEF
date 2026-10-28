import { describe, expect, it } from "vitest";
import { auditDay, describeAuditEntry, type AuditEntry } from "@/features/audit/describe";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    id: 1,
    occurredAt: "2026-10-28T09:00:00Z",
    actorId: USER,
    actorName: "Owner Person",
    action: "settings.updated",
    targetType: null,
    targetId: null,
    targetName: null,
    details: {},
    ...overrides,
  };
}

describe("audit entries in plain language", () => {
  it("describes role changes with the role and a link to the person", () => {
    const described = describeAuditEntry(
      entry({
        action: "role.assigned",
        targetType: "user",
        targetId: OTHER,
        targetName: "New Person",
        details: { role: "analyst" },
      }),
    );
    expect(described).toMatchObject({
      action: "role.assigned",
      role: "analyst",
      target: { kind: "user", name: "New Person", href: `/admin/users#staff-${OTHER}` },
    });
  });

  it("labels inquiry status changes and drops the link once an inquiry is erased", () => {
    const changed = describeAuditEntry(
      entry({
        action: "booking.status_changed",
        targetType: "booking",
        targetId: "CH-0123456789",
        details: { from: "new", to: "contacted" },
      }),
    );
    expect(changed.from).toEqual({ kind: "booking", value: "new" });
    expect(changed.to).toEqual({ kind: "booking", value: "contacted" });
    expect(changed.target).toEqual({
      kind: "booking",
      reference: "CH-0123456789",
      href: "/admin/bookings/CH-0123456789",
    });

    const erased = describeAuditEntry(
      entry({
        action: "booking.erased",
        targetType: "booking",
        targetId: "CH-0123456789",
        details: { status: "declined" },
      }),
    );
    expect(erased.target).toMatchObject({ kind: "booking", href: null });
  });

  it("names a new assignee only by a well-formed id", () => {
    const assigned = describeAuditEntry(
      entry({
        action: "booking.assigned",
        targetType: "booking",
        targetId: "CH-0123456789",
        details: { from: null, to: OTHER },
      }),
    );
    expect(assigned.assignee).toBe(OTHER);
    const unassigned = describeAuditEntry(
      entry({
        action: "booking.assigned",
        targetType: "booking",
        targetId: "CH-0123456789",
        details: { from: OTHER, to: null },
      }),
    );
    expect(unassigned.assignee).toBeNull();
  });

  it("links content to its entry, per language, with the changed fields", () => {
    const described = describeAuditEntry(
      entry({
        action: "content.updated",
        targetType: "service_translation",
        targetId: USER,
        details: {
          fields: ["language_reviewed_at", "summary", "title"],
          locale: "am",
          review: "confirmed",
          status: "draft",
        },
      }),
    );
    expect(described).toMatchObject({
      action: "content.updated",
      fields: ["summary", "title"],
      review: "confirmed",
      target: { kind: "content", type: "service", locale: "am", href: `/admin/services/${USER}` },
    });
  });

  it("reads publication status changes from the entry's new status", () => {
    const described = describeAuditEntry(
      entry({
        action: "content.status_changed",
        targetType: "page",
        targetId: "home",
        details: { from: "draft", status: "published" },
      }),
    );
    expect(described.from).toEqual({ kind: "content", value: "draft" });
    expect(described.to).toEqual({ kind: "content", value: "published" });
    expect(described.target).toMatchObject({ kind: "content", type: "page", href: "/admin/pages/home" });
  });

  it("does not link to deleted entries, but keeps the entry when only a language is deleted", () => {
    const entryDeleted = describeAuditEntry(
      entry({ action: "content.deleted", targetType: "journal_post", targetId: USER }),
    );
    expect(entryDeleted.target).toMatchObject({ kind: "content", href: null });
    const languageDeleted = describeAuditEntry(
      entry({
        action: "content.deleted",
        targetType: "journal_post_translation",
        targetId: USER,
        details: { locale: "am" },
      }),
    );
    expect(languageDeleted.target).toMatchObject({ kind: "content", href: `/admin/journal/${USER}` });
  });

  it("shows settings saves with their fields, including the Amharic review", () => {
    const described = describeAuditEntry(
      entry({
        action: "settings.updated",
        targetType: "site_settings",
        targetId: "site",
        details: { fields: ["contact_email", "location_am_reviewed_at"] },
      }),
    );
    expect(described.fields).toEqual(["contact_email", "location_am_reviewed_at"]);
    expect(described.target).toEqual({ kind: "settings", href: "/admin/settings" });
  });

  it("keeps unknown actions and malformed details as raw, unlinked values", () => {
    const described = describeAuditEntry(
      entry({
        action: "something.new",
        targetType: "booking",
        targetId: "not-a-reference",
        details: { role: "superuser", fields: "title", from: 5 },
      }),
    );
    expect(described).toMatchObject({ action: null, role: null, fields: [], from: null });
    expect(described.target).toEqual({ kind: "unknown", type: "booking", id: "not-a-reference" });
  });
});

describe("grouping by day", () => {
  it("uses the business time zone", () => {
    // 21:30 UTC is already the next day in Addis Ababa (UTC+3).
    expect(auditDay("2026-10-24T21:30:00Z", "Africa/Addis_Ababa")).toBe("2026-10-25");
  });
});

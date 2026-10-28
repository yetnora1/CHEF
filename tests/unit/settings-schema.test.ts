import { describe, expect, it } from "vitest";
import {
  normalizeLink,
  parseSettingsForm,
  SETTINGS_TEXT_FIELDS,
  telegramUsername,
  telHref,
  whatsappDigits,
} from "@/features/settings/schema";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const name of SETTINGS_TEXT_FIELDS) data.set(name, "");
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("site settings form", () => {
  it("stores empty fields as null and reads the two switches", () => {
    const result = parseSettingsForm(form({ inquiries_open: "on" }));
    expect(result).toEqual({
      success: true,
      values: {
        ...Object.fromEntries(SETTINGS_TEXT_FIELDS.map((name) => [name, null])),
        inquiries_open: true,
        location_am_reviewed: false,
      },
    });
    const paused = parseSettingsForm(form({ location_am: "አዲስ አበባ", location_am_reviewed: "on" }));
    expect(paused.success && paused.values.inquiries_open).toBe(false);
    expect(paused.success && paused.values.location_am_reviewed).toBe(true);
  });

  it("cleans text and normalises usernames and links", () => {
    const result = parseSettingsForm(
      form({
        contact_email: "  hello@example.test ",
        contact_phone: "+251  11 000 0000",
        whatsapp_phone: "+251 91 000 0000",
        telegram_username: "https://t.me/chef_example",
        location_en: "  Addis   Ababa ",
        instagram_url: "instagram.com/chef.example",
        facebook_url: "http://www.facebook.com/chef.example",
        tiktok_url: "https://www.TikTok.com/@chef.example",
        youtube_url: "https://youtube.com/@chefexample",
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.values).toMatchObject({
      contact_email: "hello@example.test",
      contact_phone: "+251 11 000 0000",
      telegram_username: "chef_example",
      location_en: "Addis Ababa",
      instagram_url: "https://instagram.com/chef.example",
      facebook_url: "https://www.facebook.com/chef.example",
      tiktok_url: "https://www.tiktok.com/@chef.example",
      youtube_url: "https://youtube.com/@chefexample",
    });
  });

  it("names the problem with each invalid field", () => {
    const result = parseSettingsForm(
      form({
        contact_email: "not-an-email",
        contact_phone: "12",
        whatsapp_phone: "0911 000 000",
        telegram_username: "@ab",
        location_en: "x".repeat(121),
        instagram_url: "https://instagram.com.evil.example/chef",
        facebook_url: "javascript:alert(1)",
        tiktok_url: "https://tiktok.com/chef",
        youtube_url: "https://user:pass@youtube.com/chef",
      }),
    );
    expect(result).toEqual({
      success: false,
      fieldErrors: {
        contact_email: "invalidEmail",
        contact_phone: "invalidPhone",
        whatsapp_phone: "needsCountryCode",
        telegram_username: "invalidTelegram",
        location_en: "tooLong",
        instagram_url: "invalidLink",
        facebook_url: "invalidLink",
        tiktok_url: "invalidLink",
        youtube_url: "invalidLink",
      },
    });
  });

  it("rejects a link to the platform's home page instead of a profile", () => {
    const result = parseSettingsForm(form({ instagram_url: "https://instagram.com/" }));
    expect(result).toEqual({ success: false, fieldErrors: { instagram_url: "invalidLink" } });
  });
});

describe("contact link helpers", () => {
  it("builds tel: and wa.me targets from formatted numbers", () => {
    expect(telHref("+251 (11) 000-0000")).toBe("tel:+251110000000");
    expect(whatsappDigits("+251 91 000 0000")).toBe("251910000000");
  });

  it("accepts Telegram usernames in the forms people paste", () => {
    expect(telegramUsername("@chef_example")).toBe("chef_example");
    expect(telegramUsername("t.me/chef_example")).toBe("chef_example");
    expect(telegramUsername("https://telegram.me/chef_example")).toBe("chef_example");
  });

  it("leaves other schemes for the platform check to reject", () => {
    expect(normalizeLink("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(normalizeLink("ftp://instagram.com/x")).toBe("ftp://instagram.com/x");
  });
});

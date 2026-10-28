import type { AppRole } from "@/lib/permissions/matrix";

/** Each role's colour (a `hue-*` utility in globals.css), for its badge and the avatars of people who hold it. */
export const ROLE_HUES: Record<AppRole, string> = {
  owner: "hue-violet",
  admin: "hue-indigo",
  content_editor: "hue-teal",
  event_manager: "hue-amber",
  analyst: "hue-sky",
};

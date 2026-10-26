import { notFound } from "next/navigation";

// Always the not-found page, so there is no instant UI to validate.
export const instant = false;

// Unknown paths inside a locale render the localized not-found page.
export default function CatchAllNotFound() {
  notFound();
}

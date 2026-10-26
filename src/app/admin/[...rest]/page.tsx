import { notFound } from "next/navigation";

// Always the not-found page, so there is no instant UI to validate.
export const instant = false;

// Planned admin modules (see docs/ARCHITECTURE.md) are not routed yet.
export default function AdminCatchAllNotFound() {
  notFound();
}

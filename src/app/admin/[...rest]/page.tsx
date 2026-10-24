import { notFound } from "next/navigation";

// Planned admin modules (see docs/ARCHITECTURE.md) are not routed yet.
export default function AdminCatchAllNotFound() {
  notFound();
}

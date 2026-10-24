import {
  ConciergeBell,
  FolderOpen,
  Images,
  Inbox,
  Languages,
  LayoutDashboard,
  NotebookPen,
  ScrollText,
  Settings,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { AdminModuleKey } from "./modules";

// Shared by Server and Client Components, so this module must not be "use client".
export const ADMIN_MODULE_ICONS: Record<AdminModuleKey, LucideIcon> = {
  overview: LayoutDashboard,
  bookings: Inbox,
  services: ConciergeBell,
  menu: UtensilsCrossed,
  gallery: Images,
  journal: NotebookPen,
  media: FolderOpen,
  translations: Languages,
  users: Users,
  settings: Settings,
  auditLog: ScrollText,
};

import { redirect } from "next/navigation";
import { ADMIN_HOME_PATH } from "@/lib/auth/redirect";

export default function AdminIndex() {
  redirect(ADMIN_HOME_PATH);
}

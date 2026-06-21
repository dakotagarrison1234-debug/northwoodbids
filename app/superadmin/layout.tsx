import { redirect } from "next/navigation";

// Single-business model: there is no multi-business super-admin area.
// Everything is managed from the normal /admin section, so any attempt to
// reach /superadmin (or its sub-pages) is sent there.
export default function SuperAdminLayout() {
  redirect("/admin/dashboard");
}

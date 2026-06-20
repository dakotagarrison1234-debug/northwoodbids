import { redirect } from "next/navigation";

export default function DashboardNewRedirect() {
  redirect("/admin/items/new");
}

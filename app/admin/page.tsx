import { redirect } from "next/navigation";

/** /admin on its own lands on Today (it used to fall through to the home page). */
export default function AdminIndex() {
  redirect("/admin/dashboard");
}

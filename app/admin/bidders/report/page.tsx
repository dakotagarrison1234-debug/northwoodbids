import { redirect } from "next/navigation";

// The bidder report now lives as the "Bidders" tab inside /admin/reports.
// Kept as a redirect so any old bookmarks still land in the right place.
export default function BidderReportRedirect() {
  redirect("/admin/reports");
}

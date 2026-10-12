import { redirect } from "next/navigation";

// The bidder report view is gone; the bidder list is the one home for bidders.
// Kept as a redirect so any old bookmarks still land somewhere useful.
export default function BidderReportRedirect() {
  redirect("/admin/bidders");
}

import { redirect } from "next/navigation";

// Single-business site: the business "storefront" IS the homepage, so the
// standalone business page is redundant. Send it to the homepage.
// (Auction and item pages under /[orgSlug]/[auctionSlug]/... are unaffected.)
export default function OrgPage() {
  redirect("/");
}

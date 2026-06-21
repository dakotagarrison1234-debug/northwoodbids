import { redirect } from "next/navigation";

// Northwood Bids is a single-business auction site — there is no public
// host-onboarding flow. Redirect anyone who lands here to the home page.
export default function OnboardingRedirect() {
  redirect("/");
}

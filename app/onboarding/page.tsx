import { redirect } from "next/navigation";

// Old onboarding URL — redirect anyone who lands here to the new apply flow
export default function OnboardingRedirect() {
  redirect("/apply");
}

import { SignIn } from "@clerk/nextjs";
import AuthSwitch from "@/app/components/AuthSwitch";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <AuthSwitch active="in" />
      {/* fallback (not force) so an invite/deep link's redirect_url is honored —
          e.g. /join?token=… returns here after login instead of being hijacked. */}
      <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/register" />
    </div>
  );
}

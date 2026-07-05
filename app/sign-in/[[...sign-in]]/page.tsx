import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {/* fallback (not force) so an invite/deep link's redirect_url is honored —
          e.g. /join?token=… returns here after login instead of being hijacked. */}
      <SignIn fallbackRedirectUrl="/register" />
    </div>
  );
}
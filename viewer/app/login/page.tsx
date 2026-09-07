"use client";

import { SignIn } from "@clerk/nextjs";
import { AuthScreen, clerkAppearance } from "@/components/auth/AuthScreen";

export default function LoginPage() {
  return (
    <AuthScreen>
      <SignIn routing="hash" appearance={clerkAppearance} />
    </AuthScreen>
  );
}

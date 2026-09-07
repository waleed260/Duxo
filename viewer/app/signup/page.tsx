"use client";

import { SignUp } from "@clerk/nextjs";
import { AuthScreen, clerkAppearance } from "@/components/auth/AuthScreen";

export default function SignUpPage() {
  return (
    <AuthScreen>
      <SignUp routing="hash" appearance={clerkAppearance} />
    </AuthScreen>
  );
}

"use client";

import { signIn } from "next-auth/react";

export function GoogleSignInButton({ callbackUrl = "/app" }: { callbackUrl?: string }) {
  return (
    <button
      className="google-button"
      type="button"
      onClick={() => void signIn("google", { callbackUrl })}
    >
      <span aria-hidden="true">G</span> Continuar con Google
    </button>
  );
}

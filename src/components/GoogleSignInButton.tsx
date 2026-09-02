"use client";

import { signIn } from "next-auth/react";

export function GoogleSignInButton() {
  return (
    <button
      className="google-button"
      type="button"
      onClick={() => void signIn("google", { callbackUrl: "/app" })}
    >
      <span aria-hidden="true">G</span> Continuar con Google
    </button>
  );
}

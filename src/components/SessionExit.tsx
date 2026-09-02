"use client";

import { signOut } from "next-auth/react";
import { useState, type FormEvent } from "react";

/**
 * Salida visible en todas las pantallas.
 *
 * Es un formulario de verdad contra /api/auth/logout: si el JavaScript falla o
 * todavía no ha cargado, el botón sigue cerrando la sesión. Con OAuth
 * interceptamos el envío para que NextAuth invalide su sesión antes de pasar
 * por la ruta que limpia las cookies restantes.
 */
export function SessionExit({ mode }: { mode: "oauth" | "local_preview" }) {
  const [leaving, setLeaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (mode !== "oauth") return; // envío nativo del formulario
    event.preventDefault();
    setLeaving(true);
    try {
      await signOut({ callbackUrl: "/api/auth/logout" });
    } catch {
      setLeaving(false);
      event.currentTarget.submit();
    }
  }

  return (
    <form action="/api/auth/logout" method="post" onSubmit={handleSubmit}>
      <button type="submit" className="chrome-exit" disabled={leaving}>
        {leaving ? "Saliendo…" : "Salir"}
      </button>
    </form>
  );
}

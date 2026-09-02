"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Status = "PENDING" | "ACTIVE" | "SUSPENDED";

export function UserActions({ userId, status }: { userId: string; status: Status }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>, method: "PATCH" | "DELETE") {
    setError(null);
    const response = await fetch("/api/admin/users", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, ...body }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(
        payload?.error === "USER_OWNS_WORKSPACES"
          ? "Esta persona creó espacios de trabajo. Reasígnalos antes de eliminarla."
          : "No se pudo completar la acción.",
      );
      return;
    }
    startTransition(() => router.refresh());
  }

  function remove() {
    if (!window.confirm("Eliminar esta cuenta de forma permanente. ¿Continuar?")) return;
    void send({}, "DELETE");
  }

  return (
    <div className="row-actions">
      {status !== "ACTIVE" ? (
        <button type="button" onClick={() => void send({ status: "ACTIVE" }, "PATCH")} disabled={pending}>
          Aceptar
        </button>
      ) : null}
      {status !== "SUSPENDED" ? (
        <button type="button" onClick={() => void send({ status: "SUSPENDED" }, "PATCH")} disabled={pending}>
          Suspender
        </button>
      ) : null}
      <button type="button" className="is-destructive" onClick={remove} disabled={pending}>
        Eliminar
      </button>
      {error ? <span className="row-error">{error}</span> : null}
    </div>
  );
}

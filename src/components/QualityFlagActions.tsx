"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const FLAGS = [
  { value: "CORRECT", label: "Correcta" },
  { value: "PARTIAL", label: "Parcial" },
  { value: "INCORRECT", label: "Incorrecta" },
  { value: "OUTDATED_SOURCE", label: "Fuente caducada" },
] as const;

export function QualityFlagActions({ queryId, current }: { queryId: string; current: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  async function flag(value: string) {
    setError(false);
    const response = await fetch("/api/admin/quality", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queryId, flag: value }),
    });
    if (!response.ok) {
      setError(true);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="row-actions">
      {FLAGS.map((item) => (
        <button
          key={item.value}
          type="button"
          className={current === item.value ? "is-selected" : ""}
          onClick={() => void flag(item.value)}
          disabled={pending}
        >
          {item.label}
        </button>
      ))}
      {error ? <span className="row-error">No se pudo guardar.</span> : null}
    </div>
  );
}

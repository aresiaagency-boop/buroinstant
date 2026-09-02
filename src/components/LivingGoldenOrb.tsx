"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ORB_EVENT, type OrbManifestDetail } from "@/lib/orb-events";
import type { OrbState } from "@/types/domain";

const stateLabels: Record<OrbState, string> = {
  idle: "Preparado",
  listening: "Escuchando",
  receiving: "Recibiendo",
  thinking: "Ordenando la intención",
  consulting_official_source: "Consultando fuente oficial",
  validating: "Validando datos",
  manifesting: "Manifestando",
  success: "Acción completada",
  warning: "Revisión necesaria",
  blocked: "Necesito una decisión",
};

export function LivingGoldenOrb({
  state: controlledState,
  onActivate,
  size = "large",
}: {
  state?: OrbState;
  onActivate?: () => void;
  size?: "small" | "large";
}) {
  const [eventState, setEventState] = useState<OrbState>("idle");
  const orbRef = useRef<HTMLButtonElement>(null);
  const state = controlledState ?? eventState;
  const particles = useMemo(
    () =>
      Array.from({ length: size === "large" ? 18 : 10 }, (_, index) => ({
        angle: (index / (size === "large" ? 18 : 10)) * 360,
        delay: (index % 7) * -0.43,
        distance: 43 + (index % 5) * 8,
      })),
    [size],
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<OrbManifestDetail>).detail;
      setEventState(detail.state);
    };
    window.addEventListener(ORB_EVENT, listener);
    return () => window.removeEventListener(ORB_EVENT, listener);
  }, []);

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    orbRef.current?.style.setProperty("--orb-x", `${x * 14}px`);
    orbRef.current?.style.setProperty("--orb-y", `${y * 14}px`);
  }

  return (
    <div className={`orb-stage orb-stage--${size}`} data-state={state}>
      <div className="orb-ambient" aria-hidden="true" />
      <div className="orb-orbit orb-orbit--one" aria-hidden="true" />
      <div className="orb-orbit orb-orbit--two" aria-hidden="true" />
      {particles.map((particle, index) => (
        <i
          className="orb-particle"
          aria-hidden="true"
          key={index}
          style={
            {
              "--particle-angle": `${particle.angle}deg`,
              "--particle-delay": `${particle.delay}s`,
              "--particle-distance": `${particle.distance}%`,
            } as React.CSSProperties
          }
        />
      ))}
      <button
        ref={orbRef}
        type="button"
        className="living-orb"
        aria-label={`${stateLabels[state]}. Pulsa para hablar con BUROINSTANT.`}
        onClick={onActivate}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          orbRef.current?.style.setProperty("--orb-x", "0px");
          orbRef.current?.style.setProperty("--orb-y", "0px");
        }}
      >
        <span className="orb-shell" aria-hidden="true" />
        <span className="orb-core" aria-hidden="true" />
        <span className="orb-reflection" aria-hidden="true" />
      </button>
      <span className="orb-status" aria-live="polite">
        <i aria-hidden="true" /> {stateLabels[state]}
      </span>
    </div>
  );
}

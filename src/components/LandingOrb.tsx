"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LivingGoldenOrb } from "@/components/LivingGoldenOrb";
import { VoiceConversation } from "@/components/VoiceConversation";

const VOICE_DESTINATION = "/acceso?next=%2Fapp%3Fvoz%3D1";

/**
 * El Orbe de la portada.
 *
 * Con sesión de Google abre el canal de voz. Sin ella lleva al acceso y
 * vuelve al mismo punto: el canal de voz escribe en el expediente y el
 * expediente pertenece a una persona identificada. El rótulo inferior es
 * ahora el mismo control, no un texto decorativo.
 */
export function LandingOrb({ authenticated }: { authenticated: boolean }) {
  const router = useRouter();
  const [voiceOpen, setVoiceOpen] = useState(false);

  function activate() {
    if (!authenticated) {
      router.push(VOICE_DESTINATION);
      return;
    }
    setVoiceOpen(true);
  }

  return (
    <>
      <span className="orb-annotation orb-annotation--top">INTENCIÓN · 01</span>
      <LivingGoldenOrb onActivate={activate} />
      <button
        className="orb-annotation orb-annotation--bottom orb-annotation--action"
        type="button"
        onClick={activate}
      >
        {authenticated
          ? "Pulsa el Orbe para hablar"
          : "Pulsa el Orbe para hablar · requiere sesión de Google"}
      </button>
      {voiceOpen && <VoiceConversation onClose={() => setVoiceOpen(false)} />}
    </>
  );
}

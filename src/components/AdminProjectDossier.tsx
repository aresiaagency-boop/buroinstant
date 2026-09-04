"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * La ficha de un expediente desde el control.
 *
 * Muestra todo lo que el sistema sabe de esa empresa en construcción y permite
 * borrarla. El borrado es irreversible y arrastra documentos y trámites, así
 * que pide escribir el nombre exacto: la fricción es deliberada.
 */

export type Dossier = {
  project: {
    id: string;
    name: string;
    businessDescription: string;
    legalForm: string | null;
    caseStage: string;
    createdAt: string;
    updatedAt: string;
    workspaceName: string;
    ownerEmail: string;
  };
  profile: Record<string, unknown>;
  tasks: Array<{ code: string; title: string; status: string; authority: string | null; evidence: string | null }>;
  documents: Array<{
    id: string;
    displayName: string;
    category: string;
    mimeType: string;
    sizeBytes: number;
    reviewStatus: string;
    createdAt: string;
  }>;
  events: Array<{ eventType: string; occurredAt: string; payload: Record<string, unknown> }>;
  contacts: Array<{ channel: string; maskedValue: string; verified: boolean }>;
};

const ESTADO: Record<string, string> = {
  NOT_STARTED: "Sin empezar",
  WAITING_USER: "Espera al titular",
  READY: "Puede hacerse",
  IN_PROGRESS: "Documento aportado",
  WAITING_AUTHORITY: "Espera a la Administración",
  COMPLETED: "Hecho",
  BLOCKED: "Bloqueado",
  NOT_APPLICABLE: "No aplica",
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-ES");
}

export function AdminProjectDossier({ dossier }: { dossier: Dossier }) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const hechos = dossier.tasks.filter((t) => t.status === "COMPLETED").length;

  async function borrar() {
    setDeleting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/expedientes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: dossier.project.id, confirmationName: confirmName }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload.message ?? "No he podido borrar el expediente.");
        return;
      }
      router.push("/admin/expedientes");
      router.refresh();
    } catch {
      setNotice("Sin conexión. El expediente sigue donde estaba.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <header className="admin-head">
        <p className="eyebrow">EXPEDIENTE</p>
        <h1>{dossier.project.name}</h1>
        <p className="admin-lede">
          {dossier.project.ownerEmail} · espacio «{dossier.project.workspaceName}» · abierto el{" "}
          {fecha(dossier.project.createdAt)}. {hechos} de {dossier.tasks.length} trámites hechos con
          evidencia.
        </p>
      </header>

      <section className="admin-block">
        <h2>Lo que ha respondido</h2>
        <dl className="dossier-grid">
          <div><dt>Actividad</dt><dd>{dossier.project.businessDescription || "—"}</dd></div>
          <div><dt>Forma jurídica</dt><dd>{dossier.project.legalForm ?? "sin decidir"}</dd></div>
          <div><dt>Municipio</dt><dd>{String(dossier.profile.municipality ?? "—")}</dd></div>
          <div><dt>Fundadores</dt><dd>{String(dossier.profile.number_of_founders ?? "—")}</dd></div>
          <div><dt>Fase</dt><dd>{dossier.project.caseStage}</dd></div>
          <div><dt>Última actividad</dt><dd>{fecha(dossier.project.updatedAt)}</dd></div>
        </dl>
      </section>

      <section className="admin-block">
        <h2>Canales verificados</h2>
        {dossier.contacts.length === 0 ? (
          <p className="admin-empty">Ningún canal vinculado.</p>
        ) : (
          <ul className="dossier-list">
            {dossier.contacts.map((c, index) => (
              <li key={`${c.channel}-${index}`}>
                <strong>{c.channel}</strong> {c.maskedValue}
                <span className="tag">{c.verified ? "verificado" : "sin verificar"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-block">
        <h2>Itinerario</h2>
        <div className="admin-scroller">
          <table>
            <thead>
              <tr><th>Trámite</th><th>Organismo</th><th>Estado</th><th>Evidencia</th></tr>
            </thead>
            <tbody>
              {dossier.tasks.map((task) => (
                <tr key={task.code}>
                  <td><strong>{task.title}</strong><small className="cell-sub">{task.code}</small></td>
                  <td>{task.authority ?? "—"}</td>
                  <td><span className="tag">{ESTADO[task.status] ?? task.status}</span></td>
                  <td className="mono">{task.evidence ?? "—"}</td>
                </tr>
              ))}
              {dossier.tasks.length === 0 ? (
                <tr><td colSpan={4} className="admin-empty">Itinerario sin construir.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-block">
        <h2>Documentos</h2>
        <p className="admin-lede">
          Metadatos únicamente. El contenido está cifrado y no se descifra desde aquí: auditar un
          expediente no es lo mismo que leer el DNI de una persona.
        </p>
        <div className="admin-scroller">
          <table>
            <thead>
              <tr><th>Nombre</th><th>Carpeta</th><th>Tipo</th><th>Tamaño</th><th>Entró</th></tr>
            </thead>
            <tbody>
              {dossier.documents.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.displayName}</td>
                  <td className="mono">{doc.category}</td>
                  <td className="mono">{doc.mimeType}</td>
                  <td className="mono">{Math.round(doc.sizeBytes / 1024)} KB</td>
                  <td className="mono">{fecha(doc.createdAt)}</td>
                </tr>
              ))}
              {dossier.documents.length === 0 ? (
                <tr><td colSpan={5} className="admin-empty">Sin documentos aportados.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-block">
        <h2>Traza</h2>
        <ul className="dossier-list dossier-list--trace">
          {dossier.events.map((event, index) => (
            <li key={`${event.eventType}-${index}`}>
              <span className="mono">{fecha(event.occurredAt)}</span>
              <strong>{event.eventType}</strong>
            </li>
          ))}
          {dossier.events.length === 0 ? <li className="admin-empty">Sin eventos.</li> : null}
        </ul>
      </section>

      <section className="admin-block admin-block--danger">
        <h2>Borrar el expediente</h2>
        <p>
          Se van con él {dossier.documents.length} documentos y {dossier.tasks.length} trámites, con
          su contenido cifrado. No hay vuelta atrás. Queda registrado quién lo borró y qué contenía.
        </p>
        <label htmlFor="confirmar-nombre">
          Escribe <code>{dossier.project.name}</code> para poder borrarlo
        </label>
        <input
          id="confirmar-nombre"
          type="text"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          placeholder={dossier.project.name}
          autoComplete="off"
        />
        <button
          type="button"
          className="danger-button"
          onClick={() => void borrar()}
          disabled={deleting || confirmName.trim() !== dossier.project.name.trim()}
        >
          {deleting ? "Borrando…" : "Borrar definitivamente"}
        </button>
        {notice ? <p className="admin-notice">{notice}</p> : null}
      </section>
    </>
  );
}

import type { CarpetaCompleta } from "@/lib/tramites/dossier-repository";

/**
 * La carpeta en papel.
 *
 * Se sirve como página imprimible en vez de generar un PDF en el servidor:
 * imprimir a PDF lo hace el propio navegador, sin meter una dependencia de
 * maquetación en la ruta ni pasar los datos del expediente por una librería
 * más de las necesarias.
 *
 * Todo valor que llega del expediente se escapa. El nombre del proyecto y el
 * de los documentos los escribe la persona —o llegan por WhatsApp, que es
 * entrada no confiable—, así que ninguno se interpola en crudo.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => ESCAPES[caracter]);
}

/** Sólo se enlaza una fuente oficial si es http(s). Nada de `javascript:`. */
function enlaceSeguro(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

const ESTILOS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         color: #14181f; background: #fff; max-width: 780px; }
  h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #5b6472;
       margin: 28px 0 10px; font-weight: 600; }
  .sub { color: #5b6472; margin: 0 0 24px; font-size: 14px; }
  .paso { border-left: 3px solid #14181f; padding: 12px 16px; background: #f6f7f9; margin: 0 0 8px; }
  .paso strong { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .08em;
                 color: #5b6472; margin-bottom: 4px; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 7px 0; border-bottom: 1px solid #e6e8ec; vertical-align: top; }
  td.k { color: #5b6472; width: 42%; }
  ul { margin: 0; padding-left: 20px; }
  li { margin: 4px 0; }
  .aviso { border: 1px solid #d9b03c; background: #fdf8e8; padding: 12px 16px; margin: 6px 0; }
  .falta { color: #9a2c2c; }
  .pie { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e6e8ec;
         color: #5b6472; font-size: 12.5px; }
  a { color: #14181f; }
  @media print { body { padding: 0; } .paso { background: none; } }
`;

const ESTADOS: Record<string, string> = {
  NOT_STARTED: "sin empezar",
  WAITING_USER: "esperando un dato tuyo",
  READY: "listo para hacerse",
  IN_PROGRESS: "en curso",
  WAITING_AUTHORITY: "presentado, esperando a la Administración",
  COMPLETED: "hecho",
  BLOCKED: "bloqueado",
  NOT_APPLICABLE: "no aplica",
};

function lista(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

export function renderCarpetaHtml(carpeta: CarpetaCompleta): string {
  const partes: string[] = [];

  partes.push(`<h1>${escaparHtml(carpeta.title)}</h1>`);
  partes.push(
    `<p class="sub">${escaparHtml(carpeta.proyecto.name)} · ${escaparHtml(carpeta.authority)} · ${escaparHtml(
      ESTADOS[carpeta.estado] ?? carpeta.estado,
    )}</p>`,
  );

  partes.push(
    `<div class="paso"><strong>Lo siguiente</strong>${escaparHtml(carpeta.siguientePaso)}</div>`,
  );
  partes.push(`<p class="sub">${escaparHtml(carpeta.detail)}</p>`);

  for (const aviso of carpeta.advertencias) {
    partes.push(`<div class="aviso">${escaparHtml(aviso)}</div>`);
  }

  if (carpeta.bloqueadoPor.length > 0) {
    partes.push("<h2>Antes hay que cerrar</h2>");
    partes.push(
      lista(
        carpeta.bloqueadoPor.map(
          (bloqueo) => `${escaparHtml(bloqueo.title)} — ${escaparHtml(ESTADOS[bloqueo.estado] ?? bloqueo.estado)}`,
        ),
      ),
    );
  }

  if (carpeta.datos.length > 0) {
    partes.push("<h2>Datos que vas a necesitar a mano</h2>");
    partes.push(
      `<table>${carpeta.datos
        .map((dato) => `<tr><td class="k">${escaparHtml(dato.etiqueta)}</td><td>${escaparHtml(dato.valor)}</td></tr>`)
        .join("")}</table>`,
    );
  }

  if (carpeta.faltan.length > 0) {
    partes.push("<h2>Datos que faltan en el expediente</h2>");
    partes.push(
      `<table>${carpeta.faltan
        .map(
          (hueco) =>
            `<tr><td class="k falta">${escaparHtml(hueco.etiqueta)}</td><td>${escaparHtml(
              hueco.comoSeConsigue,
            )}</td></tr>`,
        )
        .join("")}</table>`,
    );
  }

  if (carpeta.papelesAportados.length > 0) {
    partes.push("<h2>Papeles ya aportados</h2>");
    partes.push(
      lista(
        carpeta.papelesAportados.map(
          (papel) => `${escaparHtml(papel.etiqueta)} — ${escaparHtml(papel.nombre ?? "")}`,
        ),
      ),
    );
  }

  if (carpeta.papelesQueFaltan.length > 0) {
    partes.push("<h2>Papeles que faltan por subir</h2>");
    partes.push(lista(carpeta.papelesQueFaltan.map((papel) => `<span class="falta">${escaparHtml(papel.etiqueta)}</span>`)));
  }

  const fuente = enlaceSeguro(carpeta.sourceUrl);
  partes.push("<h2>Fuente oficial</h2>");
  partes.push(
    fuente
      ? `<p><a href="${escaparHtml(fuente)}">${escaparHtml(fuente)}</a></p>`
      : "<p class=\"falta\">Sin enlace a fuente oficial verificada. Comprueba el procedimiento vigente antes de presentar nada.</p>",
  );

  partes.push("<h2>Qué cuenta como hecho</h2>");
  partes.push(`<p>${escaparHtml(carpeta.verificacion)}</p>`);

  partes.push(
    `<p class="pie">Carpeta generada por BUROINSTANT el ${escaparHtml(
      new Date(carpeta.generadaEn).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }),
    )}. Reúne lo que ya está en tu expediente; no es asesoramiento jurídico ni fiscal, ni acredita que el trámite esté presentado.</p>`,
  );

  return [
    "<!doctype html>",
    '<html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escaparHtml(carpeta.title)} · ${escaparHtml(carpeta.proyecto.name)}</title>`,
    `<style>${ESTILOS}</style>`,
    "</head><body>",
    partes.join("\n"),
    "</body></html>",
  ].join("");
}

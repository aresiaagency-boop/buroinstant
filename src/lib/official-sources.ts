import { createHash } from "node:crypto";
import type { OfficialSourceReference } from "@/types/domain";

export const OFFICIAL_SOURCE_HOSTS = new Set([
  "sede.agenciatributaria.gob.es",
  "www2.agenciatributaria.gob.es",
  "boe.es",
  "www.boe.es",
  "administracion.gob.es",
  "www.administracion.gob.es",
  "paeelectronico.es",
  "www.paeelectronico.es",
  "seg-social.es",
  "www.seg-social.es",
  "registradores.org",
  "www.registradores.org",
]);

export const officialSourceCatalog = [
  {
    authority: "AEAT",
    title: "Portal de Empresas",
    url: "https://sede.agenciatributaria.gob.es/Sede/empresas.html",
    keywords: ["empresa", "sociedad", "iva", "impuesto", "nif", "censo"],
  },
  {
    authority: "AEAT",
    title: "Asistente Virtual Censal",
    url: "https://www2.agenciatributaria.gob.es/wlpl/AVAC-CALC/AsistenteCensal",
    keywords: ["036", "censal", "domicilio", "actividad", "obligaciones"],
  },
  {
    authority: "AEAT",
    title: "Impuesto sobre Actividades Económicas",
    url: "https://sede.agenciatributaria.gob.es/Sede/declaraciones-informativas-otros-impuestos-tasas/impuesto-sobre-actividades-economicas.html",
    keywords: ["iae", "epígrafe", "actividad económica"],
  },
  {
    authority: "BOE",
    title: "Boletín Oficial del Estado",
    url: "https://www.boe.es/",
    keywords: ["ley", "real decreto", "normativa", "vigencia"],
  },
  {
    authority: "Administración General del Estado",
    title: "CIRCE — Creación de empresas",
    url: "https://administracion.gob.es/pag_Home/Tramites/miEmpresaEnTramites/Iniciativas/CIRCE.html",
    keywords: ["circe", "due", "constitución", "pae"],
  },
  {
    authority: "Seguridad Social",
    title: "Seguridad Social",
    url: "https://www.seg-social.es/",
    keywords: ["reta", "autónomo", "trabajadores", "ccc", "seguridad social"],
  },
] as const;

export function isAllowedOfficialUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && OFFICIAL_SOURCE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function searchOfficialSourceCatalog(query: string) {
  const normalized = query.toLocaleLowerCase("es-ES");
  const matches = officialSourceCatalog.filter((source) =>
    source.keywords.some((keyword) => normalized.includes(keyword)),
  );
  return matches.length ? matches : officialSourceCatalog.slice(0, 3);
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchOfficialSource(initialUrl: string) {
  if (!isAllowedOfficialUrl(initialUrl)) throw new Error("OFFICIAL_SOURCE_NOT_ALLOWED");
  let currentUrl = initialUrl;
  let response: Response | null = null;

  for (let redirectCount = 0; redirectCount < 3; redirectCount += 1) {
    response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "BUROINSTANT-OfficialSourceVerifier/1.0" },
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location) break;
    const nextUrl = new URL(location, currentUrl).toString();
    if (!isAllowedOfficialUrl(nextUrl)) throw new Error("OFFICIAL_SOURCE_REDIRECT_BLOCKED");
    currentUrl = nextUrl;
  }

  if (!response?.ok) throw new Error("OFFICIAL_SOURCE_UNAVAILABLE");
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 1_500_000) throw new Error("OFFICIAL_SOURCE_TOO_LARGE");
  const html = await response.text();
  if (html.length > 1_500_000) throw new Error("OFFICIAL_SOURCE_TOO_LARGE");
  const normalizedText = htmlToText(html);
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? currentUrl;
  const fetchedAt = new Date().toISOString();

  return {
    url: currentUrl,
    title,
    fetchedAt,
    contentHash: createHash("sha256").update(normalizedText).digest("hex"),
    normalizedText,
    preview: normalizedText.slice(0, 1_200),
  };
}

export function toSourceReference(
  source: (typeof officialSourceCatalog)[number],
  fetchedAt: string | null,
): OfficialSourceReference {
  return {
    sourceTitle: source.title,
    sourceUrl: source.url,
    authority: source.authority,
    fetchedAt,
    lastVerifiedAt: fetchedAt,
    confidence: fetchedAt ? 0.96 : 0,
    informationalOnly: true,
  };
}

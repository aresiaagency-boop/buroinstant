import { describe, expect, it } from "vitest";
import { isAllowedOfficialUrl, searchOfficialSourceCatalog } from "@/lib/official-sources";

describe("official source boundary", () => {
  it("allows HTTPS requests to seeded official hosts", () => {
    expect(isAllowedOfficialUrl("https://sede.agenciatributaria.gob.es/Sede/empresas.html")).toBe(true);
    expect(isAllowedOfficialUrl("https://www.boe.es/buscar/act.php?id=BOE-A-2022-15818")).toBe(true);
  });

  it("blocks unknown domains, HTTP and crafted subdomains", () => {
    expect(isAllowedOfficialUrl("https://sede.agenciatributaria.gob.es.example.com/steal")).toBe(false);
    expect(isAllowedOfficialUrl("http://www.boe.es/")).toBe(false);
    expect(isAllowedOfficialUrl("https://example.com/")).toBe(false);
  });

  it("routes IAE questions to the official IAE source", () => {
    expect(searchOfficialSourceCatalog("¿Qué epígrafe IAE corresponde?")[0].title).toContain(
      "Actividades Económicas",
    );
  });
});

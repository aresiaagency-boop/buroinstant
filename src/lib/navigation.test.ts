import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/navigation";

describe("destinos de retorno tras el acceso", () => {
  it("conserva una ruta interna", () => {
    expect(safeInternalPath("/app?voz=1")).toBe("/app?voz=1");
    expect(safeInternalPath("/admin/usuarios")).toBe("/admin/usuarios");
  });

  it("no permite salir del dominio", () => {
    for (const hostile of [
      "//dominio-ajeno.tld",
      "https://dominio-ajeno.tld",
      "http://dominio-ajeno.tld/app",
      "/\\dominio-ajeno.tld",
      "javascript:alert(1)",
      "app",
    ]) {
      expect(safeInternalPath(hostile)).toBe("/app");
    }
  });

  it("descarta rutas con caracteres de control", () => {
    expect(safeInternalPath(`/app${String.fromCharCode(10)}Set-Cookie: x=1`)).toBe("/app");
  });

  it("cae al destino por defecto cuando no hay parámetro", () => {
    expect(safeInternalPath(undefined)).toBe("/app");
    expect(safeInternalPath(null)).toBe("/app");
    expect(safeInternalPath([])).toBe("/app");
  });

  it("acepta un destino alternativo explícito", () => {
    expect(safeInternalPath(undefined, "/")).toBe("/");
  });

  it("toma el primer valor cuando el parámetro se repite", () => {
    expect(safeInternalPath(["/admin", "//dominio-ajeno.tld"])).toBe("/admin");
  });
});

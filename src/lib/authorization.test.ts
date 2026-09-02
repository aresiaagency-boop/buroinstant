import { afterEach, describe, expect, it } from "vitest";
import { isSuperAdmin, isSuperAdminEmail, superAdminEmails } from "@/lib/authorization";
import type { Actor } from "@/types/domain";

const original = process.env.SUPERADMIN_EMAILS;

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    email: "aresiaagency@gmail.com",
    name: "RHC",
    mode: "oauth",
    ...overrides,
  };
}

afterEach(() => {
  if (original === undefined) delete process.env.SUPERADMIN_EMAILS;
  else process.env.SUPERADMIN_EMAILS = original;
});

describe("autoridad de superadministración", () => {
  it("sin variable configurada nadie es superadministrador", () => {
    delete process.env.SUPERADMIN_EMAILS;
    expect(superAdminEmails()).toEqual([]);
    expect(isSuperAdmin(actor())).toBe(false);
  });

  it("reconoce el correo configurado sin importar mayúsculas ni espacios", () => {
    process.env.SUPERADMIN_EMAILS = "  ARESIAAGENCY@Gmail.com ";
    expect(isSuperAdminEmail("aresiaagency@gmail.com")).toBe(true);
    expect(isSuperAdmin(actor())).toBe(true);
  });

  it("acepta varios correos separados por coma", () => {
    process.env.SUPERADMIN_EMAILS = "aresiaagency@gmail.com, socio@example.com";
    expect(isSuperAdminEmail("socio@example.com")).toBe(true);
    expect(superAdminEmails()).toHaveLength(2);
  });

  it("rechaza cualquier otro correo", () => {
    process.env.SUPERADMIN_EMAILS = "aresiaagency@gmail.com";
    expect(isSuperAdmin(actor({ email: "otra@example.com" }))).toBe(false);
    expect(isSuperAdminEmail(null)).toBe(false);
    expect(isSuperAdminEmail(undefined)).toBe(false);
    expect(isSuperAdminEmail("")).toBe(false);
  });

  it("la previsualización local nunca concede autoridad, aunque el correo coincida", () => {
    process.env.SUPERADMIN_EMAILS = "aresiaagency@gmail.com";
    expect(isSuperAdmin(actor({ mode: "local_preview" }))).toBe(false);
  });

  it("no hay actor, no hay autoridad", () => {
    process.env.SUPERADMIN_EMAILS = "aresiaagency@gmail.com";
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
  });
});

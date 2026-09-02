import Link from "next/link";
import type { ReactNode } from "react";
import { AppChrome } from "@/components/AppChrome";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Administración" };

const SECTIONS = [
  { href: "/admin", label: "Servicios" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/workspaces", label: "Espacios" },
  { href: "/admin/expedientes", label: "Expedientes" },
  { href: "/admin/ingesta", label: "Ingesta" },
  { href: "/admin/fuentes", label: "Fuentes" },
  { href: "/admin/calidad-ia", label: "Calidad IA" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireSuperAdmin();
  return (
    <AppChrome actor={actor} superAdmin section="Superadministración">
      <main className="admin-shell">
        <nav className="admin-nav" aria-label="Secciones de administración">
          {SECTIONS.map((section) => (
            <Link key={section.href} href={section.href}>
              {section.label}
            </Link>
          ))}
        </nav>
        {children}
      </main>
    </AppChrome>
  );
}

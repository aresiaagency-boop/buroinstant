import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BUROINSTANT", template: "%s · BUROINSTANT" },
  description:
    "Sistema operativo inteligente para convertir una idea empresarial en un expediente claro, verificable y ejecutable.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}

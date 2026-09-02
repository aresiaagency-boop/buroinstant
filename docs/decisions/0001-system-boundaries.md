# ADR-0001 — Fronteras del sistema

Estado: aceptada · 2026-09-02

## Decisión

- Next.js contiene la experiencia, autenticación y APIs síncronas.
- PostgreSQL es la fuente de verdad.
- Redis contiene solo estado efímero.
- n8n coordina trabajos asíncronos.
- Evolution API transporta WhatsApp.
- Los agentes interpretan; no sustituyen datos estructurados ni fuentes oficiales.

## Motivo

Evita mezclar transporte, automatización y fiscalidad, permite cambiar proveedores y conserva trazabilidad por tenant.

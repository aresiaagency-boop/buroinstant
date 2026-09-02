# ADR-0002 — Activación externa incremental

Estado: aceptada · 2026-09-02

## Decisión

Construir y verificar primero el producto, los contratos, migraciones y pruebas. Activar PostgreSQL, Google OAuth, n8n y Evolution en una segunda fase controlada con credenciales rotadas.

## Motivo

El JSON histórico puede estar conectado a un WhatsApp físico y contiene `pinData` sensible. Una importación o ejecución automática podría enviar mensajes reales o interrumpir el canal.

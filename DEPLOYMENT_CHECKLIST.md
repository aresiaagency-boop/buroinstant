# Checklist de despliegue

## Código

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Revisar diff y confirmar que no hay secretos ni `pinData`.

## PostgreSQL

- [ ] Backup verificado.
- [ ] Aplicar `001_core.sql`.
- [ ] Validar constraints e índices.
- [ ] Crear rol no propietario para la app.
- [ ] Aplicar/probar `002_tenant_rls.sql` con usuario A/B.
- [ ] Configurar `DATABASE_URL` solo en Vercel server-side.

## Google OAuth

- [ ] Confirmar pantalla de consentimiento.
- [ ] Crear/usar cliente Web autorizado.
- [ ] Añadir origen `APP_URL`.
- [ ] Añadir `${APP_URL}/api/auth/callback/google`.
- [ ] Guardar ID/secreto únicamente en Vercel.
- [ ] Probar login, callback, cookie, rutas protegidas y logout.

## n8n + Evolution

- [ ] Programar ventana de mantenimiento del WhatsApp físico.
- [ ] Confirmar que el único trigger es `messages.upsert`.
- [ ] Rotar la clave expuesta en `pinData`.
- [ ] Eliminar `pinData`.
- [ ] Mover credenciales al credential store.
- [ ] Cambiar buffer a `orbe:wa:{instance}:{phone}:buffer`.
- [ ] Añadir TTL de 30–120 s.
- [ ] Firmar el cuerpo exacto con `X-Orbe-Timestamp` y `X-Orbe-Signature`.
- [ ] Añadir `event: messages.upsert` al cuerpo interno.
- [ ] Probar duplicados sin volver a responder.
- [ ] Probar texto y audio con un número controlado.
- [ ] Confirmar que Evolution muestra `Connected` antes del E2E.

## Vercel

- [ ] Importar `aresiaagency-boop/buroinstant`.
- [ ] Framework Next.js y región europea.
- [ ] Configurar variables sin prefijo `NEXT_PUBLIC_`.
- [ ] Ejecutar migraciones antes de dirigir tráfico.
- [ ] Verificar `/api/health` sin valores sensibles.
- [ ] Probar 390×844, tablet y escritorio sin overflow.
- [ ] Revisar cabeceras CSP, cookies y errores.
- [ ] Confirmar dominio y actualizar callbacks OAuth.

## Criterio de salida

No declarar WhatsApp, OAuth, PostgreSQL ni consulta AEAT “operativos” hasta completar sus pruebas E2E. No presentar, firmar, pagar o registrar trámites administrativos automáticamente.

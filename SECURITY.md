# Seguridad

## Hallazgo crítico pendiente de acción operativa

`AgenteWhatsapp.json` contiene `pinData.Webhook[0].json.body.apikey`. El valor no fue leído en voz alta, copiado ni versionado. Debe tratarse como `POTENTIALLY_EXPOSED_SECRET`:

1. Rotar la API key en Evolution.
2. Eliminar todo `pinData` del workflow.
3. Guardar la nueva clave en credenciales n8n o secret manager.
4. Cambiar `Get Audio` y `whatsapp_response` para usar la credencial, no `body.apikey`.
5. Volver a desplegar y verificar sin revelar el secreto.

No realizar estos pasos mientras el flujo físico esté activo sin una ventana controlada y un plan de rollback.

## Webhook

- Acepta únicamente `messages.upsert`.
- HMAC SHA-256 sobre `timestamp + "." + rawBody`.
- Ventana antireplay de cinco minutos.
- Instancia comparada con `EVOLUTION_API_INSTANCE` server-side.
- `messageId` único por instancia.
- Payload validado con Zod.
- Rate limit efímero incorporado; reemplazar por Redis distribuido antes de escala horizontal.

## PII

- No registrar texto bruto, documentos, identificadores completos, tokens o claves en logs.
- Direcciones completas y titulares reales tienen columnas cifradas.
- Los documentos usan `object_key`, no blobs públicos; acceso mediante URL firmada y caducada.
- El audio original no se conserva por defecto. Persistir transcript, hash, origen y campos extraídos.
- Consentimiento de marketing separado y desactivado por defecto.

## Autenticación y tenancy

- Cookies HttpOnly, Secure en producción y SameSite Lax.
- Sesión de ocho horas y logout.
- Google OAuth solo se ofrece cuando todas las variables existen.
- Cada acceso a proyectos verifica membership server-side.
- RLS preparado como segunda barrera. Producción debe usar rol no propietario y contexto transaccional.

## Fuente oficial / SSRF

Solo se siguen URLs HTTPS en la allowlist; cada redirección vuelve a validarse. Nunca se atraviesan CAPTCHA, login, certificados ni controles de acceso.

## Respuesta a incidentes

1. Desconectar la integración afectada sin borrar evidencia.
2. Rotar credenciales.
3. Redactar logs y preservar IDs/hashes.
4. Revisar `audit_events` y `webhook_events`.
5. Determinar impacto por workspace.
6. Notificar conforme a RGPD y política aplicable.
7. Restaurar desde backup validado y documentar la decisión.

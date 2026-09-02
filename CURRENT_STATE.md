# Estado auditado — 2026-09-02

## Repositorio

`aresiaagency-boop/buroinstant` era público y contenía únicamente un `README.md`. No existía código funcional que preservar. BUROINSTANT se implementa en este repositorio desde una base limpia compatible con Vercel.

## Fuentes

- `SOURCE_STATUS: CHATGPT_SHARED_DEVELOPMENT_UNAVAILABLE` — el enlace compartido responde “Shared chat not found”.
- `SOURCE_STATUS: PROMPT_MAESTRO_AVAILABLE` — inspeccionado completo.
- `SOURCE_STATUS: AGENTE_WHATSAPP_AVAILABLE` — `C:\Users\lenovo\Downloads\AgenteWhatsapp.json`, auditado en lectura.
- `SOURCE_STATUS: VOICE_NOTES_UNAVAILABLE` — las dos notas indicadas por el prompt no fueron adjuntadas; `PENDING_VOICE_TRANSCRIPTION`.

## Plataformas observadas, sin mutación

- GitHub: repo `aresiaagency-boop/buroinstant`, rama `main`, README inicial.
- Vercel: el equipo `aresiaagency` ofrece el repositorio para importación.
- EasyPanel: servicio PostgreSQL del proyecto `gestor_tramites` en ejecución.
- n8n: workflow `ORBE · Ingesta empresarial segura`, cuatro nodos visibles.
- Evolution Manager 2.3.7: instancia `GESTOR_TRAMITES`, estado observado `Disconnected`.
- Google Cloud: proyecto `gestor-tramites-507321`, panel de APIs accesible; no se inspeccionaron ni crearon credenciales.

## Auditoría segura de `AgenteWhatsapp.json`

- `active: false`.
- 24 nodos y 22 raíces de conexión.
- Pipeline existente: Webhook POST, Redis, debounce, texto/audio, fetch Base64, conversión a archivo, transcripción, agente, memoria PostgreSQL y respuesta Evolution.
- La activación operativa indicada por el propietario es exclusivamente `messages.upsert`.
- Existe `pinData` en el nodo Webhook y un campo `apikey`; el valor nunca se mostró ni se copió.
- `Get Audio` y `whatsapp_response` utilizan la API key procedente del payload entrante.
- Las claves Redis actuales dependen del número, pero no están namespaced por instancia ni muestran TTL explícito.

## Estado de implementación

El código, esquema, seguridad, UI y contratos están implementados. Las integraciones externas permanecen `not_configured` hasta completar el checklist de despliegue. No se afirma que OAuth, PostgreSQL, Evolution, n8n o el envío físico por WhatsApp estén activos.

# Estado real, medido — 7 de septiembre de 2026

No es una lista de lo que creo que está hecho: es lo que respondieron los
sistemas al preguntarles.

## Lo que funciona

**Producción está al día.** `/api/health` responde `appliedMigrations: 8` y las
cuatro piezas conectadas: base de datos, Google OAuth, webhook de n8n y
Evolution. La ruta de la carpeta de trámites existe en producción (responde 401
sin sesión, no 404), así que el despliegue llevó el código nuevo.

**WhatsApp entrante.** Evolution → n8n → BUROINSTANT.

**La vinculación contesta BUROINSTANT, no el agente.** El workflow de ingesta
consulta a la aplicación antes de dejar hablar al agente. Ver
`VINCULACION_WHATSAPP.md`.

**El workflow de avisos está publicado y activo**, y rechaza en la puerta lo que
no trae el token. Ver `AVISOS_BUROINSTANT.md`.

## El bloqueo del entorno: qué era en realidad

Durante días el webhook de avisos respondía `401 ENV_ACCESS_DENIED` aunque
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` estaba puesto en el servicio de n8n, junto
con el secreto y las tres variables de Evolution.

La variable estaba bien puesta. **No era esa la puerta.**

`N8N_RUNNERS_MODE=external`: los nodos Code no se ejecutan dentro de n8n sino en
un contenedor aparte. Medido desde dentro de un nodo Code, con un workflow
temporal que sólo devolvía diagnóstico —nunca valores— y que se borró después:

```
$env     → "access to env vars denied"
process  → NO_DISPONIBLE
```

Ni siquiera `process` existe: el runner lo sanea. La puerta del runner es
`N8N_BLOCK_RUNNER_ENV_ACCESS`, que por defecto vale `true` y en modo externo se
configura dentro del propio contenedor del runner
(`/etc/n8n-task-runners.json`, como `env-override`), no como variable del
servicio de n8n. Y `N8N_BLOCK_ENV_ACCESS_IN_NODE` ya valía `false` por defecto,
así que ponerlo no cambiaba nada.

**Solución tomada: dejar de necesitar `$env`.** El secreto salió del nodo Code y
pasó a una credencial de cabecera del propio webhook, que comprueba n8n antes de
arrancar el workflow. Lo que no necesita secreto —marca de tiempo, forma del
mensaje— se sigue comprobando dentro. Detalle en `AVISOS_BUROINSTANT.md`.

Esto además paga parte de la deuda de seguridad: la clave de Evolution del
workflow de avisos ya no está en una variable de entorno en claro, sino en una
credencial cifrada de n8n.

## Lo que falta

### 1 · Pegar el valor de dos credenciales

En n8n → Credentials, las dos están creadas y enlazadas, con el texto
`PENDIENTE_DE_PEGAR`:

| Credencial | Valor que hay que pegar |
|---|---|
| `BUROINSTANT token de avisos` | El mismo que `WHATSAPP_OUTBOUND_SECRET` en Vercel |
| `Evolution apikey avisos` | La clave de Evolution |

Hasta entonces el workflow rechaza todo con 403. Es deliberado: falla cerrado.

### 2 · Rotar dos secretos, y que sean distintos

`BUROINSTANT_OUTBOUND_SECRET` y `EVOLUTION_API_KEY` tienen **hoy el mismo
valor** en las variables del servicio de n8n. Son dos permisos distintos —uno
deja mandar avisos, otro deja usar la cuenta de WhatsApp— y comparten una sola
llave: quien consiga una tiene las dos.

Además ese valor ha estado en las variables de entorno en claro y ha aparecido
en capturas de pantalla.

Genera **dos** valores nuevos y distintos:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- El primero → credencial `BUROINSTANT token de avisos` en n8n **y**
  `WHATSAPP_OUTBOUND_SECRET` en Vercel. Tienen que coincidir.
- El segundo → la clave del servicio de Evolution (`AUTHENTICATION_API_KEY`),
  reiniciar Evolution, y luego la credencial `Evolution apikey avisos` en n8n.

Cuando estén puestas por credencial, las variables `BUROINSTANT_OUTBOUND_SECRET`
y `EVOLUTION_API_KEY` del servicio de n8n **sobran**: se pueden borrar.

### 3 · Variables en Vercel

`CRON_SECRET`, `WHATSAPP_OUTBOUND_SECRET`,
`WHATSAPP_OUTBOUND_WEBHOOK_URL=https://gestor-tramites-n8n.7dklrk.easypanel.host/webhook/buroinstant-aviso`,
`BUROINSTANT_WHATSAPP_NUMBER=34661030625`, `APP_URL=https://buroinstant.vercel.app`
y `DOCUMENT_ENCRYPTION_KEY`.

### 4 · Deuda pendiente en la ingesta

`Edit Fields6` sigue copiando `instance.apikey` del cuerpo del webhook, y
`Get Audio` y `whatsapp_response` la usan desde ahí. La clave queda en los datos
de ejecución, y el cuerpo del webhook es entrada no confiable. La corrección es
la misma que se acaba de aplicar en los avisos: una credencial de cabecera y la
URL como constante. No se ha tocado porque cambia el camino de una credencial en
la ingesta, que ahora mismo funciona.

## Cómo volver a medir esto

| Qué | Cómo |
|---|---|
| Estado de producción | `https://buroinstant.vercel.app/api/health` |
| Si falta desplegar | `appliedMigrations` menor que el número de archivos en `db/migrations/` |
| Si los avisos autentican | `node n8n/probar-avisos.mjs <url> <secreto> <telefono>` |
| Si el runner lee el entorno | Un nodo Code con `$env`: si dice `access to env vars denied`, no |
| Qué falla en la ingesta | El error lo dice: `INGESTION_NOT_CONFIGURED`, `INVALID_SIGNATURE` o `INSTANCE_MISMATCH` |

# AVISOS_BUROINSTANT · el workflow que envía los avisos de vencimiento

BUROINSTANT **no habla con Evolution**. Llama a este workflow, y este workflow
es quien envía con la credencial de Evolution. Así la clave de Evolution vive en
un solo sitio —n8n— y no viaja nunca a Vercel.

```
BUROINSTANT (cron diario)          n8n (este workflow)              Evolution
  cabecera con el token      →   n8n comprueba el token          →   envía el texto
  + marca de tiempo               y luego la marca y el cuerpo
```

## Por qué la firma HMAC ya no se verifica aquí

El diseño original firmaba el cuerpo con HMAC-SHA256 y el nodo Code lo
comprobaba leyendo el secreto de `$env`. **En esta instancia eso no puede
funcionar**, y no por una variable mal puesta:

`N8N_RUNNERS_MODE=external`. Los nodos Code no se ejecutan dentro de n8n sino en
un contenedor aparte, el *task runner*. Medido desde dentro de un nodo Code:

```
$env      → "access to env vars denied"
process   → NO_DISPONIBLE
```

`N8N_BLOCK_ENV_ACCESS_IN_NODE` ya vale `false` en el servicio de n8n —y su valor
por defecto ya era `false`—, pero no es esa la puerta. La del runner es
`N8N_BLOCK_RUNNER_ENV_ACCESS`, que por defecto vale `true`, y en modo externo se
configura dentro del propio contenedor del runner (`/etc/n8n-task-runners.json`,
como `env-override`), no como variable del servicio.

Así que el secreto se sacó del nodo Code:

- **Quién llama** lo comprueba n8n en la puerta, con una credencial de cabecera
  del propio nodo Webhook. El secreto vive cifrado en n8n y ningún nodo lo lee.
- **La marca de tiempo** se sigue comprobando dentro, y no necesita secreto: es
  lo que impide reenviar una petición legítima capturada antes.
- **La firma** sigue viajando. No estorba, y el día que el runner pueda leer el
  entorno se vuelve a verificar sin tocar el lado de BUROINSTANT.

Es el mismo trato que ya usaba la ingesta en sentido contrario —un secreto
compartido por cabecera, sobre HTTPS—, ahora en los dos sentidos.

## Las dos credenciales

No hay ninguna variable de entorno que configurar. Hay dos credenciales de tipo
**Header Auth** en n8n, ya creadas y enlazadas a los nodos. Sólo falta pegar su
valor:

| Credencial | Cabecera | Valor |
|---|---|---|
| `BUROINSTANT token de avisos` | `X-Buroinstant-Token` | El mismo que `WHATSAPP_OUTBOUND_SECRET` en Vercel |
| `Evolution apikey avisos` | `apikey` | La clave de Evolution |

Las dos están puestas hoy con el texto `PENDIENTE_DE_PEGAR`. En n8n:
**Credentials → abrir → pegar el valor → Save**.

La URL y la instancia de Evolution son constantes del nodo, no secretos, y ya
están puestas.

## Qué comprueba antes de enviar

Primero n8n, en el webhook: sin el token correcto responde **403** y el workflow
ni siquiera arranca. Después el nodo `Verificar aviso`, que responde **401** con
el motivo:

| Comprobación | Motivo devuelto |
|---|---|
| El cuerpo no es JSON | `BODY_NOT_JSON` |
| Falta la cabecera de tiempo | `MISSING_TIMESTAMP` |
| La marca de tiempo no es una fecha | `BAD_TIMESTAMP` |
| La marca de tiempo tiene más de 5 minutos | `TIMESTAMP_OUT_OF_WINDOW` |
| El origen no es el de los avisos | `BAD_SOURCE` |
| El teléfono no son de 7 a 20 dígitos | `BAD_PHONE` |
| El texto está vacío o pasa de 4000 caracteres | `BAD_TEXT` |
| Cualquier otro fallo inesperado | `VERIFICATION_ERROR` |

Comprobado contra el webhook real, con el workflow publicado y activo:

```
sin token            → 403 Authorization data is wrong!
token equivocado     → 403 Authorization data is wrong!
sin marca de tiempo  → 401 MISSING_TIMESTAMP
marca ilegible       → 401 BAD_TIMESTAMP
marca de hace 30 min → 401 TIMESTAMP_OUT_OF_WINDOW
origen distinto      → 401 BAD_SOURCE
teléfono con letras  → 401 BAD_PHONE
texto vacío          → 401 BAD_TEXT
texto de 4001        → 401 BAD_TEXT
```

Dos detalles que importan:

- **Falla cerrado.** Cualquier duda rechaza. Antes de que se colara un aviso sin
  comprobar, prefiere no enviar ninguno.
- BUROINSTANT **no da por enviado un aviso porque el HTTP diga 200**: exige que
  el cuerpo responda `{"ok": true}`. Si el workflow revienta antes de su nodo de
  respuesta, n8n contesta 200 con el cuerpo vacío y no se envió nada; darlo por
  bueno haría constar como entregado un aviso que la persona nunca recibió.

## Probarlo

Con las dos credenciales rellenas:

```bash
node n8n/probar-avisos.mjs https://TU-N8N/webhook/buroinstant-aviso EL_SECRETO 34XXXXXXXXX
```

Siete peticiones: la primera debe dar **200** y llegar el mensaje; las otras
seis, 403 o 401 con el motivo de arriba. Sólo la primera envía algo.

Si la primera da 200 pero no llega el mensaje, el problema está entre n8n y
Evolution, no en la autenticación: mira la salida del nodo `Enviar por
Evolution`, que está configurado para no romper la ejecución y dejar ver el
código de respuesta.

## En Vercel

| Variable | Qué es |
|---|---|
| `WHATSAPP_OUTBOUND_WEBHOOK_URL` | La Production URL del nodo `Aviso entrante`, que acaba en `/webhook/buroinstant-aviso`. |
| `WHATSAPP_OUTBOUND_SECRET` | El mismo valor que la credencial `BUROINSTANT token de avisos`. Mínimo 24 caracteres. |
| `CRON_SECRET` | Protege la tarea diaria que mira los vencimientos. |

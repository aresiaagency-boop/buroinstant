# AVISOS_BUROINSTANT · el workflow que envía los avisos de vencimiento

BUROINSTANT **no habla con Evolution**. Firma un payload y llama a este
workflow; este workflow verifica la firma y es quien envía con la credencial de
Evolution. Así la clave de Evolution vive en un solo sitio —n8n— y no viaja
nunca a Vercel.

```
BUROINSTANT (cron diario)          n8n (este workflow)              Evolution
  firma HMAC-SHA256          →   verifica firma y ventana     →   envía el texto
  timestamp + "." + body          rechaza con 401 si falla
```

## 1 · Importar

En n8n: **Workflows → ⋯ → Import from File** y elige
`avisos-buroinstant.workflow.json`.

## 2 · Variables de entorno de n8n

El workflow no lleva ningún secreto dentro: los lee del entorno.

| Variable | Qué es |
|---|---|
| `BUROINSTANT_OUTBOUND_SECRET` | El mismo valor que `WHATSAPP_OUTBOUND_SECRET` en Vercel. Mínimo 24 caracteres. |
| `EVOLUTION_API_URL` | La base de tu Evolution, sin barra final. |
| `EVOLUTION_INSTANCE` | El nombre de la instancia. |
| `EVOLUTION_API_KEY` | La clave de Evolution. **Rótala antes**: la anterior viajó dentro del cuerpo del webhook de ingesta y quedó en los datos de ejecución. |

En EasyPanel se añaden en las variables de entorno del servicio de n8n; hace
falta reiniciar el servicio para que las lea.

## 3 · Activar y copiar la URL

Publica el workflow y copia la **Production URL** del nodo `Aviso entrante`.
Termina en `/webhook/buroinstant-aviso`. Ese valor es
`WHATSAPP_OUTBOUND_WEBHOOK_URL` en Vercel.

## 4 · Qué comprueba antes de enviar

El nodo `Verificar firma` rechaza y responde **401** si falla cualquiera de
estas, y sólo mira el contenido del mensaje **después** de validar la firma:
antes de eso el cuerpo es de origen desconocido.

| Comprobación | Motivo devuelto |
|---|---|
| El secreto no está configurado, o tiene menos de 24 caracteres | `SECRET_NOT_CONFIGURED` |
| Falta la cabecera de firma o la de tiempo | `MISSING_SIGNATURE` |
| La marca de tiempo no es una fecha | `BAD_TIMESTAMP` |
| La marca de tiempo tiene más de 5 minutos | `TIMESTAMP_OUT_OF_WINDOW` |
| La firma no coincide | `BAD_SIGNATURE` |
| El cuerpo no es JSON | `BODY_NOT_JSON` |
| El teléfono no son de 7 a 20 dígitos | `BAD_PHONE` |
| El texto está vacío o pasa de 4000 caracteres | `BAD_TEXT` |
| El origen no es el de los avisos | `BAD_SOURCE` |

Dos detalles que importan:

- La firma se calcula sobre los **bytes exactos** que llegaron (`rawBody`), no
  sobre el JSON re-serializado. Volver a serializar puede cambiar el orden de
  las claves o el escapado y romper una firma que era buena.
- La ventana de 5 minutos es lo que impide **reenviar** una petición legítima
  capturada antes. Sin ella, quien grabe una petición válida puede repetirla
  cuando quiera.

## 5 · Probarlo

Con el workflow publicado:

```bash
node n8n/probar-avisos.mjs https://TU-N8N/webhook/buroinstant-aviso EL_SECRETO 34XXXXXXXXX
```

Manda cuatro peticiones y espera:

1. firma correcta → **200** y el mensaje llega al teléfono
2. sin firma → **401 MISSING_SIGNATURE**
3. firma de otro secreto → **401 BAD_SIGNATURE**
4. cuerpo alterado después de firmar → **401 BAD_SIGNATURE**

Si el primero da 200 pero no llega el mensaje, el problema está entre n8n y
Evolution, no en la firma: mira la salida del nodo `Enviar por Evolution`, que
está configurado para no romper la ejecución y dejar ver el código de respuesta.

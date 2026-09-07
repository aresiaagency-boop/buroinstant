# La vinculación por WhatsApp: qué fallaba y qué se ha hecho

## Lo que se vio

El panel dio el código `FV8XC8`. Se envió `VINCULAR FV8XC8` al +34 661 030 625.
Contestó:

> Eso no forma parte de lo que puedo hacer. Sigamos con tu empresa. ¿Tienes
> alguna forma jurídica en mente para la panadería, o necesitas ayuda para
> decidir?

Esa frase la escribe el **agente de IA**, no BUROINSTANT. Y menciona una
panadería de una conversación anterior: es el agente contestando desde su
memoria, ajeno por completo a que ese mensaje era un código de vinculación.

## Por qué

En el workflow `INGESTA_BUROINSTANT` la persistencia y la respuesta van por
caminos separados:

```
Code2 ─┬─► AI Agent ──► whatsapp_response     (esto es lo que lee la persona)
       └─► BUROINSTANT_PERSISTIR              (su respuesta no la lee nadie)
```

BUROINSTANT sí reconocía el código y sí devolvía el texto que había que enviar,
en `replyText`. **Nadie lo leía.** Quien contesta es siempre el agente, y el
agente no sabe nada de códigos.

El mismo agujero afectaba a un caso más grave: un número **desconocido** que
escribe recibe una conversación completa con el agente, en vez de que se le diga
que primero tiene que vincular su teléfono.

## Lo corregido en la aplicación

`/api/internal/ingestion/whatsapp` ahora responde con un contrato en el que no
hay que adivinar nada:

| Campo | Para qué |
|---|---|
| `handled` | `true` = la respuesta ya está decidida aquí, el agente no debe hablar. `false` = es conversación, le toca al agente. |
| `replyText` | El texto exacto que hay que enviar. Se manda tal cual. |

Además:

- **Un código inválido ya no devuelve 409.** Devuelve 200 con
  `status: LINK_CODE_INVALID`. Un 4xx hace fallar el nodo del workflow, y una
  persona que se equivoca de código se quedaba sin ninguna respuesta.
- **Un fallo de base de datos ya no se disfraza de código inválido.** Antes un
  `.catch(() => null)` convertía cualquier error en «ese código no vale», que es
  mentira y además hace pedir otro código que fallará igual. Ahora devuelve 500
  para que el workflow lo reintente.
- **Seis letras sueltas ya no son necesariamente un código.** `PANADE` encaja en
  el alfabeto de los códigos. Si no canjea nada, se trata como conversación en
  vez de contestar «código inválido» a quien no estaba vinculando. Con el
  prefijo `VINCULAR` no hay duda, y ahí sí se avisa.
- **`VINCULAR` sin código también se reconoce.** Quien se come el código quería
  vincular; se le dice qué falta.
- **Un evento duplicado responde `handled: true` sin texto**, para que un reenvío
  de Evolution no conteste dos veces.

Comprobado contra el servidor construido y PostgreSQL real, el ciclo entero:

| Mensaje | Respuesta de la aplicación |
|---|---|
| Desconocido escribe normal | 200 `LINK_REQUIRED`, `handled: true` |
| Desconocido escribe `PANADE` | 200 `LINK_REQUIRED`, `handled: true` |
| `VINCULAR` sin código | 200 `LINK_CODE_INVALID`, dice qué falta |
| `VINCULAR ZZZZZZ` | 200 `LINK_CODE_INVALID` |
| `VINCULAR <código bueno>` | 200 `LINKED` y el panel pasa a vinculado |
| El mismo código otra vez | 200 `LINK_CODE_INVALID` (un código vale una vez) |
| Vinculado, conversación | 200 `APPLIED`, `handled: false` → contesta el agente |
| Mismo `messageId` repetido | 200 `DUPLICATE_EVENT`, sin texto |
| Sin firma ni Bearer | 401 `INVALID_SIGNATURE` |

## El workflow, ya recableado

Aplicado y publicado en `INGESTA_BUROINSTANT` (`1ns7a4kGuoI4Wf57`), activo.

**Antes**

```
Code2 ─┬─► AI Agent ──► whatsapp_response
       └─► BUROINSTANT_PERSISTIR        (y el agente lo llamaba otra vez)
```

**Ahora**

```
Code2 ──► BUROINSTANT_PERSISTIR ─┬─(ok)──► RESPONDE_LA_APP
                                 │            ├─ hay replyText ──► TEXTO_DE_LA_APP ──► whatsapp_response
                                 │            ├─ handled, sin texto ──► SIN_RESPUESTA
                                 │            └─ resto ──► AI Agent ──► whatsapp_response
                                 └─(error)──► AVISO_DE_FALLO ──► whatsapp_response
```

- `TEXTO_DE_LA_APP` copia `replyText` a `output`, que es lo que
  `whatsapp_response` ya enviaba. Así ese nodo no se toca.
- `BUROINSTANT_PERSISTIR` reintenta una vez y, si aun así falla, la persona
  recibe *«Ahora mismo no puedo consultar tu expediente. Vuelve a escribirme en
  unos minutos.»* — la verdad, en vez de dejar que el agente conteste como si el
  sistema funcionara.
- Se ha quitado la llamada duplicada `AI Agent → BUROINSTANT_PERSISTIR`: el
  mensaje se persistía dos veces.

### Comprobado antes de dejarlo puesto

Con un workflow temporal que sólo evaluaba el Switch —sin tocar WhatsApp— y que
se borró después. Cada caso fue por donde debía:

| Respuesta de la aplicación | Rama |
|---|---|
| `LINKED` con texto | contesta la app |
| `LINK_CODE_INVALID` con texto | contesta la app |
| `LINK_REQUIRED` con texto | contesta la app |
| `DUPLICATE_EVENT`, sin texto | silencio |
| `APPLIED`, `handled: false` | contesta el agente |

## Para probar con datos reales

1. **El push a `main`** — hay tres commits sin desplegar y producción todavía
   responde con el contrato viejo. Desde tu terminal de Windows:
   ```
   git push origin feat/bloque-a-superadmin:main
   ```
   (El shell que uso no tiene tus credenciales de GitHub.)
2. En Vercel: `APP_URL=https://buroinstant.vercel.app` y
   `BUROINSTANT_WHATSAPP_NUMBER=34661030625`.
3. Comprobar que el token de la credencial «Bearer Auth account» de n8n es
   exactamente `N8N_WEBHOOK_SECRET` de Vercel. Si no, la ruta responde 401,
   ahora visible: la persona recibirá el aviso de fallo en vez de silencio.
4. Desde el panel, pedir el código y usar **Abrir WhatsApp con el mensaje
   escrito**: evita equivocarse de carácter al copiarlo.
5. Enviar. Debe contestar el texto de vinculación —no el agente— y el panel
   pasar a «vinculado» al recargar.
6. Escribir después cualquier cosa: ahí sí debe contestar el agente.

Nota: hasta el push, producción devuelve 409 para un código inválido, y el nodo
lo tratará como error → llegará el aviso de fallo. Un código **correcto** ya
funciona hoy, porque el 200 con `replyText` no ha cambiado.

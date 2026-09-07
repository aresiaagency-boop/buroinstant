# La vinculación por WhatsApp: qué fallaba y qué falta

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

## Lo que falta: recablear el workflow

Sin este cambio la corrección no llega a la persona, porque quien envía el
mensaje es n8n.

**Antes**

```
Code2 ─┬─► AI Agent ──► whatsapp_response
       └─► BUROINSTANT_PERSISTIR
```

**Después**

```
Code2 ──► BUROINSTANT_PERSISTIR ──► Switch «¿contesta la app?»
                                      ├─ replyText con texto ─► whatsapp_response  ({{ $json.replyText }})
                                      ├─ handled = true, sin texto ─► No Operation
                                      └─ handled = false ─► AI Agent ─► whatsapp_response  ({{ $json.output }})
```

Tres detalles que importan:

1. `BUROINSTANT_PERSISTIR` tiene que quedar **antes** del agente, no en paralelo:
   es quien sabe si el número está vinculado.
2. El nodo debe tener **«Never Error»** desactivado para 5xx —un 500 tiene que
   reintentarse, no colarse como si nada— y activado para nada más.
3. `whatsapp_response` pasa a tener dos entradas. La rama de la aplicación envía
   `{{ $json.replyText }}`; la del agente sigue enviando `{{ $json.output }}`.

Hoy no se ha podido aplicar: la sesión de n8n está caducada y responde 401 a la
API. Entra en n8n y vuelvo a montarlo.

## Para probar con datos reales, cuando esté

1. En Vercel: `APP_URL=https://buroinstant.vercel.app` y
   `BUROINSTANT_WHATSAPP_NUMBER=34661030625`.
2. Comprobar que el token de la credencial «Bearer Auth account» de n8n es
   exactamente `N8N_WEBHOOK_SECRET` de Vercel. Si no, la ruta responde 401 y
   nada entra en el expediente aunque el agente conteste con normalidad.
3. Desde el panel, pedir el código y usar el botón **Abrir WhatsApp con el
   mensaje escrito**: evita equivocarse de carácter al copiarlo.
4. Enviar. Debe contestar el texto de vinculación, no el agente, y el panel debe
   pasar a «vinculado» al recargar.
5. Escribir después cualquier cosa: ahí sí debe contestar el agente.

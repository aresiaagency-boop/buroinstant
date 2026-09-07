# Cómo conseguir cada variable de los avisos

Cinco variables en n8n y tres en Vercel. Dos de las de n8n ya están
averiguadas de tu propia instalación; las otras tres las decides o las generas
tú.

---

## Dónde se ponen las variables de n8n

Todas van al **mismo sitio**, y el sitio no es n8n: es EasyPanel.

1. Entra en EasyPanel.
2. Abre el proyecto donde vive n8n (el que sirve
   `gestor-tramites-n8n.7dklrk.easypanel.host`).
3. Pulsa el servicio **n8n**.
4. Pestaña **Environment** (a veces «Env» o «Variables de entorno»).
5. Verás una caja de texto con líneas `CLAVE=valor`. Añade las tuyas, una por
   línea, sin comillas y sin espacios alrededor del `=`.
6. **Save**, y después **Deploy** o **Restart** en ese servicio.

El reinicio no es opcional: n8n lee el entorno al arrancar. Si guardas y no
reinicias, sigue sin verlas y el workflow te seguirá devolviendo el mismo
error.

Para comprobar que han entrado, vuelve a lanzar la prueba del apartado final.

---

## 1 · `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`

**No hay nada que conseguir: el valor es literalmente `false`.** Se copia tal
cual.

**Qué hace.** Por defecto n8n prohíbe que un nodo Code lea variables de
entorno. Es una protección razonable: evita que un workflow importado de
internet se lleve tus secretos. Pero el nodo que verifica la firma necesita
leer el secreto compartido, y sin este permiso lanza
`access to env vars denied`.

**Comprobado en tu instancia:** es exactamente lo que estaba pasando. El nodo
reventaba y el webhook respondía `401 ENV_ACCESS_DENIED`.

**Qué estás abriendo al ponerlo.** Que **cualquier** nodo Code de **cualquier**
workflow de esa instancia pueda leer **todas** las variables de entorno del
servicio. En tu caso hay tres workflows, todos tuyos, así que el riesgo real es
bajo. Pero la regla que se deriva es firme: a partir de ahora, **no importes en
esa instancia workflows de terceros sin leer antes su código**.

---

## 2 · `BUROINSTANT_OUTBOUND_SECRET`

**Este lo generas tú.** Es una contraseña larga que sólo conocen dos sitios:
BUROINSTANT, que firma, y n8n, que verifica. No se pide a nadie ni se saca de
ningún panel.

Genéralo en tu terminal:

```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Salen 48 caracteres. El mínimo que acepta el workflow son 24; por debajo de eso
responde `SECRET_NOT_CONFIGURED` a propósito, para que un secreto flojo no pase
por bueno.

**El mismo valor va en dos sitios, y tienen que ser idénticos:**

| Dónde | Nombre de la variable |
|---|---|
| n8n (EasyPanel) | `BUROINSTANT_OUTBOUND_SECRET` |
| Vercel | `WHATSAPP_OUTBOUND_SECRET` |

Se llaman distinto porque cada lado lo nombra desde su punto de vista: para
BUROINSTANT es «el secreto de salida», para n8n es «el secreto de BUROINSTANT».
El valor es el mismo.

Si no coinciden, el workflow responde `401 BAD_SIGNATURE`. Eso no es un fallo:
es la comprobación funcionando.

Guárdalo en tu gestor de contraseñas antes de pegarlo. Si lo pierdes, se
regenera y se cambia en los dos sitios; no se pierde nada más.

---

## 3 · `EVOLUTION_API_URL`

**Ya está averiguada.** Sale de una ejecución real de tu workflow de ingesta:

```
EVOLUTION_API_URL=https://gestor-tramites-evolution-api.7dklrk.easypanel.host
```

**Sin barra al final.** El workflow le añade `/message/sendText/...`, y con
barra saldría una URL con `//` que Evolution rechaza.

**De dónde salió.** Tu Evolution manda ese valor dentro del propio webhook, en
`instance.server_url`. Se puede confirmar también en EasyPanel: es el dominio
del servicio `gestor-tramites-evolution-api`.

---

## 4 · `EVOLUTION_INSTANCE`

**Ya está averiguada**, del mismo sitio (`instance.instance`):

```
EVOLUTION_INSTANCE=GESTOR_TRAMITES
```

Respeta mayúsculas y guion bajo: Evolution distingue.

**Qué es.** Una instancia de Evolution es una sesión de WhatsApp: un número
vinculado por QR. Ésta es la que ya tienes conectada y por la que te llegan los
mensajes. Puedes verla en el panel de Evolution, en la lista de instancias.

---

## 5 · `EVOLUTION_API_KEY` — y por qué hay que rotarla antes

**Dónde está ahora.** Es la clave de tu Evolution. Vive en EasyPanel, en el
servicio **gestor-tramites-evolution-api**, pestaña **Environment**,
normalmente como `AUTHENTICATION_API_KEY`.

**Por qué hay que cambiarla antes de usarla.** Tu Evolution manda esa clave
**dentro del cuerpo de cada webhook** que envía a n8n, en `instance.apikey`.
Comprobado: está ahí, en los datos de ejecución guardados. Consecuencias:

- Queda escrita en el historial de ejecuciones de n8n, sin cifrar.
- Cualquiera que abra una ejecución la ve.
- Si alguna vez exportaste o compartiste una ejecución, viajó con ella.

Una clave que ha estado a la vista deja de ser un secreto, aunque no sepas de
nadie que la haya mirado. Por eso el orden importa: **primero rotar, después
configurar**.

### Cómo rotarla

1. Genera una nueva:
   ```
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
2. EasyPanel → servicio **gestor-tramites-evolution-api** → **Environment** →
   sustituye el valor de `AUTHENTICATION_API_KEY` → **Save** → **Restart**.
3. EasyPanel → servicio **n8n** → **Environment** → pon la **nueva** clave en
   `EVOLUTION_API_KEY` → **Save** → **Restart**.

### Dónde hay que pegar la clave nueva: en DOS sitios, y ya

Comprobado uno por uno en tu proyecto, no supuesto:

| Sitio | ¿Hay que pegarla? | Por qué |
|---|---|---|
| Evolution → `AUTHENTICATION_API_KEY` | **Sí** | Es el origen: define cuál es la clave válida |
| n8n → `EVOLUTION_API_KEY` | **Sí** | `AVISOS_BUROINSTANT` la lee del entorno para enviar |
| n8n → workflow `INGESTA_BUROINSTANT` | **No** | La recibe dentro de cada webhook; se actualiza sola |
| n8n → credenciales guardadas | **No** | Las cuatro que hay son Postgres, OpenAI, Redis y Bearer Auth. Ninguna es de Evolution |
| Dentro de cualquier workflow | **No** | Ninguno la lleva escrita a mano. Comprobados los tres |
| Vercel / BUROINSTANT | **No** | La app **no envía** por Evolution: sólo comprueba que responde y valida la instancia del evento entrante. Nunca lee ninguna clave suya |

Es decir: **Evolution y n8n. Nada más.**

Ojo con Vercel: en el README y en `.env.example` figuraba un
`EVOLUTION_API_KEY` como si la app lo necesitara. **No lo necesita** — no hay
una sola línea de código que lo lea. Estaba de más y se ha quitado. Pegar ahí
la clave sería dejar un secreto expuesto en un sitio donde no sirve para nada,
que es lo peor de los dos mundos.

### Lo que sí cambia al rotar

- **El panel de Evolution te pedirá la clave nueva** la próxima vez que entres.
  La clave global es también la que da acceso al gestor.
- **Se corta el acceso a cualquier otra cosa que llame a Evolution con la clave
  vieja.** En este proyecto sólo es n8n, pero si tienes algo tuyo aparte
  —un script, Postman, otra automatización— tendrás que actualizarlo.
- **La instancia de WhatsApp NO se desvincula.** El QR y la sesión no dependen
  de la clave. Aun así, compruébalo enviándote un mensaje después.

### Lo que queda pendiente aparte

Rotar la clave no arregla la causa: tu Evolution **seguirá mandándola** dentro
de cada webhook, y volverá a quedar guardada en las ejecuciones. Arreglarlo del
todo es dejar de propagar `instance.apikey` en el nodo `Edit Fields6` del
workflow de ingesta, para que no llegue a los datos guardados. Es un cambio
aparte, en otro workflow, y conviene hacerlo con calma.

---

## Resumen para copiar

**En EasyPanel → servicio n8n → Environment:**

```
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
BUROINSTANT_OUTBOUND_SECRET=<lo que generes>
EVOLUTION_API_URL=https://gestor-tramites-evolution-api.7dklrk.easypanel.host
EVOLUTION_INSTANCE=GESTOR_TRAMITES
EVOLUTION_API_KEY=<la NUEVA, después de rotarla>
```

Save → Restart.

**En Vercel → Settings → Environment Variables → Production:**

```
CRON_SECRET=<genera otro distinto>
WHATSAPP_OUTBOUND_SECRET=<el MISMO que BUROINSTANT_OUTBOUND_SECRET>
WHATSAPP_OUTBOUND_WEBHOOK_URL=https://gestor-tramites-n8n.7dklrk.easypanel.host/webhook/buroinstant-aviso
```

Y redespliega.

---

## Comprobar que ha funcionado

```
node n8n/probar-avisos.mjs \
  https://gestor-tramites-n8n.7dklrk.easypanel.host/webhook/buroinstant-aviso \
  EL_SECRETO 34XXXXXXXXX
```

Lo que debes ver:

| Prueba | Antes de configurar | Bien configurado |
|---|---|---|
| firma correcta | 401 `ENV_ACCESS_DENIED` | **200** y llega el mensaje |
| sin firma | 401 `ENV_ACCESS_DENIED` | 401 `MISSING_SIGNATURE` |
| firma de otro secreto | 401 `ENV_ACCESS_DENIED` | 401 `BAD_SIGNATURE` |
| cuerpo alterado | 401 `ENV_ACCESS_DENIED` | 401 `BAD_SIGNATURE` |

Que los motivos cambien de `ENV_ACCESS_DENIED` a `MISSING_SIGNATURE` y
`BAD_SIGNATURE` es la señal de que la verificación está trabajando de verdad, y
no simplemente cortando por configuración.

### Si algo no cuadra

| Lo que ves | Qué falta |
|---|---|
| `ENV_ACCESS_DENIED` | Falta `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, o no reiniciaste |
| `SECRET_NOT_CONFIGURED` | Falta `BUROINSTANT_OUTBOUND_SECRET`, o tiene menos de 24 caracteres |
| `BAD_SIGNATURE` en la prueba buena | Los dos secretos no son idénticos |
| 200 pero no llega el mensaje | El problema está entre n8n y Evolution: mira el nodo `Enviar por Evolution` en la ejecución |
| `TIMESTAMP_OUT_OF_WINDOW` | El reloj del servidor va desviado más de 5 minutos |

---

## Aparte: por qué la ingesta de WhatsApp devuelve `INGESTION_NOT_CONFIGURED`

Si el nodo `BUROINSTANT_PERSISTIR` del workflow de ingesta falla con
**503 `INGESTION_NOT_CONFIGURED`**, no es un problema de n8n ni de Evolution:
es que a BUROINSTANT le falta una variable en Vercel.

La ruta de ingesta se niega a funcionar si falta cualquiera de estas tres:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Sin base de datos no hay dónde guardar |
| `N8N_WEBHOOK_SECRET` | Sin secreto no se puede autenticar a n8n |
| `EVOLUTION_API_INSTANCE` | Sin ella no se puede comprobar de qué instancia viene |

Rechaza en bloque a propósito: aceptar mensajes a medias con la configuración
incompleta sería peor que no aceptarlos.

**Para saber cuál falta**, sin adivinar, abre:

```
https://buroinstant.vercel.app/api/health
```

Y mira `configuration`. Cada campo dice `configured` o `not_configured`.

**Solución.** En Vercel → Settings → Environment Variables → Production:

```
EVOLUTION_API_INSTANCE=GESTOR_TRAMITES
EVOLUTION_API_BASE_URL=https://gestor-tramites-evolution-api.7dklrk.easypanel.host
```

Y **redespliega**: Vercel sólo aplica variables nuevas en un despliegue nuevo.

`EVOLUTION_API_INSTANCE` es la que desbloquea la ingesta. `EVOLUTION_API_BASE_URL`
no hace falta para que funcione, pero sin ella la matriz de servicios del panel
de administración no puede comprobar si Evolution responde.

El valor tiene que coincidir **exactamente** con la instancia que manda
Evolution, mayúsculas incluidas. Si no coincide, el error cambia a
`INSTANCE_MISMATCH` y te dice los dos valores para que veas la diferencia.

### Comprobado, no supuesto

Reproducido en local con el mismo código de producción:

| Situación | Respuesta |
|---|---|
| Sin `EVOLUTION_API_INSTANCE` | `503 INGESTION_NOT_CONFIGURED` — idéntico a producción |
| Con la variable, mensaje real | `200` y extrae los campos: actividad aplicada, forma jurídica y socios como propuesta |
| Con la variable, secreto equivocado | `401 INVALID_SIGNATURE` |
| Con la variable, instancia mal escrita | `400 INSTANCE_MISMATCH`, diciendo los dos valores |

### Si después sale `401 INVALID_SIGNATURE`

Ya no falta configuración: es que el token de la credencial **Bearer Auth
account** de n8n no coincide con `N8N_WEBHOOK_SECRET` de Vercel. Tienen que ser
idénticos. Se corrige editando esa credencial en n8n (el lápiz junto a
«Bearer Auth account» en el nodo).

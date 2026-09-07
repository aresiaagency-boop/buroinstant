# Estado real, medido — 7 de septiembre de 2026

No es una lista de lo que creo que está hecho: es lo que respondieron los
sistemas al preguntarles.

## Lo que funciona

**WhatsApp entrante.** Evolution → n8n → BUROINSTANT. Se arregló poniendo
`EVOLUTION_API_INSTANCE=GESTOR_TRAMITES` en Vercel. Confirmado por
`/api/health`: `evolutionApi: configured`.

**El workflow de avisos está publicado y activo** en n8n, con el código
idéntico al del repositorio, y rechaza correctamente todo lo que no lleva
firma válida.

## Lo que NO funciona todavía, y por qué

### 1 · n8n sigue bloqueando el acceso al entorno

`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` **no está aplicado**.

Comprobado ejecutando un workflow temporal que sólo preguntaba si las
variables existen —nunca sus valores— y borrándolo después. Resultado:

```
access to env vars denied
```

Consecuencia: `AVISOS_BUROINSTANT` no puede leer el secreto ni las
credenciales de Evolution. Rechaza todo con `401 ENV_ACCESS_DENIED`. Eso es
deliberado —falla cerrado— pero significa que **no puede enviar ni un aviso**.

Ninguna de estas está disponible para los nodos: `EVOLUTION_API_KEY`,
`EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`, `BUROINSTANT_OUTBOUND_SECRET`.

**Falta:** EasyPanel → servicio n8n → Environment → añadir las cinco
variables (ver `CONFIGURAR_AVISOS.md`) → **Save** → **Restart**.

### 2 · Producción va seis commits por detrás

`/api/health` dice `appliedMigrations: 7`. En la rama hay **8**. La octava es
la tabla `deadline_reminders`, que es donde se anota qué avisos se han enviado.

Sin desplegar, producción **no tiene**:

- la tarea programada que mira los vencimientos cada día,
- el código que firma y llama a n8n,
- la tabla que impide mandar el mismo aviso dos veces.

Es decir: el workflow de n8n está esperando llamadas que hoy nadie puede
hacerle.

**Falta:**

```
git push origin feat/bloque-a-superadmin:main
```

La migración 8 se aplica sola durante el build.

## La deuda de seguridad: por qué NO se ha tocado

El plan era dejar de propagar `instance.apikey` en el nodo `Edit Fields6` del
workflow de ingesta, para que la clave de Evolution deje de quedar guardada en
los datos de ejecución.

Mapeado quién la usa:

| Nodo | Qué hace con ella |
|---|---|
| `Edit Fields6` | La copia del webhook. **Es el origen del problema** |
| `Get Audio` | La usa para descargar el audio de Evolution |
| `whatsapp_response` | La usa para responder por WhatsApp |

La corrección correcta es que esos dos consumidores lean
`$env.EVOLUTION_API_KEY` en vez de leerla del cuerpo, y quitar la asignación
de `Edit Fields6`.

**Pero `$env` está bloqueado.** Hacer ese cambio ahora rompería la ingesta que
acaba de empezar a funcionar. Por eso se comprobó primero y no se tocó nada.

Queda desbloqueado en cuanto se aplique `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.

## Orden recomendado

1. **Variables en n8n + Restart.** Desbloquea los avisos y habilita el arreglo
   de seguridad.
2. **`git push`.** Lleva a producción el cron, el firmante y la tabla.
3. **Probar el ciclo entero**, ya con todo en su sitio:
   ```
   node n8n/probar-avisos.mjs \
     https://gestor-tramites-n8n.7dklrk.easypanel.host/webhook/buroinstant-aviso \
     EL_SECRETO 34XXXXXXXXX
   ```
   La firma correcta debe dar **200** y llegar el mensaje; las tres inválidas,
   401 con `MISSING_SIGNATURE` y `BAD_SIGNATURE` —ya no `ENV_ACCESS_DENIED`.
4. **Rotar la clave de Evolution y quitarla de `Edit Fields6`.**

## Cómo volver a medir esto

| Qué | Cómo |
|---|---|
| Estado de producción | `https://buroinstant.vercel.app/api/health` |
| Si falta desplegar | `appliedMigrations` menor que el número de archivos en `db/migrations/` |
| Si n8n lee el entorno | Lanzar la prueba de avisos: `ENV_ACCESS_DENIED` significa que no |
| Qué falla en la ingesta | El error lo dice: `INGESTION_NOT_CONFIGURED`, `INVALID_SIGNATURE` o `INSTANCE_MISMATCH` |

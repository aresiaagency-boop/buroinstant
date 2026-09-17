# MEMORY

Lo que la siguiente sesión necesita saber para no volver a averiguarlo.

Se actualiza **al final de cada sesión**. Un hallazgo que se queda en el chat
muere en el chat.

---

## Hechos verificados

### Normativa comprobada en fuente (está en `src/lib/regulatory-facts.ts`)

- **Modelo 190** — Orden EHA/3127/2009 art. 5: primeros 20 días de enero, o
  **del 1 al 31 de enero** si se presenta por vía telemática.
- **Junta ordinaria** — art. 164 LSC: dentro de los seis primeros meses de cada
  ejercicio.
- **Depósito de cuentas** — art. 279.1 LSC: dentro del mes siguiente a la
  aprobación.
- **Constitución** — art. 20 LSC: escritura pública inscrita en el Registro
  Mercantil.
- **Legalización de libros** — Instrucción DGRN de 12-feb-2015: cuatro meses
  tras el cierre del ejercicio, sólo telemática.
- **RMC** — hasta cinco denominaciones por solicitud; la certificación vale
  **3 meses** para la escritura y reserva el nombre **6 meses**.
- **Factura electrónica B2B** — RD 238/2026, en vigor 20-abr-2026: 12 meses
  tras la orden ministerial para >8 M€, 24 para el resto. Marcado
  `requiresLiveVerification: true`: la orden puede no estar publicada.

### Infraestructura

- Producción está en la **migración 13**.
- n8n: la REST necesita `browser-id` sacado de `localStorage['n8n-browserId']`.
  `/healthz` responde `{"status":"ok"}` sin autenticación. Los task runners
  externos **deniegan `$env`** en nodos Code.
- La API de Anthropic devuelve **404** para un modelo desconocido y **400**
  para un cuerpo mal formado. No son intercambiables, y confundirlos costó una
  tarde (ver abajo).

---

## Intentos fallidos

Lo que ya se probó y no funciona. No repetirlo.

- **Leer artículos del BOE con WebFetch.** Las páginas consolidadas se truncan;
  `b=` y datos abiertos no aíslan el bloque; `curl` directo lo bloquea el proxy
  (403 CONNECT). Lo que sí funciona: leer el artículo transcrito dentro de una
  resolución corta de la DGSJFP.
- **Tratar un 400 de Anthropic como "ese modelo no sirve".** El bucle se comía
  los cuatro candidatos repitiendo el mismo cuerpo malo. El culpable era el
  bloque `web_search_20250305`, que no está habilitado en todas las cuentas y
  tumba la petición entera en vez de ignorarse.
- **Tirar `error.message` de la respuesta del proveedor.** Es justo la línea
  que nombra el campo que sobra.
- **`PATCH /api/expediente` sin `projectId`.** Abría un expediente nuevo y
  desplazaba el real. Arreglado en `applyProfilePatch`, que ahora reutiliza el
  último proyecto del workspace. Las pruebas de integración dependían sin
  saberlo de ese fallo: ahora se aíslan con `RUN = Date.now()` y userId **y
  email** únicos (hay índice único `users_email_lower_idx`).
- **`rm` / `unlink` sobre `.git/index.lock` en el montaje de Windows.** No se
  puede. Hay que **renombrarlo dentro de la misma carpeta** (`mv .git/index.lock
  .git/il.$(date +%s%N)`) antes de cada `add` y de cada `commit`; moverlo a
  `/tmp` tampoco funciona, porque cruzar sistema de archivos implica borrar.
- **Fiarse de la tarjeta «Proveedor de IA · OPERATIVO» del panel.** Cuenta
  cualquiera de las tres claves, así que decía OPERATIVO con la clave de OpenAI
  puesta mientras el asesor sólo hablaba Anthropic.

---

## Última sesión

- El asesor devolvía 400 con los cuatro modelos. Diagnosticado como cuerpo, no
  modelo: ahora ante un 400 se reintenta **el mismo modelo sin la herramienta
  de búsqueda** antes de descartarlo, y el motivo que da la API viaja hasta
  `GET /api/agent/asesor`. Cerrado también el 400 gemelo: `ordenarTurnos`
  impide que la conversación empiece por el asistente.
- El orbe pasó de proponer datos a **mover el expediente**: acciones
  `MOVER_TRAMITE` y `PEDIR_DOCUMENTO`, cada una confirmada con un botón.
  `COMPLETED` sólo se propone si hay papel aportado **a ese trámite**.
- Nueva ruta `PATCH /api/expediente/tramites/estado` para los estados
  intermedios. `COMPLETED` no entra por ahí: sigue exigiendo evidencia en
  `confirmTaskWithEvidence`.
- 402 pruebas en verde, lint, tipos y build limpios.

---

## Próximos pasos

1. **Comprobar el diagnóstico en producción** tras desplegar: abrir
   `/api/agent/asesor` y leer `busquedaWeb`. Si dice «no disponible en esta
   cuenta», el asesor funciona sin búsqueda y hay que decidir si se habilita la
   herramienta en la cuenta de Anthropic.
2. Cargar las cinco denominaciones en el expediente real de A.R.E.S. y archivar
   el expediente vacío «Mi empresa» desde el panel.
3. n8n: pegar los dos valores de credencial que siguen en `PENDIENTE_DE_PEGAR`
   y rotar `BUROINSTANT_OUTBOUND_SECRET` y `EVOLUTION_API_KEY` a dos valores
   **distintos**.
4. Mundo real: solicitar la certificación del RMC (sólo puede un socio
   fundador) y obtener la autorización escrita de domiciliación de BaySense.

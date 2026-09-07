/**
 * Prueba el workflow AVISOS_BUROINSTANT contra el webhook ya publicado.
 *
 *   node n8n/probar-avisos.mjs <url-del-webhook> <secreto> <telefono>
 *
 * El secreto es el mismo valor de `WHATSAPP_OUTBOUND_SECRET` en Vercel y de la
 * credencial «BUROINSTANT token de avisos» en n8n.
 *
 * Manda siete peticiones. Sólo la primera envía un mensaje de verdad, y va
 * marcado como prueba para que quien lo reciba sepa qué es. Las otras seis se
 * quedan en el rechazo y no llegan a Evolution.
 */
import { createHmac } from "node:crypto";

const [, , url, secreto, telefono] = process.argv;

if (!url || !secreto || !telefono) {
  console.error("Uso: node n8n/probar-avisos.mjs <url-del-webhook> <secreto> <telefono>");
  console.error("Ejemplo: node n8n/probar-avisos.mjs https://mi-n8n/webhook/buroinstant-aviso EL_SECRETO 34600123456");
  process.exit(2);
}

/**
 * La firma viaja aunque n8n ya no la verifique: sus nodos Code corren en un
 * runner que bloquea las variables de entorno, así que allí no hay forma de
 * leer el secreto. Quien llama se comprueba en la puerta, con el token de
 * cabecera; la marca de tiempo sí se comprueba dentro, y es lo que impide
 * reenviar una petición capturada antes.
 */
function firmar(rawBody, timestamp, clave) {
  return "sha256=" + createHmac("sha256", clave).update(`${timestamp}.${rawBody}`).digest("hex");
}

async function llamar({ nombre, rawBody, timestamp, token, esperado }) {
  const cabeceras = { "Content-Type": "application/json" };
  if (token !== null) cabeceras["X-Buroinstant-Token"] = token ?? secreto;
  if (timestamp) {
    cabeceras["X-Buroinstant-Timestamp"] = timestamp;
    cabeceras["X-Buroinstant-Signature"] = firmar(rawBody, timestamp, secreto);
  }

  let estado = 0;
  let cuerpo = "";
  try {
    const respuesta = await fetch(url, { method: "POST", headers: cabeceras, body: rawBody });
    estado = respuesta.status;
    cuerpo = (await respuesta.text()).slice(0, 200);
  } catch (error) {
    cuerpo = `sin respuesta: ${error.message}`;
  }

  const ok = estado === esperado;
  console.log(`  ${ok ? "OK  " : "FALLA"} ${nombre.padEnd(34)} → HTTP ${estado} (esperado ${esperado})`);
  if (cuerpo) console.log(`       ${cuerpo}`);
  return ok;
}

const ahora = new Date().toISOString();
const viejo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
const mensaje = {
  phone: String(telefono).replace(/\D/g, ""),
  text: "Prueba de BUROINSTANT: si lees esto, el aviso llega. No hay ningún plazo real detrás de este mensaje.",
  idempotencyKey: `prueba:${Date.now()}`,
  source: "BUROINSTANT_DEADLINE_REMINDER",
};
const raw = JSON.stringify(mensaje);
const otro = (cambios) => JSON.stringify({ ...mensaje, ...cambios });

const resultados = [];
resultados.push(await llamar({ nombre: "todo correcto", rawBody: raw, timestamp: ahora, esperado: 200 }));
resultados.push(await llamar({ nombre: "sin token de cabecera", rawBody: raw, timestamp: ahora, token: null, esperado: 403 }));
resultados.push(await llamar({ nombre: "token equivocado", rawBody: raw, timestamp: ahora, token: "no-es-el-token", esperado: 403 }));
resultados.push(await llamar({ nombre: "sin marca de tiempo", rawBody: raw, timestamp: null, esperado: 401 }));
resultados.push(await llamar({ nombre: "marca de hace media hora", rawBody: raw, timestamp: viejo, esperado: 401 }));
resultados.push(await llamar({ nombre: "origen distinto", rawBody: otro({ source: "OTRA_COSA" }), timestamp: ahora, esperado: 401 }));
resultados.push(await llamar({ nombre: "telefono con letras", rawBody: otro({ phone: "34ABC" }), timestamp: ahora, esperado: 401 }));

const fallos = resultados.filter((ok) => !ok).length;
console.log(fallos === 0 ? "\nTodo como se esperaba." : `\n${fallos} caso(s) no responden lo esperado.`);
process.exit(fallos === 0 ? 0 : 1);

/**
 * Prueba el workflow AVISOS_BUROINSTANT contra el webhook ya publicado.
 *
 *   node n8n/probar-avisos.mjs <url-del-webhook> <secreto> <telefono>
 *
 * Manda cuatro peticiones: una buena y tres que deben ser rechazadas. Sólo la
 * primera envía un mensaje de verdad, y va marcado como prueba para que quien
 * lo reciba sepa qué es.
 */
import { createHmac } from "node:crypto";

const [, , url, secreto, telefono] = process.argv;

if (!url || !secreto || !telefono) {
  console.error("Uso: node n8n/probar-avisos.mjs <url-del-webhook> <secreto> <telefono>");
  console.error("Ejemplo: node n8n/probar-avisos.mjs https://mi-n8n/webhook/buroinstant-aviso abc123... 34600123456");
  process.exit(2);
}

function firmar(rawBody, timestamp, clave) {
  return "sha256=" + createHmac("sha256", clave).update(`${timestamp}.${rawBody}`).digest("hex");
}

async function llamar({ nombre, rawBody, timestamp, signature, esperado }) {
  const cabeceras = { "Content-Type": "application/json", "X-Buroinstant-Timestamp": timestamp };
  if (signature) cabeceras["X-Buroinstant-Signature"] = signature;

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
const mensaje = {
  phone: String(telefono).replace(/\D/g, ""),
  text: "⏳ Prueba de BUROINSTANT: si lees esto, la firma se verifica y el envío funciona. No hay ningún plazo real detrás de este mensaje.",
  idempotencyKey: `prueba:${Date.now()}`,
  source: "BUROINSTANT_DEADLINE_REMINDER",
};
const raw = JSON.stringify(mensaje);

const resultados = [];
resultados.push(
  await llamar({
    nombre: "firma correcta",
    rawBody: raw,
    timestamp: ahora,
    signature: firmar(raw, ahora, secreto),
    esperado: 200,
  }),
);
resultados.push(
  await llamar({ nombre: "sin cabecera de firma", rawBody: raw, timestamp: ahora, esperado: 401 }),
);
resultados.push(
  await llamar({
    nombre: "firma de otro secreto",
    rawBody: raw,
    timestamp: ahora,
    signature: firmar(raw, ahora, "un-secreto-distinto-igual-de-largo-1234"),
    esperado: 401,
  }),
);

// La firma se calcula sobre el cuerpo bueno y se manda otro: es el caso que
// detecta a quien intercepta y modifica el mensaje por el camino.
const alterado = JSON.stringify({ ...mensaje, phone: "34600000000" });
resultados.push(
  await llamar({
    nombre: "cuerpo alterado tras firmar",
    rawBody: alterado,
    timestamp: ahora,
    signature: firmar(raw, ahora, secreto),
    esperado: 401,
  }),
);

const fallos = resultados.filter((r) => !r).length;
console.log(
  fallos === 0
    ? "\nTODO CORRECTO. Comprueba que el mensaje de prueba ha llegado al teléfono."
    : `\n${fallos} comprobaciones han fallado.`,
);
process.exit(fallos === 0 ? 0 : 1);

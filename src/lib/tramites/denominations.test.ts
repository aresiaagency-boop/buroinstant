import { describe, expect, it } from "vitest";

import { concedida, plazosDe, type Denominacion } from "@/lib/tramites/denominations";

/**
 * Los dos plazos que cuelgan de la certificación del RMC se confunden entre sí:
 * tres meses para otorgar la escritura, seis de reserva de la denominación.
 */
describe("los plazos de la certificación de denominación", () => {
  it("calcula los dos desde la fecha de expedición", () => {
    const plazos = plazosDe("2026-05-22");
    expect(plazos?.limiteEscritura).toBe("2026-08-22");
    expect(plazos?.limiteReserva).toBe("2026-11-22");
  });

  it("reproduce el caso real de la resolución de la DGSJFP", () => {
    // Certificación expedida el 22 de mayo de 2025; la inscripción se presentó
    // el 9 de diciembre y fue rechazada por caducada. El límite de reserva es
    // el 22 de noviembre, anterior a esa presentación.
    const plazos = plazosDe("2025-05-22");
    expect(plazos?.limiteReserva).toBe("2025-11-22");
    expect("2025-12-09" > plazos!.limiteReserva).toBe(true);
  });

  it("del 31 de diciembre salen fechas que existen", () => {
    const plazos = plazosDe("2026-12-31");
    // Tres meses después de un 31 de diciembre es el 31 de marzo; seis, el 30
    // de junio, porque junio no tiene 31. Desbordar al mes siguiente daría un
    // plazo más largo que el que hay.
    expect(plazos?.limiteEscritura).toBe("2027-03-31");
    expect(plazos?.limiteReserva).toBe("2027-06-30");
  });

  it("del 31 de agosto, el límite de seis meses cae el 28 de febrero", () => {
    expect(plazosDe("2026-08-31")?.limiteReserva).toBe("2027-02-28");
  });

  it("sin fecha, no hay plazos: no se estiman", () => {
    expect(plazosDe(null)).toBeNull();
    expect(plazosDe(undefined)).toBeNull();
    expect(plazosDe("")).toBeNull();
    expect(plazosDe("el mes pasado")).toBeNull();
  });
});

describe("cuál se concedió", () => {
  const lista: Denominacion[] = [
    { position: 1, name: "ARES AUTONOMOUS REASONING AND EXECUTION SYSTEMS SLU", status: "REJECTED" },
    { position: 2, name: "ARES AUTONOMOUS SYSTEMS SLU", status: "GRANTED" },
    { position: 3, name: "ARES REASONING SYSTEMS SLU", status: "PROPOSED" },
  ];

  it("devuelve la concedida, aunque no sea la primera", () => {
    expect(concedida(lista)?.position).toBe(2);
  });

  it("sin ninguna concedida, no inventa una", () => {
    const soloPropuestas = lista.map((item) => ({ ...item, status: "PROPOSED" as const }));
    expect(concedida(soloPropuestas)).toBeUndefined();
  });
});

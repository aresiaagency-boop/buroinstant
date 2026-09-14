import { describe, expect, it } from "vitest";

import {
  REMINDER_WINDOWS,
  digestMessage,
  planReminders,
  reminderKey,
  reminderMessage,
} from "@/lib/notifications/deadline-reminders";
import { upcomingObligations, type ObligationOccurrence } from "@/lib/obligations-calendar";

const HOY = "2026-09-04";

function ocurrencia(overrides: Partial<ObligationOccurrence> = {}): ObligationOccurrence {
  return {
    code: "IVA_303:3T_2026",
    obligationCode: "IVA_303",
    model: "303",
    title: "IVA · autoliquidación trimestral",
    detail: "Declara el IVA del trimestre.",
    authority: "AEAT",
    periodicity: "TRIMESTRAL",
    responsible: "AUTONOMO",
    periodLabel: "3T 2026",
    dueDate: "2026-09-07",
    windowRule: "Hasta el día 20 del mes siguiente al fin del trimestre.",
    sourceUrl: "https://sede.agenciatributaria.gob.es/algo.html",
    sourceTitle: "AEAT · Calendario",
    ...overrides,
  };
}

const VACIO = new Set<string>();

describe("qué se avisa y qué no", () => {
  it("avisa de un plazo dentro de la ventana", () => {
    const plan = planReminders({ occurrences: [ocurrencia()], today: HOY, alreadySent: VACIO });
    expect(plan).toHaveLength(1);
    expect(plan[0].daysLeft).toBe(3);
    expect(plan[0].window).toBe(3);
  });

  it("no avisa de una obligación sin fecha confirmada", () => {
    const plan = planReminders({
      occurrences: [ocurrencia({ dueDate: null, pendingVerification: "falta comprobar" })],
      today: HOY,
      alreadySent: VACIO,
    });
    expect(plan).toHaveLength(0);
  });

  it("no avisa sin fuente oficial", () => {
    const plan = planReminders({
      occurrences: [ocurrencia({ sourceUrl: "" })],
      today: HOY,
      alreadySent: VACIO,
    });
    expect(plan).toHaveLength(0);
  });

  it("no avisa de lo que ya venció", () => {
    const plan = planReminders({
      occurrences: [ocurrencia({ dueDate: "2026-09-01" })],
      today: HOY,
      alreadySent: VACIO,
    });
    expect(plan).toHaveLength(0);
  });

  it("no avisa de lo que todavía queda lejos", () => {
    const plan = planReminders({
      occurrences: [ocurrencia({ dueDate: "2026-12-20" })],
      today: HOY,
      alreadySent: VACIO,
    });
    expect(plan).toHaveLength(0);
  });

  it("sí avisa el mismo día del vencimiento", () => {
    const plan = planReminders({
      occurrences: [ocurrencia({ dueDate: HOY })],
      today: HOY,
      alreadySent: VACIO,
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].message).toContain("vence hoy");
  });
});

describe("no se repite un aviso", () => {
  it("una vez enviado, no se vuelve a planificar", () => {
    const ocurrencias = [ocurrencia()];
    const primero = planReminders({ occurrences: ocurrencias, today: HOY, alreadySent: VACIO });
    expect(primero).toHaveLength(1);

    const enviados = new Set([primero[0].key]);
    const segundo = planReminders({ occurrences: ocurrencias, today: HOY, alreadySent: enviados });
    expect(segundo).toHaveLength(0);
  });

  it("ejecutar dos veces el mismo día no manda dos mensajes", () => {
    const ocurrencias = [ocurrencia(), ocurrencia({ code: "IRPF_130:3T_2026", obligationCode: "IRPF_130", model: "130" })];
    const primera = planReminders({ occurrences: ocurrencias, today: HOY, alreadySent: VACIO });
    const enviados = new Set(primera.map((r) => r.key));
    const segunda = planReminders({ occurrences: ocurrencias, today: HOY, alreadySent: enviados });
    expect(primera).toHaveLength(2);
    expect(segunda).toHaveLength(0);
  });

  it("pero una ventana más cercana sí vuelve a avisar", () => {
    const ocurrencias = [ocurrencia({ dueDate: "2026-09-12" })];
    // A 8 días: entra la ventana de 10.
    const lejos = planReminders({ occurrences: ocurrencias, today: HOY, alreadySent: VACIO });
    expect(lejos[0].window).toBe(10);

    // A 2 días: la ventana de 3 es otra clave, así que vuelve a avisar.
    const cerca = planReminders({
      occurrences: ocurrencias,
      today: "2026-09-10",
      alreadySent: new Set([lejos[0].key]),
    });
    expect(cerca).toHaveLength(1);
    expect(cerca[0].window).toBe(3);
  });

  it("la clave identifica obligación y ventana", () => {
    expect(reminderKey("IVA_303:3T_2026", 3)).toBe("IVA_303:3T_2026#3");
    expect(reminderKey("IVA_303:3T_2026", 3)).not.toBe(reminderKey("IVA_303:3T_2026", 1));
  });

  it("cuando dos ventanas están alcanzadas gana la más urgente", () => {
    const plan = planReminders({
      occurrences: [ocurrencia({ dueDate: "2026-09-05" })],
      today: HOY,
      alreadySent: VACIO,
    });
    expect(plan[0].window).toBe(Math.min(...REMINDER_WINDOWS));
  });
});

describe("qué dice el mensaje", () => {
  it("lleva modelo, fecha, quién responde y la sede", () => {
    const texto = reminderMessage(ocurrencia(), 3);
    expect(texto).toContain("Modelo 303");
    expect(texto).toContain("7 de septiembre");
    expect(texto).toContain("vence en 3 días");
    expect(texto).toContain("Lo presentas tú");
    expect(texto).toContain("AEAT");
    expect(texto).toContain("https://sede.agenciatributaria.gob.es");
  });

  it("dice mañana y hoy en palabras, no en números", () => {
    expect(reminderMessage(ocurrencia({ dueDate: "2026-09-05" }), 1)).toContain("vence mañana");
    expect(reminderMessage(ocurrencia({ dueDate: HOY }), 0)).toContain("vence hoy");
  });

  it("no contiene jerga de código", () => {
    const texto = reminderMessage(ocurrencia(), 3);
    expect(texto).not.toMatch(/[A-Z]{4,}_[A-Z]{2,}/);
    expect(texto).not.toContain("undefined");
    expect(texto).not.toContain("null");
  });

  it("nunca menciona el modelo 037", () => {
    for (const dias of [0, 1, 3, 10]) {
      expect(reminderMessage(ocurrencia(), dias)).not.toMatch(/\b037\b/);
    }
  });

  it("cabe en un mensaje de WhatsApp", () => {
    expect(reminderMessage(ocurrencia(), 3).length).toBeLessThan(700);
  });
});

describe("varios plazos el mismo día van en un solo mensaje", () => {
  const dos = planReminders({
    occurrences: [
      ocurrencia(),
      ocurrencia({ code: "IRPF_130:3T_2026", obligationCode: "IRPF_130", model: "130", title: "IRPF · pago fraccionado" }),
    ],
    today: HOY,
    alreadySent: VACIO,
  });

  it("uno solo se manda tal cual", () => {
    expect(digestMessage([dos[0]])).toBe(dos[0].message);
  });

  it("dos o más se agrupan", () => {
    const texto = digestMessage(dos);
    expect(texto).toContain("Tienes 2 plazos cerca");
    expect(texto).toContain("Modelo 303");
    expect(texto).toContain("Modelo 130");
    expect(texto.split("⏳").length - 1).toBe(1);
  });

  it("sin avisos no hay mensaje", () => {
    expect(digestMessage([])).toBe("");
  });
});

describe("contra el calendario real", () => {
  it("un autónomo con plazos reales recibe avisos con fuente y sin fechas inventadas", () => {
    const ocurrencias = upcomingObligations({
      profile: { legalForm: "AUTONOMO", hasPremises: true },
      from: "2026-09-25",
      horizonDays: 60,
    });
    const plan = planReminders({ occurrences: ocurrencias, today: "2026-09-25", alreadySent: VACIO });
    expect(plan.length).toBeGreaterThan(0);
    for (const aviso of plan) {
      expect(aviso.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(aviso.daysLeft).toBeGreaterThanOrEqual(0);
      expect(aviso.message).toContain("https://");
    }
  });

  it("una obligación sin fecha nunca genera aviso", () => {
    // Ya no hay ninguna en el catálogo, pero la regla tiene que seguir en pie:
    // el aviso se calcula sobre una fecha, y «creo que era por ahí» es peor que
    // no mandar nada. Se prueba con una ocurrencia construida a mano para que la
    // regla siga cubierta el día que vuelva a haber un hecho sin verificar.
    const real = upcomingObligations({
      profile: { legalForm: "SL", willHireWorkers: true },
      from: "2026-09-04",
      horizonDays: 400,
    });
    const sinFecha: ObligationOccurrence = {
      ...real[0],
      code: "INVENTADA:SIN_FECHA_2026",
      obligationCode: "INVENTADA",
      dueDate: null,
      pendingVerification: "Pendiente de comprobar en la sede oficial.",
    };

    const plan = planReminders({
      occurrences: [...real, sinFecha],
      today: "2026-09-04",
      alreadySent: VACIO,
    });
    expect(plan.map((r) => r.occurrenceCode)).not.toContain(sinFecha.code);
  });

  it("el resumen anual de retenciones ya avisa, porque ya tiene fecha", () => {
    // Era el caso del hueco 4: sin fecha, el 190 no generaba ningún aviso. Diez
    // días antes del 1 de febrero de 2027 toca el primero.
    const ocurrencias = upcomingObligations({
      profile: { legalForm: "SL", willHireWorkers: true },
      from: "2027-01-22",
      horizonDays: 30,
    });
    const plan = planReminders({ occurrences: ocurrencias, today: "2027-01-22", alreadySent: VACIO });
    const aviso = plan.find((r) => r.obligationCode === "RETENCIONES_190");
    expect(aviso).toBeDefined();
    expect(aviso?.dueDate).toBe("2027-02-01");
    expect(aviso?.window).toBe(10);
    expect(aviso?.message).toContain("Modelo 190");
  });

  it("la junta y el depósito de cuentas también avisan", () => {
    const juntas = planReminders({
      occurrences: upcomingObligations({ profile: { legalForm: "SLU" }, from: "2027-06-20", horizonDays: 30 }),
      today: "2027-06-20",
      alreadySent: VACIO,
    });
    expect(juntas.map((r) => r.obligationCode)).toContain("JUNTA_ORDINARIA");

    const deposito = planReminders({
      occurrences: upcomingObligations({
        profile: { legalForm: "SLU" },
        from: "2027-04-05",
        horizonDays: 30,
        accountsApproval: "2027-03-15",
      }),
      today: "2027-04-05",
      alreadySent: VACIO,
    });
    const cuentas = deposito.find((r) => r.obligationCode === "CUENTAS_ANUALES");
    expect(cuentas?.dueDate).toBe("2027-04-15");
  });
});

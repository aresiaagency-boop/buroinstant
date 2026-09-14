import { describe, expect, it } from "vitest";

import {
  OBLIGATION_CATALOG,
  daysUntil,
  splitByDate,
  upcomingObligations,
  urgencyOf,
} from "@/lib/obligations-calendar";
import { REGULATORY_FACTS, fact, isBindingFact } from "@/lib/regulatory-facts";

const AUTONOMO = { legalForm: "AUTONOMO" as const };
const SOCIEDAD = { legalForm: "SL" as const };

describe("catálogo de obligaciones", () => {
  it("cada obligación apunta a un hecho regulatorio que existe y tiene fuente", () => {
    for (const definition of OBLIGATION_CATALOG) {
      const item = fact(definition.factKey);
      expect(item, `falta el hecho ${definition.factKey} de ${definition.code}`).toBeDefined();
      expect(item?.sources.length, `el hecho ${definition.factKey} no tiene fuente`).toBeGreaterThan(0);
    }
  });

  it("todas las fuentes son instituciones estatales, nunca un tercero", () => {
    const permitidos = ["sede.agenciatributaria.gob.es", "www.boe.es", "www.seg-social.es", "portal.seg-social.gob.es", "www.paeelectronico.es"];
    for (const item of REGULATORY_FACTS) {
      for (const source of item.sources) {
        const host = new URL(source.url).host;
        expect(permitidos, `fuente no oficial: ${source.url}`).toContain(host);
      }
    }
  });

  it("ningún texto del catálogo propone el modelo 037", () => {
    const texto = OBLIGATION_CATALOG.map((d) => `${d.title} ${d.detail} ${d.windowRule} ${d.model ?? ""}`).join(" ");
    expect(texto).not.toMatch(/\b037\b/);
  });
});

describe("a quién le aplica cada obligación", () => {
  it("una persona física no recibe obligaciones de sociedad", () => {
    const codigos = upcomingObligations({ profile: AUTONOMO, from: "2026-09-04" }).map((o) => o.obligationCode);
    expect(codigos).not.toContain("IS_200");
    expect(codigos).not.toContain("IS_202");
    expect(codigos).not.toContain("CUENTAS_ANUALES");
    expect(codigos).toContain("IRPF_130");
    expect(codigos).toContain("TGSS_RETA");
  });

  it("una sociedad no recibe el pago fraccionado de IRPF ni la cuota de RETA del titular", () => {
    const codigos = upcomingObligations({ profile: SOCIEDAD, from: "2026-09-04" }).map((o) => o.obligationCode);
    expect(codigos).not.toContain("IRPF_130");
    expect(codigos).not.toContain("TGSS_RETA");
    expect(codigos).toContain("IS_200");
    expect(codigos).toContain("CUENTAS_ANUALES");
  });

  it("las retenciones por alquiler sólo aparecen si hay local", () => {
    const sinLocal = upcomingObligations({ profile: SOCIEDAD, from: "2026-09-04" }).map((o) => o.obligationCode);
    const conLocal = upcomingObligations({
      profile: { ...SOCIEDAD, hasPremises: true },
      from: "2026-09-04",
    }).map((o) => o.obligationCode);
    expect(sinLocal).not.toContain("RETENCIONES_115");
    expect(conLocal).toContain("RETENCIONES_115");
  });
});

describe("cálculo de plazos", () => {
  it("el IVA del tercer trimestre de 2026 vence el 20 de octubre", () => {
    const ocurrencias = upcomingObligations({ profile: AUTONOMO, from: "2026-09-04", horizonDays: 60 });
    const tercero = ocurrencias.find((o) => o.obligationCode === "IVA_303" && o.periodLabel === "3T 2026");
    expect(tercero?.dueDate).toBe("2026-10-20");
  });

  it("el IVA del cuarto trimestre vence a final de enero, no el día 20", () => {
    const ocurrencias = upcomingObligations({ profile: AUTONOMO, from: "2026-09-04", horizonDays: 200 });
    const cuarto = ocurrencias.find((o) => o.obligationCode === "IVA_303" && o.periodLabel === "4T 2026");
    // 2027-01-30 cae en sábado: el vencimiento se traslada al lunes siguiente.
    expect(cuarto?.dueDate).toBe("2027-02-01");
    expect(cuarto?.shiftNote).toBeTruthy();
    expect(cuarto?.windowRule).toContain("30 de enero");
  });

  it("las retenciones del cuarto trimestre vencen el 20 de enero", () => {
    const ocurrencias = upcomingObligations({
      profile: { ...SOCIEDAD, willHireWorkers: true },
      from: "2026-09-04",
      horizonDays: 200,
    });
    const cuarto = ocurrencias.find((o) => o.obligationCode === "RETENCIONES_111" && o.periodLabel === "4T 2026");
    expect(cuarto?.dueDate).toBe("2027-01-20");
  });

  it("un vencimiento en sábado se traslada al lunes y lo advierte", () => {
    // 2027-04-20 es martes; buscamos un caso real de fin de semana:
    // 2025-04-20 fue domingo. Se comprueba con la utilidad de traslado.
    const ocurrencias = upcomingObligations({ profile: AUTONOMO, from: "2025-01-01", horizonDays: 200 });
    const segundo = ocurrencias.find((o) => o.obligationCode === "IVA_303" && o.periodLabel === "1T 2025");
    expect(segundo?.dueDate).toBe("2025-04-21");
    expect(segundo?.shiftNote).toContain("festivos autonómicos y locales no están aplicados");
  });

  it("ninguna fecha trasladable cae en sábado o domingo", () => {
    const ocurrencias = upcomingObligations({
      profile: { ...SOCIEDAD, hasPremises: true, willHireWorkers: true },
      from: "2026-01-01",
      horizonDays: 730,
    });
    for (const o of ocurrencias) {
      if (!o.dueDate) continue;
      // Las cuotas mensuales de Seguridad Social vencen «dentro del mismo mes»:
      // trasladarlas al lunes las empujaría al mes siguiente y contradiría a la
      // propia fuente. Por eso no se trasladan, y por eso quedan fuera de esta
      // comprobación en vez de forzar la regla a que encaje.
      if (o.periodicity === "MENSUAL") continue;
      const dia = new Date(`${o.dueDate}T00:00:00Z`).getUTCDay();
      expect([1, 2, 3, 4, 5], `${o.code} cae en fin de semana: ${o.dueDate}`).toContain(dia);
    }
  });

  it("una cuota mensual que cae en fin de semana NO se traslada, y se dice", () => {
    const enero = upcomingObligations({
      profile: { legalForm: "SLU" as const },
      from: "2026-01-01",
      horizonDays: 40,
    }).find((o) => o.obligationCode === "SS_ADMINISTRADOR");
    // 31 de enero de 2026 es sábado. Se mantiene: el plazo es el mes, no el día hábil.
    expect(enero?.dueDate).toBe("2026-01-31");
    expect(enero?.windowRule).toContain("mismo mes");
  });

  it("todas las fechas caen dentro de la ventana pedida", () => {
    const ocurrencias = upcomingObligations({ profile: AUTONOMO, from: "2026-09-04", horizonDays: 90 });
    for (const o of ocurrencias) {
      if (!o.dueDate) continue;
      expect(o.dueDate >= "2026-09-04").toBe(true);
      expect(o.dueDate <= "2026-12-03").toBe(true);
    }
  });

  it("la cuota de RETA vence el último día de cada mes", () => {
    const ocurrencias = upcomingObligations({ profile: AUTONOMO, from: "2026-09-04", horizonDays: 120 }).filter(
      (o) => o.obligationCode === "TGSS_RETA",
    );
    expect(ocurrencias.length).toBeGreaterThan(0);
    // Septiembre de 2026 termina en miércoles 30.
    expect(ocurrencias[0]?.dueDate).toBe("2026-09-30");
  });
});

describe("regla de no inventar fechas", () => {
  it("ninguna obligación del catálogo se apoya hoy en un hecho sin verificar", () => {
    // La rama «sin fecha» sigue viva y probada más abajo, pero hoy no la usa
    // ninguna obligación: todas descansan en una fuente verificada. Si mañana un
    // hecho pierde la verificación, esta prueba lo dice antes que un usuario.
    for (const definition of OBLIGATION_CATALOG) {
      const item = fact(definition.factKey);
      expect(item, definition.code).toBeDefined();
      expect(isBindingFact(item), definition.code).toBe(true);
    }
  });

  it("toda ocurrencia sin fecha explica qué falta comprobar", () => {
    const ocurrencias = upcomingObligations({
      profile: { ...SOCIEDAD, hasPremises: true, willHireWorkers: true },
      from: "2026-09-04",
    });
    for (const o of ocurrencias) {
      if (o.dueDate === null) expect(o.pendingVerification, o.code).toBeTruthy();
    }
  });

  it("toda ocurrencia lleva enlace a su fuente oficial", () => {
    const ocurrencias = upcomingObligations({
      profile: { ...SOCIEDAD, hasPremises: true, willHireWorkers: true },
      from: "2026-09-04",
      horizonDays: 400,
    });
    expect(ocurrencias.length).toBeGreaterThan(0);
    for (const o of ocurrencias) {
      expect(o.sourceUrl, o.code).toMatch(/^https:\/\//);
      expect(o.sourceTitle, o.code).not.toHaveLength(0);
    }
  });

  it("los códigos de ocurrencia no se repiten", () => {
    const ocurrencias = upcomingObligations({
      profile: { ...SOCIEDAD, hasPremises: true, willHireWorkers: true },
      from: "2026-09-04",
      horizonDays: 400,
    });
    const codigos = ocurrencias.map((o) => o.code);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});

describe("orden y urgencia", () => {
  it("las obligaciones con fecha van antes que las que no la tienen", () => {
    const ocurrencias = upcomingObligations({
      profile: { ...SOCIEDAD, willHireWorkers: true },
      from: "2026-09-04",
      horizonDays: 400,
    });
    const primeraSinFecha = ocurrencias.findIndex((o) => o.dueDate === null);
    const ultimaConFecha = ocurrencias.map((o) => o.dueDate !== null).lastIndexOf(true);
    if (primeraSinFecha !== -1) expect(primeraSinFecha).toBeGreaterThan(ultimaConFecha);
  });

  it("la urgencia distingue vencido, inminente, próximo y lejano", () => {
    const base = {
      code: "X",
      obligationCode: "X",
      model: null,
      title: "t",
      detail: "d",
      authority: "AEAT",
      periodicity: "ANUAL" as const,
      responsible: "EMPRESA" as const,
      periodLabel: "p",
      windowRule: "w",
      sourceUrl: "https://www.boe.es/",
      sourceTitle: "s",
    };
    expect(urgencyOf({ ...base, dueDate: null }, "2026-09-04")).toBe("SIN_FECHA");
    expect(urgencyOf({ ...base, dueDate: "2026-09-01" }, "2026-09-04")).toBe("VENCIDO");
    expect(urgencyOf({ ...base, dueDate: "2026-09-08" }, "2026-09-04")).toBe("INMINENTE");
    expect(urgencyOf({ ...base, dueDate: "2026-09-25" }, "2026-09-04")).toBe("PROXIMO");
    expect(urgencyOf({ ...base, dueDate: "2026-12-25" }, "2026-09-04")).toBe("LEJANO");
  });

  it("daysUntil no depende del huso horario del servidor", () => {
    expect(daysUntil("2026-10-20", "2026-09-04")).toBe(46);
    expect(daysUntil("2026-09-04", "2026-09-04")).toBe(0);
    expect(daysUntil("2026-09-01", "2026-09-04")).toBe(-3);
  });
});

describe("correcciones detectadas con datos reales", () => {
  it("la cuota de RETA nunca se traslada al mes siguiente", () => {
    // 2026-10-31 cae en sábado. Trasladarla al lunes la sacaría de «su mismo
    // mes» y contradiría la fuente de la Seguridad Social.
    const ocurrencias = upcomingObligations({
      profile: AUTONOMO,
      from: "2026-10-01",
      horizonDays: 400,
    }).filter((o) => o.obligationCode === "TGSS_RETA");
    const octubre = ocurrencias.find((o) => o.periodLabel === "octubre 2026");
    expect(octubre?.dueDate).toBe("2026-10-31");
    expect(octubre?.shiftNote).toBeUndefined();
    for (const o of ocurrencias) {
      const [, mesVencimiento] = (o.dueDate ?? "").split("-");
      const mesPeriodo = o.periodLabel.split(" ")[0];
      const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      expect(Number(mesVencimiento), `${o.periodLabel} vence fuera de su mes`).toBe(meses.indexOf(mesPeriodo) + 1);
    }
  });

  it("en persona física ninguna obligación se atribuye a «la empresa»", () => {
    const ocurrencias = upcomingObligations({
      profile: { ...AUTONOMO, hasPremises: true, willHireWorkers: true },
      from: "2026-09-04",
      horizonDays: 400,
    });
    expect(ocurrencias.length).toBeGreaterThan(0);
    for (const o of ocurrencias) {
      expect(o.responsible, `${o.code} atribuido a EMPRESA siendo autónomo`).not.toBe("EMPRESA");
    }
  });

  it("en sociedad sí se atribuye a la empresa y al administrador", () => {
    const responsables = new Set(
      upcomingObligations({ profile: SOCIEDAD, from: "2026-09-04", horizonDays: 400 }).map((o) => o.responsible),
    );
    expect(responsables.has("EMPRESA")).toBe(true);
    expect(responsables.has("ADMINISTRADOR")).toBe(true);
    expect(responsables.has("AUTONOMO")).toBe(false);
  });
});

describe("la cotización del administrador en una sociedad", () => {
  const DESDE = "2026-10-01";

  it("aparece en el calendario de una S.L.U.", () => {
    // Antes no aparecía en el de ninguna sociedad: la única cuota mensual del
    // catálogo se aplicaba sólo a personas físicas, así que quien creaba una
    // S.L. se enteraba del recibo por el banco.
    const codigos = upcomingObligations({
      profile: { legalForm: "SLU" as const },
      from: DESDE,
      horizonDays: 120,
    }).map((o) => o.obligationCode);
    expect(codigos).toContain("SS_ADMINISTRADOR");
  });

  it("la responsable es la persona administradora, no la empresa", () => {
    const cuota = upcomingObligations({
      profile: { legalForm: "SLU" as const },
      from: DESDE,
      horizonDays: 120,
    }).find((o) => o.obligationCode === "SS_ADMINISTRADOR");
    expect(cuota?.responsible).toBe("ADMINISTRADOR");
  });

  it("no se duplica con la cuota del autónomo persona física", () => {
    const deSociedad = upcomingObligations({
      profile: { legalForm: "SLU" as const },
      from: DESDE,
      horizonDays: 120,
    }).map((o) => o.obligationCode);
    expect(deSociedad).not.toContain("TGSS_RETA");

    const dePersona = upcomingObligations({ profile: AUTONOMO, from: DESDE, horizonDays: 120 }).map(
      (o) => o.obligationCode,
    );
    expect(dePersona).toContain("TGSS_RETA");
    expect(dePersona).not.toContain("SS_ADMINISTRADOR");
  });

  it("vence dentro del mismo mes y lleva fecha, que es lo que permite avisar", () => {
    const cuotas = upcomingObligations({
      profile: { legalForm: "SLU" as const },
      from: DESDE,
      horizonDays: 100,
    }).filter((o) => o.obligationCode === "SS_ADMINISTRADOR");
    expect(cuotas.length).toBeGreaterThan(0);
    for (const cuota of cuotas) {
      expect(cuota.dueDate).toBeTruthy();
    }
  });
});

describe("el calendario no empieza antes que la empresa", () => {
  const SOCIEDAD_SLU = { legalForm: "SLU" as const };

  it("sin fecha de inicio declarada, no filtra nada", () => {
    // Esconder una obligación de quien ya venía funcionando antes de usar la
    // app sería peor que mostrar una de más. Mientras no se declare, se ve todo.
    const todas = upcomingObligations({ profile: SOCIEDAD_SLU, from: "2026-09-14", horizonDays: 120 });
    expect(todas.length).toBeGreaterThan(0);
    expect(todas.some((o) => o.dueDate && o.dueDate < "2026-11-01")).toBe(true);
  });

  it("con fecha de inicio, desaparecen los vencimientos anteriores", () => {
    // El caso real de A.R.E.S.: constituyéndose en otoño, el calendario ofrecía
    // el IVA del tercer trimestre de 2026, cuando la empresa no existía.
    const filtradas = upcomingObligations({
      profile: SOCIEDAD_SLU,
      from: "2026-09-14",
      horizonDays: 120,
      activityStart: "2026-11-01",
    });
    for (const o of filtradas) {
      if (!o.dueDate) continue;
      expect(o.dueDate >= "2026-11-01").toBe(true);
    }
  });

  it("filtrar quita vencimientos, nunca los añade", () => {
    const base = { profile: SOCIEDAD_SLU, from: "2026-09-14", horizonDays: 400 };
    const sinFecha = upcomingObligations(base);
    const conFecha = upcomingObligations({ ...base, activityStart: "2026-11-01" });
    expect(conFecha.length).toBeLessThanOrEqual(sinFecha.length);
    const codigosBase = new Set(sinFecha.map((o) => o.code));
    for (const o of conFecha) expect(codigosBase.has(o.code)).toBe(true);
  });

});

/**
 * Hueco 4: una obligación sin fecha no genera aviso, porque el aviso se calcula
 * diez, tres y un día antes de una fecha. El resumen anual de retenciones y el
 * depósito de cuentas salían sin fecha, y por tanto no avisaban de nada.
 */
describe("las obligaciones que antes no tenían fecha ya la tienen", () => {
  it("el modelo 190 vence el 31 de enero del año siguiente", () => {
    const resumen = upcomingObligations({
      profile: { ...SOCIEDAD, willHireWorkers: true },
      from: "2027-01-01",
      horizonDays: 60,
    }).find((o) => o.obligationCode === "RETENCIONES_190");

    // 31 de enero de 2027 es domingo: se traslada al lunes 1 de febrero.
    expect(resumen?.dueDate).toBe("2027-02-01");
    expect(resumen?.periodLabel).toBe("Ejercicio 2026");
    expect(resumen?.shiftNote).toBeTruthy();
    expect(resumen?.pendingVerification).toBeUndefined();
  });

  it("el 190 del ejercicio 2025 coincide con la fecha que publica la AEAT", () => {
    // La sede publica «del 1 de enero al 2 de febrero de 2026», porque el 31 de
    // enero de 2026 cae en sábado. Si el motor diera otra cosa, estaría mal.
    const resumen = upcomingObligations({
      profile: { ...SOCIEDAD, willHireWorkers: true },
      from: "2026-01-02",
      horizonDays: 60,
    }).find((o) => o.obligationCode === "RETENCIONES_190");
    expect(resumen?.dueDate).toBe("2026-02-02");
  });

  it("la junta ordinaria aparece con su límite de seis meses", () => {
    const junta = upcomingObligations({ profile: SOCIEDAD, from: "2027-01-01", horizonDays: 300 }).find(
      (o) => o.obligationCode === "JUNTA_ORDINARIA",
    );
    expect(junta?.dueDate).toBe("2027-06-30");
    expect(junta?.responsible).toBe("ADMINISTRADOR");
    expect(junta?.limitNote).toContain("último día");
  });

  it("un autónomo no tiene junta ni depósito de cuentas", () => {
    const codigos = upcomingObligations({ profile: AUTONOMO, from: "2027-01-01", horizonDays: 400 }).map(
      (o) => o.obligationCode,
    );
    expect(codigos).not.toContain("JUNTA_ORDINARIA");
    expect(codigos).not.toContain("CUENTAS_ANUALES");
  });

  it("sin fecha de junta, el depósito muestra el límite exterior y dice que lo es", () => {
    const cuentas = upcomingObligations({ profile: SOCIEDAD, from: "2027-01-01", horizonDays: 300 }).find(
      (o) => o.obligationCode === "CUENTAS_ANUALES",
    );
    expect(cuentas?.dueDate).toBe("2027-07-30");
    expect(cuentas?.limitNote).toContain("límite exterior");
    // Lo importante: que no se lea como «tu plazo».
    expect(cuentas?.limitNote).toContain("terminó antes");
  });

  it("un límite legal no se traslada al lunes aunque caiga en fin de semana", () => {
    // 30 de junio de 2029 es sábado. Moverlo al lunes 2 de julio daría por bueno
    // un día en que el plazo del artículo 164 ya habría pasado.
    const junta = upcomingObligations({ profile: SOCIEDAD, from: "2029-01-01", horizonDays: 300 }).find(
      (o) => o.obligationCode === "JUNTA_ORDINARIA",
    );
    expect(junta?.dueDate).toBe("2029-06-30");
    expect(junta?.shiftNote).toBeUndefined();
  });

  it("con la fecha de aprobación, el depósito pasa a ser el plazo de esta sociedad", () => {
    const cuentas = upcomingObligations({
      profile: SOCIEDAD,
      from: "2027-01-01",
      horizonDays: 300,
      accountsApproval: "2027-03-15",
    }).find((o) => o.obligationCode === "CUENTAS_ANUALES");

    expect(cuentas?.dueDate).toBe("2027-04-15");
    expect(cuentas?.limitNote).toBeUndefined();
    expect(cuentas?.anchorNote).toContain("2027-03-15");
    expect(cuentas?.periodLabel).toBe("Ejercicio 2026");
  });

  it("del 31 de enero sale el 28 de febrero, no el 3 de marzo", () => {
    const cuentas = upcomingObligations({
      profile: SOCIEDAD,
      from: "2027-01-01",
      horizonDays: 300,
      accountsApproval: "2027-01-31",
    }).find((o) => o.obligationCode === "CUENTAS_ANUALES");
    // «Dentro del mes siguiente» no puede dar más de un mes por desbordar días.
    expect(cuentas?.dueDate).toBe("2027-02-28");
  });

  it("una fecha de aprobación con formato inválido se ignora, no rompe el calendario", () => {
    const cuentas = upcomingObligations({
      profile: SOCIEDAD,
      from: "2027-01-01",
      horizonDays: 300,
      accountsApproval: "el mes pasado",
    }).find((o) => o.obligationCode === "CUENTAS_ANUALES");
    expect(cuentas?.dueDate).toBe("2027-07-30");
  });
});

describe("separar lo que avisa de lo que no", () => {
  it("splitByDate reparte sin perder ni duplicar nada", () => {
    const ocurrencias = upcomingObligations({
      profile: { ...SOCIEDAD, hasPremises: true, willHireWorkers: true },
      from: "2026-09-14",
      horizonDays: 400,
    });
    const { conFecha, sinFecha } = splitByDate(ocurrencias);
    expect(conFecha.length + sinFecha.length).toBe(ocurrencias.length);
    for (const o of conFecha) expect(o.dueDate).toBeTruthy();
    for (const o of sinFecha) expect(o.dueDate).toBeNull();
  });

  it("hoy no queda ninguna obligación sin fecha para una sociedad", () => {
    const { sinFecha } = splitByDate(
      upcomingObligations({
        profile: { ...SOCIEDAD, hasPremises: true, willHireWorkers: true },
        from: "2026-09-14",
        horizonDays: 400,
      }),
    );
    expect(sinFecha).toHaveLength(0);
  });
});

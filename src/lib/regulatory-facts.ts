/**
 * Dato regulatorio, separado del código y de la interfaz.
 *
 * La normativa cambia; el código no debería. Cada hecho lleva su autoridad, su
 * verbatim, su fecha de verificación y una regla de producto. Un hecho con
 * `requiresLiveVerification` no puede sostener una obligación cerrada: la tarea
 * que dependa de él nace avisando de que falta comprobarlo.
 */

export type StatementAuthority =
  | "OFFICIAL_SOURCE"
  | "LAW"
  | "INFERENCE"
  | "USER_DATA"
  | "MODEL_SUGGESTION"
  | "NO_VERIFIED_SOURCE";

export type RegulatoryFact = {
  key: string;
  statement: string;
  authority: StatementAuthority;
  effectiveDate?: string;
  lastVerifiedAt: string;
  confidence: number;
  requiresLiveVerification: boolean;
  productRule: string;
  sources: Array<{ authority: string; title: string; url: string }>;
  verificationNote?: string;
};

export const REGULATORY_FACTS: RegulatoryFact[] = [
  {
    key: "MODELO_037_SUPRIMIDO",
    statement:
      "El modelo 037 de declaración censal simplificada está suprimido. La operativa censal se concentra en el modelo 036.",
    authority: "LAW",
    effectiveDate: "2025-02-03",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.98,
    requiresLiveVerification: false,
    productRule:
      "Ninguna tarea, documento ni respuesta puede indicar que se presente el modelo 037. Sólo cabe mencionarlo para decir que está suprimido.",
    sources: [
      {
        authority: "BOE",
        title: "Orden HAC/1526/2024, de 11 de diciembre",
        url: "https://www.boe.es/buscar/doc.php?id=BOE-A-2025-410",
      },
      {
        authority: "AEAT",
        title: "Orden Ministerial de modificación de declaraciones censales",
        url: "https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/enero/9/orden-ministerial-modificacion-declaraciones-censales.html",
      },
    ],
  },
  {
    key: "MODELO_036_TITULARIDAD_REAL",
    statement:
      "El modelo 036 incorpora un apartado para comunicar la titularidad real de personas jurídicas y entidades, y una casilla para solicitar la rehabilitación del NIF.",
    authority: "LAW",
    effectiveDate: "2025-02-03",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.97,
    requiresLiveVerification: false,
    productRule:
      "Si el sujeto es persona jurídica, el expediente debe recoger la titularidad real. Es un dato de riesgo alto: exige confirmación explícita.",
    sources: [
      {
        authority: "BOE",
        title: "Orden HAC/1526/2024, de 11 de diciembre",
        url: "https://www.boe.es/buscar/doc.php?id=BOE-A-2025-410",
      },
    ],
  },
  {
    key: "IAE_EXENCIONES",
    statement:
      "Están exentos del IAE las personas físicas, residentes o no; los sujetos pasivos del Impuesto sobre Sociedades, sociedades civiles y entidades del artículo 35.4 de la LGT con importe neto de la cifra de negocios inferior a 1.000.000 €; y quienes inicien actividad en territorio español, durante los dos primeros períodos impositivos del impuesto en que se desarrolle aquella.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "No confundir alta de actividad, obligación censal, obligación de pagar IAE y los modelos 036, 840 y 848.",
    sources: [
      {
        authority: "AEAT",
        title: "Folleto de actividades económicas — Impuesto sobre Actividades Económicas",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/folleto-actividades-economicas/2-impuesto-sobre-actividades-economicas.html",
      },
    ],
  },
  {
    key: "IAE_MODELOS",
    statement:
      "Quien no está exento del IAE comunica altas, bajas y variaciones con el modelo 840. Quien está exento lo hace con el modelo 036. Las personas jurídicas y entidades con importe neto de la cifra de negocios igual o superior a 1.000.000 € presentan además el modelo 848 entre el 1 de enero y el 14 de febrero, salvo que ese importe ya conste en la declaración del Impuesto sobre Sociedades o del IRNR.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.93,
    requiresLiveVerification: false,
    productRule: "El itinerario deriva la tarea censal de esta matriz, nunca del criterio libre de un modelo.",
    sources: [
      {
        authority: "AEAT",
        title: "IAE — ¿Qué modelo de declaración tengo que presentar?",
        url: "https://sede.agenciatributaria.gob.es/Sede/declaraciones-informativas-otros-impuestos-tasas/impuesto-sobre-actividades-economicas/que-modelo-declaracion-tengo-que-presentar.html",
      },
    ],
  },
  {
    key: "SL_CAPITAL_MINIMO",
    statement:
      "El capital mínimo de la sociedad de responsabilidad limitada es de un euro. Mientras el capital no alcance 3.000 € debe destinarse a la reserva legal al menos el 20 % del beneficio hasta que la suma de reserva y capital llegue a esa cifra, y en caso de liquidación con patrimonio insuficiente los socios responden solidariamente de la diferencia hasta 3.000 €.",
    authority: "LAW",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "Nunca presentar 1 € como recomendación por defecto. Exponer las tres consecuencias y dejar decidir a la persona.",
    sources: [
      {
        authority: "BOE",
        title: "Ley de Sociedades de Capital, texto consolidado",
        url: "https://www.boe.es/buscar/act.php?id=BOE-A-2010-10544",
      },
    ],
  },
  {
    key: "TGSS_INSCRIPCION_EMPRESA",
    statement:
      "Quien vaya a contratar trabajadores por primera vez debe inscribirse como empresario en la Seguridad Social antes del inicio de la actividad y obtener un Código de Cuenta de Cotización.",
    authority: "NO_VERIFIED_SOURCE",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.4,
    requiresLiveVerification: true,
    verificationNote:
      "Pendiente de verificar contra Importass: el portal de la Seguridad Social exige JavaScript y el extractor no obtuvo contenido.",
    productRule:
      "La tarea de inscripción no nace lista para ejecutarse: avisa de que el fundamento está sin verificar.",
    sources: [
      {
        authority: "TGSS",
        title: "Importass — Portal de trámites de la Seguridad Social",
        url: "https://portal.seg-social.gob.es/wps/portal/importass/importass",
      },
    ],
  },
  {
    key: "CIRCE_DUE",
    statement:
      "CIRCE permite tramitar telemáticamente la constitución y puesta en marcha de determinadas formas empresariales mediante el Documento Único Electrónico, a través de los Puntos de Atención al Emprendimiento.",
    authority: "NO_VERIFIED_SOURCE",
    lastVerifiedAt: "2026-09-02",
    confidence: 0.45,
    requiresLiveVerification: true,
    verificationNote:
      "Pendiente de confirmar qué formas jurídicas admite hoy: la página del Punto de Acceso General está bloqueada por robots.txt.",
    productRule:
      "Ofrecer CIRCE como ruta preferente sólo tras verificar que la forma jurídica concreta es tramitable. Nunca automatizar la presentación: se enlaza al PAE.",
    sources: [
      {
        authority: "CIRCE / PAE",
        title: "PAE electrónico",
        url: "https://www.paeelectronico.es/",
      },
    ],
  },
  {
    key: "PLAZO_RETENCIONES_TRIMESTRAL",
    statement:
      "Las retenciones e ingresos a cuenta de cada trimestre (modelos 111, 115, 117, 123, 124, 126, 128, 136, 210 y 216) se presentan hasta el día 20 del mes siguiente al fin del trimestre. Las del cuarto trimestre, hasta el 20 de enero.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "El calendario puede fijar la fecha de los modelos 111 y 115. Si cae en sábado, domingo o festivo, se traslada al siguiente día hábil y el aviso debe decir que los festivos autonómicos y locales no están aplicados.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 20 de abril",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/abril/hasta-20-abril.html",
      },
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 20 de enero",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/enero/hasta-20-enero.html",
      },
    ],
  },
  {
    key: "PLAZO_IVA_TRIMESTRAL",
    statement:
      "La autoliquidación trimestral de IVA (modelo 303) se presenta hasta el día 20 del mes siguiente al fin del trimestre. La del cuarto trimestre, hasta el 30 de enero, junto con el resumen anual (modelo 390).",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "El calendario puede fijar la fecha del modelo 303 y del 390. El cuarto trimestre no vence el día 20: vence el 30 de enero.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 20 de abril",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/abril/hasta-20-abril.html",
      },
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 30 de enero",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/enero/hasta-30-enero.html",
      },
    ],
  },
  {
    key: "PLAZO_PAGO_FRACCIONADO_IRPF",
    statement:
      "El pago fraccionado de IRPF en estimación directa (modelo 130) se presenta hasta el día 20 del mes siguiente al fin del trimestre; el del cuarto trimestre, hasta el 30 de enero.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.94,
    requiresLiveVerification: false,
    productRule:
      "Sólo aplica a persona física en estimación directa. Una sociedad no presenta el modelo 130.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 20 de abril",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/abril/hasta-20-abril.html",
      },
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 30 de enero",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/enero/hasta-30-enero.html",
      },
    ],
  },
  {
    key: "PLAZO_PAGO_FRACCIONADO_SOCIEDADES",
    statement:
      "El pago fraccionado del Impuesto sobre Sociedades en régimen general (modelo 202) se presenta en abril, octubre y diciembre, hasta el día 20 de cada uno de esos meses.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.9,
    requiresLiveVerification: false,
    productRule:
      "Sólo aplica a entidades sujetas al Impuesto sobre Sociedades. La obligación de presentarlo depende de la cifra de negocios y del resultado del ejercicio anterior: el aviso debe decirlo.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 20 de abril",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/abril/hasta-20-abril.html",
      },
    ],
  },
  {
    key: "PLAZO_IMPUESTO_SOCIEDADES",
    statement:
      "La declaración anual del Impuesto sobre Sociedades (modelos 200 y 220) se presenta en los 25 días naturales siguientes a los seis meses posteriores al fin del período impositivo. Para entidades cuyo período impositivo coincide con el año natural, el plazo termina el 25 de julio; en el calendario de 2026 figura hasta el 27 de julio por traslado a día hábil.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "Sólo aplica a entidades sujetas al Impuesto sobre Sociedades. Si el ejercicio no coincide con el año natural, la fecha se calcula desde el cierre y debe decirse expresamente.",
    sources: [
      {
        authority: "AEAT",
        title: "Calendario del contribuyente 2026 · hasta el 27 de julio",
        url: "https://sede.agenciatributaria.gob.es/Sede/ayuda/calendario-contribuyente/calendario-contribuyente-2026/calendario-anual/julio/hasta-27-julio.html",
      },
    ],
  },
  {
    key: "PLAZO_CUOTA_RETA",
    statement:
      "El ingreso de las cuotas del Régimen Especial de Trabajadores Autónomos correspondientes a cada mes se realiza dentro de ese mismo mes.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-04",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "Aplica a quien esté de alta en RETA: autónomo y también socio administrador cuando corresponda. Con domiciliación el cargo lo practica la Tesorería; el aviso no puede afirmar que el pago ya está hecho.",
    sources: [
      {
        authority: "Seguridad Social",
        title: "Cotización y recaudación de trabajadores · plazo de ingreso",
        url: "https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/CotizacionRecaudacionTrabajadores/10721/10724/1320/1323",
      },
    ],
  },
  {
    key: "RMC_DENOMINACION",
    statement:
      "La certificación negativa de denominación social se solicita al Registro Mercantil Central. En cada solicitud «se consignarán hasta un máximo de cinco denominaciones por orden de preferencia». La certificación «tendrá una vigencia de TRES MESES a efectos de otorgamiento de escritura, contados desde la fecha de su expedición», y la denominación «quedará registrada a nombre del interesado o beneficiario de la misma durante el plazo de SEIS MESES, contados desde la fecha de expedición».",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "Una denominación no se da nunca por disponible sin la certificación emitida. Los dos plazos son distintos y no se confunden: tres meses para firmar ante notario, seis de reserva.",
    sources: [
      {
        authority: "Registro Mercantil Central",
        title: "Denominaciones sociales · certificación negativa",
        url: "https://www.rmc.es/DenominacionesSociales.aspx",
      },
    ],
  },
  {
    key: "LSC_CONSTITUCION_ESCRITURA",
    statement:
      "El artículo 20 de la Ley de Sociedades de Capital establece que «la constitución de las sociedades de capital exigirá escritura pública, que deberá inscribirse en el Registro Mercantil».",
    authority: "LAW",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.95,
    requiresLiveVerification: false,
    productRule:
      "La escritura y la inscripción son dos pasos, no uno. Firmada la escritura la sociedad todavía no está inscrita, y el expediente no puede dar por hecha la inscripción con la copia de la escritura.",
    sources: [
      {
        authority: "BOE",
        title: "Ley de Sociedades de Capital, texto consolidado",
        url: "https://www.boe.es/buscar/act.php?id=BOE-A-2010-10544",
      },
    ],
  },
  {
    key: "NIF_ENTIDAD",
    statement:
      "Las personas jurídicas y entidades sin personalidad jurídica tienen la obligación de disponer de NIF cuando vayan a realizar operaciones con trascendencia tributaria. La solicitud se hace con el modelo 036.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.9,
    requiresLiveVerification: false,
    productRule:
      "El NIF provisional y el definitivo son dos momentos del mismo procedimiento: el provisional permite operar antes de la inscripción, el definitivo llega después de ella. Ninguno se da por concedido sin la comunicación de la AEAT.",
    sources: [
      {
        authority: "AEAT",
        title: "NIF de persona jurídica y entidad",
        url: "https://sede.agenciatributaria.gob.es/Sede/censos-nif-domicilio-fiscal/solicitar-nif/nif-persona-juridica-entidad.html",
      },
    ],
  },
  {
    key: "LEGALIZACION_LIBROS",
    statement:
      "La Instrucción de 12 de febrero de 2015 de la Dirección General de los Registros y del Notariado, sobre legalización de libros de los empresarios, establece que la presentación se hace «dentro de los cuatro meses siguientes al cierre del ejercicio social» y que «la presentación de dichos libros para su legalización en el Registro Mercantil competente por razón del domicilio, deberá ser por vía telemática». Para los ejercicios iniciados a partir del 29 de septiembre de 2013 no cabe la legalización en papel ni en soporte electrónico no presentado por vía telemática.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.9,
    requiresLiveVerification: false,
    productRule:
      "El plazo se cuenta desde el cierre del ejercicio, no desde la junta ni desde el depósito: es anterior a ambos y se confunde con ellos con facilidad. El calendario lo muestra como límite calculado sobre un ejercicio cerrado a 31 de diciembre.",
    sources: [
      {
        authority: "BOE",
        title: "Instrucción de 12 de febrero de 2015, sobre legalización de libros de los empresarios",
        url: "https://www.boe.es/buscar/doc.php?id=BOE-A-2015-1481",
      },
    ],
  },
  {
    key: "REGLAMENTO_FACTURACION",
    statement:
      "El Real Decreto 1619/2012, de 30 de noviembre, aprueba el Reglamento por el que se regulan las obligaciones de facturación. Es la norma que fija el contenido obligatorio de una factura.",
    authority: "LAW",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.92,
    requiresLiveVerification: false,
    productRule:
      "El contenido de la factura se cita desde el Reglamento vigente, nunca de memoria ni de una plantilla. La aplicación enlaza la norma y no afirma qué campos lleva una factura concreta.",
    sources: [
      {
        authority: "BOE",
        title: "Real Decreto 1619/2012, Reglamento de obligaciones de facturación",
        url: "https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696",
      },
    ],
  },
  {
    key: "FACTURA_ELECTRONICA_B2B",
    statement:
      "El Real Decreto 238/2026, de 25 de marzo, desarrolla el sistema de facturación electrónica obligatoria entre empresarios y profesionales y modifica el Reglamento de facturación. Entró en vigor a los veinte días de su publicación. Su aplicación efectiva se cuenta desde la entrada en vigor de la orden ministerial de desarrollo: doce meses después para «empresarios y profesionales cuyo volumen de operaciones haya excedido de 8 millones de euros durante el año natural inmediato anterior», y veinticuatro meses después para «el resto de los empresarios y profesionales».",
    authority: "LAW",
    effectiveDate: "2026-04-20",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.75,
    requiresLiveVerification: true,
    verificationNote:
      "La fecha desde la que obliga depende de la entrada en vigor de la orden ministerial de desarrollo, que no está confirmada aquí. Comprueba en el BOE si ya se ha publicado antes de contar los doce o veinticuatro meses.",
    productRule:
      "Se informa de que viene y de en qué tramo cae la empresa, nunca de una fecha concreta de obligatoriedad. Una empresa que empieza hoy no está obligada todavía, y decirle lo contrario la haría gastar en algo que aún no necesita.",
    sources: [
      {
        authority: "BOE",
        title: "Real Decreto 238/2026, de facturación electrónica obligatoria entre empresarios",
        url: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-7295",
      },
    ],
  },
  {
    key: "ROI_OPERADORES_INTRACOMUNITARIOS",
    statement:
      "Deben estar incluidas en el Registro de Operadores Intracomunitarios «las personas o entidades que vayan a efectuar entregas o adquisiciones intracomunitarias de bienes sujetas a dicho tributo» y «los empresarios o profesionales que sean destinatarios de servicios prestados por empresarios o profesionales no establecidos en el territorio» de aplicación del IVA.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.9,
    requiresLiveVerification: false,
    productRule:
      "El alta en el registro y la validez del NIF-IVA en VIES son cosas distintas: no se factura sin IVA a un cliente europeo hasta comprobar el NIF en VIES.",
    sources: [
      {
        authority: "AEAT",
        title: "Registro de operadores intracomunitarios",
        url: "https://sede.agenciatributaria.gob.es/Sede/censos-nif-domicilio-fiscal/quien-debe-estar-censado/registro-operadores-intracomunitarios.html",
      },
    ],
  },
  {
    key: "EORI_OPERADORES",
    statement:
      "El número EORI identifica a los operadores económicos ante las autoridades aduaneras. La Agencia Tributaria mantiene la información sobre quién debe solicitarlo y cómo se obtiene o se asocia al NIF.",
    authority: "OFFICIAL_SOURCE",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.85,
    requiresLiveVerification: false,
    productRule:
      "No se afirma que una operación concreta exija EORI: se enlaza la fuente y se deja la comprobación al caso, porque depende de qué se mueve y hacia dónde.",
    sources: [
      {
        authority: "AEAT",
        title: "Registro e identificación de operadores económicos (EORI)",
        url: "https://sede.agenciatributaria.gob.es/Sede/censos-nif-domicilio-fiscal/quien-debe-estar-censado/registro-identificacion-operadores-economicos/registro-eori.html",
      },
    ],
  },
  {
    key: "PLAZO_RESUMEN_ANUAL_RETENCIONES",
    statement:
      "El artículo 5 de la Orden EHA/3127/2009 fija el plazo del resumen anual de retenciones, modelo 190: «la presentación del resumen anual de retenciones e ingresos a cuenta, modelo 190, se realizará en los primeros veinte días naturales del mes de enero de cada año»; «no obstante, el plazo de presentación será el comprendido entre el 1 de enero y el 31 de enero del año siguiente al que corresponde el resumen anual» cuando la declaración se presente por vía telemática, en soporte legible por ordenador o en impreso del módulo de la AEAT. La presentación por internet es la vía ordinaria, de modo que el plazo aplicable es el que termina el 31 de enero. Para el resumen del ejercicio 2025 la Agencia Tributaria publica el plazo «del 1 de enero al 2 de febrero de 2026», porque el 31 de enero de 2026 cae en sábado.",
    authority: "LAW",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.93,
    requiresLiveVerification: false,
    productRule:
      "El calendario fija el vencimiento del modelo 190 el 31 de enero del año siguiente al ejercicio, trasladado al siguiente día hábil si cae en fin de semana. El aviso debe seguir diciendo que los festivos autonómicos y locales no están aplicados.",
    sources: [
      {
        authority: "BOE",
        title: "Orden EHA/3127/2009, artículo 5 · texto consolidado",
        url: "https://www.boe.es/buscar/act.php?id=BOE-A-2009-18567",
      },
      {
        authority: "AEAT",
        title: "Modelo 190 · plazos de presentación",
        url: "https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-190-decla_____moniales-imputaciones-rentas-anual_/plazos-presentacion.html",
      },
    ],
  },
  {
    key: "PLAZO_JUNTA_ORDINARIA",
    statement:
      "El artículo 164 de la Ley de Sociedades de Capital establece que «la junta general ordinaria, previamente convocada al efecto, se reunirá necesariamente dentro de los seis primeros meses de cada ejercicio». Es la junta que aprueba las cuentas del ejercicio anterior, y de esa aprobación arranca el plazo de depósito del artículo 279.",
    authority: "LAW",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.92,
    requiresLiveVerification: false,
    productRule:
      "Es un límite, no una fecha elegida: la junta puede reunirse antes, nunca después. El calendario lo muestra como vencimiento porque es la única fecha cierta, y advierte de que se cuenta sobre un ejercicio cerrado a 31 de diciembre.",
    sources: [
      {
        authority: "BOE",
        title: "Ley de Sociedades de Capital, texto consolidado",
        url: "https://www.boe.es/buscar/act.php?id=BOE-A-2010-10544",
      },
      {
        authority: "BOE · DGSJFP",
        title:
          "Resolución de 10 de diciembre de 2024, que transcribe los artículos 164 y 279 de la Ley de Sociedades de Capital",
        url: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-2394",
      },
    ],
  },
  {
    key: "PLAZO_CUENTAS_ANUALES",
    statement:
      "El artículo 279.1 de la Ley de Sociedades de Capital establece que «dentro del mes siguiente a la aprobación de las cuentas anuales, los administradores de la sociedad presentarán» su depósito en el Registro Mercantil. La fecha propia de cada sociedad depende, por tanto, del día en que la junta apruebe. Como esa junta debe reunirse dentro de los seis primeros meses del ejercicio siguiente (artículo 164), con el ejercicio cerrado a 31 de diciembre el límite exterior del depósito es el 30 de julio.",
    authority: "LAW",
    lastVerifiedAt: "2026-09-14",
    confidence: 0.9,
    requiresLiveVerification: false,
    productRule:
      "Si el expediente registra la fecha de aprobación por la junta, el vencimiento es un mes después de esa fecha y el aviso se calcula sobre ella. Si no la registra, se muestra el límite exterior diciendo expresamente que es un límite y no la fecha de esta sociedad: si la junta aprobó antes, el plazo terminó antes.",
    sources: [
      {
        authority: "BOE",
        title: "Ley de Sociedades de Capital, texto consolidado",
        url: "https://www.boe.es/buscar/act.php?id=BOE-A-2010-10544",
      },
      {
        authority: "BOE · DGSJFP",
        title:
          "Resolución de 10 de diciembre de 2024, que transcribe los artículos 164 y 279 de la Ley de Sociedades de Capital",
        url: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-2394",
      },
      {
        authority: "BOE",
        title: "Real Decreto 1784/1996, Reglamento del Registro Mercantil",
        url: "https://www.boe.es/buscar/act.php?id=BOE-A-1996-17533",
      },
    ],
  },
];

export function fact(key: string): RegulatoryFact | undefined {
  return REGULATORY_FACTS.find((item) => item.key === key);
}

/** Un hecho sólo sostiene una obligación si está verificado y viene de fuente oficial o de la ley. */
export function isBindingFact(item: RegulatoryFact | undefined): boolean {
  return Boolean(
    item &&
      !item.requiresLiveVerification &&
      (item.authority === "OFFICIAL_SOURCE" || item.authority === "LAW"),
  );
}

export const INFORMATIONAL_FOOTER =
  "Información orientativa basada en fuentes oficiales consultadas. No constituye una consulta tributaria vinculante. Para una respuesta tributaria escrita vinculante corresponde acudir a los mecanismos oficiales competentes.";

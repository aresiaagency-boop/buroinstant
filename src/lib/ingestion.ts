import type {
  ExtractedField,
  FieldRisk,
  OrbeInboundMessage,
} from "@/types/domain";

const HIGH_RISK_FIELDS = new Set([
  "identification_number",
  "proposed_capital",
  "ownership_percentages",
  "administrator_structure",
  "administrator_paid",
  "tax_address",
  "declared_activity",
  "iae_code",
  "beneficial_owner",
]);

const MEDIUM_RISK_FIELDS = new Set([
  "preferred_legal_form",
  "number_of_founders",
  "municipality",
  "physical_premises",
  "will_hire_workers",
]);

export function riskForField(field: string): FieldRisk {
  if (HIGH_RISK_FIELDS.has(field)) return "HIGH_RISK";
  if (MEDIUM_RISK_FIELDS.has(field)) return "MEDIUM_RISK";
  return "LOW_RISK";
}

function sourceFor(message: OrbeInboundMessage): ExtractedField["source"] {
  if (message.channel === "WHATSAPP") {
    return message.inputType === "VOICE" ? "WHATSAPP_VOICE" : "WHATSAPP_TEXT";
  }
  return message.inputType === "VOICE" ? "WEB_VOICE" : "WEB_TEXT";
}

function createField(
  message: OrbeInboundMessage,
  field: string,
  value: unknown,
  confidence: number,
): ExtractedField {
  const risk = riskForField(field);
  return {
    field,
    value,
    confidence,
    source: sourceFor(message),
    risk,
    status:
      risk === "HIGH_RISK"
        ? "NEEDS_CONFIRMATION"
        : risk === "MEDIUM_RISK"
          ? "PROPOSED"
          : "APPLIED",
    requiresConfirmation: risk !== "LOW_RISK",
  };
}

function extractMunicipality(text: string) {
  const match = text.match(
    /(?:trabaj(?:ar|ar[eé]|o|aremos)|operar[eé]?|empresa|negocio)\s+(?:inicialmente\s+)?(?:desde|en)\s+([\p{L}][\p{L}\s-]{1,38}?)(?:[,.]|\s+y\s+|\s+pero\s+|$)/iu,
  );
  return match?.[1]?.trim();
}

export function extractCandidateData(message: OrbeInboundMessage): ExtractedField[] {
  const text = message.text.trim();
  const normalized = text.toLocaleLowerCase("es-ES");
  const fields: ExtractedField[] = [
    createField(message, "business_description", text, 0.76),
  ];

  if (/\b(s\.l\.u\.?|slu|sociedad limitada unipersonal)\b/i.test(text)) {
    fields.push(createField(message, "preferred_legal_form", "SLU", 0.98));
  } else if (/\b(s\.l\.?|sl|sociedad limitada)\b/i.test(text)) {
    fields.push(createField(message, "preferred_legal_form", "SL", 0.96));
  } else if (/\baut[oó]nom[oa]\b/i.test(text)) {
    fields.push(createField(message, "preferred_legal_form", "AUTONOMO", 0.97));
  }

  if (/\b(yo\s+solo|yo\s+sola|ser[eé]\s+yo\s+solo|sin\s+socios|[uú]nico\s+socio)\b/i.test(text)) {
    fields.push(createField(message, "number_of_founders", 1, 0.97));
  } else {
    const founders = normalized.match(/\b(\d{1,2})\s+(?:socios?|fundadores?)\b/);
    if (founders) fields.push(createField(message, "number_of_founders", Number(founders[1]), 0.95));
    else if (/\b(dos|2)\s+(?:socios?|fundadores?)\b/i.test(text)) {
      fields.push(createField(message, "number_of_founders", 2, 0.96));
    }
  }

  if (/\b(online|remoto|sin\s+local|desde\s+casa)\b/i.test(text)) {
    fields.push(createField(message, "physical_premises", false, 0.88));
    fields.push(createField(message, "online_activity", true, 0.88));
  } else if (/\b(local\s+f[ií]sico|tienda|oficina|establecimiento)\b/i.test(text)) {
    fields.push(createField(message, "physical_premises", true, 0.83));
  }

  const municipality = extractMunicipality(text);
  if (municipality) fields.push(createField(message, "municipality", municipality, 0.79));

  if (/\b(administrador(?:a)?\s+[uú]nic[oa])\b/i.test(text)) {
    fields.push(createField(message, "administrator_structure", "SOLE_ADMINISTRATOR", 0.96));
  }
  if (/\b(no\s+(?:voy\s+a\s+)?cobrar|no\s+(?:ser[aá]|será)\s+retribuid[oa]|cargo\s+no\s+(?:ser[aá]\s+)?retribuid[oa])\b/i.test(text)) {
    fields.push(createField(message, "administrator_paid", false, 0.9));
  }

  return fields.filter(
    (candidate, index, all) => all.findIndex((item) => item.field === candidate.field) === index,
  );
}

export function detectContradictions(
  existingProfile: Record<string, unknown>,
  fields: ExtractedField[],
) {
  return fields
    .filter(
      ({ field, value }) =>
        field in existingProfile &&
        existingProfile[field] !== null &&
        JSON.stringify(existingProfile[field]) !== JSON.stringify(value),
    )
    .map(({ field, value }) => ({
      code: "DATA_CONFLICT" as const,
      field,
      existingValue: existingProfile[field],
      proposedValue: value,
    }));
}

export function nextBestQuestion(fields: ExtractedField[], existing: Record<string, unknown>) {
  const known = new Set([...Object.keys(existing), ...fields.map((field) => field.field)]);
  if (!known.has("business_description")) return "Cuéntame qué empresa quieres crear.";
  if (!known.has("number_of_founders")) return "¿La crearás tú solo o con otros socios?";
  if (!known.has("physical_premises")) return "¿Tendrás un local físico o trabajarás inicialmente online?";
  if (!known.has("municipality")) return "¿En qué municipio estará inicialmente la actividad?";
  if (!known.has("will_hire_workers")) return "¿Prevés contratar trabajadores al comenzar?";
  return "Ya puedo preparar el diagnóstico inicial. ¿Quieres que lo genere ahora?";
}

export class BusinessDataIngestionService {
  process(message: OrbeInboundMessage, existingProfile: Record<string, unknown> = {}) {
    const extractedFields = extractCandidateData(message);
    const contradictions = detectContradictions(existingProfile, extractedFields);
    return {
      extractedFields,
      contradictions,
      unansweredQuestions: [],
      suggestedNextQuestion: nextBestQuestion(extractedFields, existingProfile),
      requiresConfirmation: extractedFields.some((field) => field.requiresConfirmation),
    };
  }
}

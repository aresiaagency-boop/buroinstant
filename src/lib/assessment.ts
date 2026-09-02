import type { z } from "zod";
import { assessmentInputSchema } from "@/lib/schemas";

export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

export function assessBusinessFormation(input: AssessmentInput) {
  const missingInformation: string[] = [];
  if (!input.founders) missingInformation.push("Número de fundadores");
  if (!input.activities.length) missingInformation.push("Descripción de la actividad principal");
  if (input.premises === undefined) missingInformation.push("Existencia de local físico");
  if (input.hiringPlan === undefined) missingInformation.push("Plan inicial de contratación");

  const reasons: string[] = [];
  if (input.founders === 1) reasons.push("El proyecto parte de una única persona fundadora.");
  if ((input.liabilityExposure ?? "LOW") !== "LOW") {
    reasons.push("La exposición operativa requiere comparar alternativas con limitación de responsabilidad.");
  }
  if (input.growthIntent === "INTERNATIONAL") {
    reasons.push("La operativa internacional exige verificar obligaciones adicionales antes de ejecutar.");
  }

  return {
    recommendedLegalForms: input.founders === 1 ? ["SLU", "AUTONOMO"] : ["SL"],
    primaryRecommendation: input.founders === 1 ? "SLU" : input.founders ? "SL" : null,
    confidence: missingInformation.length === 0 ? 0.72 : 0.48,
    reasons,
    advantages: [],
    disadvantages: [],
    taxQuestionsToVerify: ["Clasificación censal e IAE en fuente oficial vigente"],
    socialSecurityQuestionsToVerify: ["Encuadramiento aplicable según participación y funciones"],
    requiredProcedures: [],
    missingInformation,
    officialSources: [],
    professionalReviewRecommended: true,
    authority: "MODEL_SUGGESTION" as const,
    informationalOnly: true as const,
  };
}

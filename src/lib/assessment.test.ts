import { describe, expect, it } from "vitest";
import { assessBusinessFormation } from "@/lib/assessment";

describe("BusinessFormationAssessmentEngine", () => {
  it("returns an explainable suggestion and names missing data", () => {
    const result = assessBusinessFormation({ founders: 1, activities: ["Software"], premises: false });
    expect(result.primaryRecommendation).toBe("SLU");
    expect(result.authority).toBe("MODEL_SUGGESTION");
    expect(result.informationalOnly).toBe(true);
    expect(result.missingInformation).toContain("Plan inicial de contratación");
  });
});

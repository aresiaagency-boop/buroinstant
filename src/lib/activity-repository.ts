import { db } from "@/lib/db";
import { assertProjectAccess, readProjectProfile } from "@/lib/task-repository";
import { classifyActivity, type ActivityClassification, type ActivityInput } from "@/lib/activity-classifier";
import type { Actor } from "@/types/domain";

/**
 * Lee del expediente lo que el clasificador necesita y lo clasifica.
 *
 * La comprobación de tenencia es la misma que la de los trámites: un proyecto de
 * otro workspace responde como si no existiera.
 */
export async function readActivityInput(projectId: string): Promise<ActivityInput> {
  const sql = db();
  const [project] = await sql<Array<{ business_description: string | null }>>`
    select business_description from business_projects where id = ${projectId} limit 1
  `;
  const [location] = await sql<Array<{ municipality: string | null }>>`
    select municipality
    from business_locations
    where project_id = ${projectId} and municipality is not null
    order by case location_type when 'ACTIVITY_ADDRESS' then 0 else 1 end
    limit 1
  `;
  const profile = await readProjectProfile(projectId);

  return {
    description: project?.business_description ?? null,
    municipality: location?.municipality ?? null,
    hasPremises: profile.hasPremises ?? null,
    willHireWorkers: profile.willHireWorkers ?? null,
    euOperations: profile.euOperations ?? null,
    nonEuOperations: profile.nonEuOperations ?? null,
    ecommerce: profile.ecommerce ?? null,
    onlineActivity: profile.ecommerce ?? null,
    founderWorksInBusiness: null,
  };
}

export async function classifyProjectActivity(
  actor: Actor,
  projectId: string,
): Promise<ActivityClassification> {
  await assertProjectAccess(actor, projectId);
  return classifyActivity(await readActivityInput(projectId));
}

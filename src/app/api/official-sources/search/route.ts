import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import {
  fetchOfficialSource,
  searchOfficialSourceCatalog,
  toSourceReference,
} from "@/lib/official-sources";

export async function GET(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "SESSION_REQUIRED" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 2) return NextResponse.json({ error: "QUERY_REQUIRED" }, { status: 400 });
  const matches = searchOfficialSourceCatalog(query);
  const verified = await Promise.all(
    matches.map(async (source) => {
      try {
        const snapshot = await fetchOfficialSource(source.url);
        return { ...toSourceReference(source, snapshot.fetchedAt), status: "VERIFIED" as const };
      } catch {
        return { ...toSourceReference(source, null), status: "UNAVAILABLE" as const };
      }
    }),
  );
  return NextResponse.json({ results: verified });
}

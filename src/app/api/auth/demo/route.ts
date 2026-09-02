import { NextResponse } from "next/server";
import { createPreviewToken } from "@/lib/auth";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "PREVIEW_DISABLED", message: "La vista local no está disponible en producción." },
      { status: 403 },
    );
  }
  const response = NextResponse.redirect(new URL("/app", request.url), 303);
  response.cookies.set("buroinstant.preview", createPreviewToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 60 * 60 * 8,
    path: "/",
  });
  return response;
}

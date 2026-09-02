import { NextResponse } from "next/server";

/**
 * Cierre de sesión real. La versión anterior sólo borraba la cookie de
 * previsualización, de modo que una sesión de Google sobrevivía al "salir".
 *
 * Con OAuth el cliente llama antes a `signOut()` de NextAuth; esta ruta limpia
 * además cualquier cookie residual y devuelve a la portada. Sirve también como
 * salida de emergencia si el JavaScript del cliente falla.
 */
const SESSION_COOKIES = [
  "buroinstant.preview",
  "buroinstant.session",
  "__Secure-buroinstant.session",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
];

function clearedRedirect(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  for (const name of SESSION_COOKIES) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
  return response;
}

export async function POST(request: Request) {
  return clearedRedirect(request);
}

export async function GET(request: Request) {
  return clearedRedirect(request);
}

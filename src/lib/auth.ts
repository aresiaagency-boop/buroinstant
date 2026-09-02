import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { Actor } from "@/types/domain";

export const googleOAuthConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET,
);

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "google-oauth-not-configured",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "google-oauth-not-configured",
      authorization: {
        params: { prompt: "select_account", access_type: "offline", response_type: "code" },
      },
    }),
  ],
  pages: { signIn: "/acceso", error: "/acceso" },
  cookies: {
    sessionToken: {
      name: `${process.env.NODE_ENV === "production" ? "__Secure-" : ""}buroinstant.session`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) session.user.id = token.sub ?? "";
      return session;
    },
  },
};

function previewSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NODE_ENV !== "production") return "local-development-only-buroinstant-secret";
  return null;
}

export function createPreviewToken(now = Date.now()) {
  const secret = previewSecret();
  if (!secret) throw new Error("AUTH_NOT_CONFIGURED");
  const timestamp = String(now);
  const signature = createHmac("sha256", secret).update(timestamp).digest("hex");
  return `${timestamp}.${signature}`;
}

export function verifyPreviewToken(token: string | undefined) {
  const secret = previewSecret();
  if (!secret || !token) return false;
  const [timestamp, signature] = token.split(".");
  if (!timestamp || !signature || Date.now() - Number(timestamp) > 8 * 60 * 60 * 1_000) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(timestamp).digest("hex"));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function getCurrentActor(): Promise<Actor | null> {
  const session = googleOAuthConfigured ? await getServerSession(authOptions) : null;
  if (session?.user?.email) {
    return {
      userId: session.user.id || session.user.email,
      email: session.user.email,
      name: session.user.name ?? "Fundador",
      mode: "oauth",
    };
  }

  const cookieStore = await cookies();
  if (verifyPreviewToken(cookieStore.get("buroinstant.preview")?.value)) {
    return {
      userId: "00000000-0000-4000-8000-000000000001",
      email: "preview@buroinstant.local",
      name: "Alex",
      mode: "local_preview",
    };
  }
  return null;
}

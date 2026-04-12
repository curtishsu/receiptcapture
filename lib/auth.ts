import { cookies } from "next/headers";
import { createSession, deleteSession, getSession, getUserById, upsertUserByEmail } from "@/lib/firestore-db";
import { adminAuth } from "@/lib/firebase-admin";

const SESSION_COOKIE = "receipt_tracker_session";
const ALLOWED_EMAIL = "curtismhsu@gmail.com";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getSessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    maxAge
  };
}

async function issueSessionForEmail(email: string): Promise<{ email: string; id: string }> {
  const user = await upsertUserByEmail(email);
  const session = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, getSessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  return { email: user.email, id: user.id };
}

export async function signInWithFirebaseIdToken(idToken: string): Promise<{ email: string; id: string }> {
  const decodedToken = await adminAuth.verifyIdToken(idToken);
  const email = decodedToken.email?.trim().toLowerCase();

  if (!email) {
    throw new Error("Firebase account does not have an email address.");
  }

  if (!decodedToken.email_verified) {
    throw new Error("This account email must be verified before sign-in.");
  }

  if (email !== ALLOWED_EMAIL) {
    throw new Error("This app only allows the approved account to sign in.");
  }

  return issueSessionForEmail(email);
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await deleteSession(token);
  }
  cookieStore.set(SESSION_COOKIE, "", getSessionCookieOptions(0));
}

export async function requireUser(): Promise<{ email: string; id: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = await getSession(token);
  if (!session) {
    return null;
  }

  const user = await getUserById(session.user_id);
  if (!user) {
    return null;
  }

  return { email: user.email, id: user.id };
}

import { NextResponse } from "next/server";
import { signInWithFirebaseIdToken } from "@/lib/auth";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as { idToken?: string };
  const idToken = body.idToken?.trim();

  if (!idToken) {
    return NextResponse.json({ error: "A Firebase ID token is required." }, { status: 400 });
  }

  try {
    const user = await signInWithFirebaseIdToken(idToken);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify Firebase credentials." },
      { status: 401 }
    );
  }
}

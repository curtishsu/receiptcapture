import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listKnownUnits } from "@/lib/firestore-db";

export async function GET(): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const units = await listKnownUnits(user.id);
  return NextResponse.json({ units });
}

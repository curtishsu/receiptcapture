import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(): Promise<NextResponse> {
  const user = await requireUser();
  return NextResponse.json({ user });
}

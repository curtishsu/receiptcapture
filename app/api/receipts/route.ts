import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listReceipts } from "@/lib/firestore-db";

export async function GET(): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const receipts = await listReceipts(user.id);
  return NextResponse.json({ receipts });
}

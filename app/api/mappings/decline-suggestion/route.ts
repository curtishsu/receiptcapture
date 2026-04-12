import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { declineItemSuggestion } from "@/lib/firestore-db";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { receipt_item_id?: string };
  const receiptItemId = body.receipt_item_id?.trim() || "";
  if (!receiptItemId) {
    return NextResponse.json({ error: "receipt_item_id is required." }, { status: 400 });
  }

  const declined = await declineItemSuggestion(user.id, receiptItemId);
  if (!declined) {
    return NextResponse.json({ error: "Suggestion could not be declined." }, { status: 404 });
  }

  return NextResponse.json({ declined: true });
}

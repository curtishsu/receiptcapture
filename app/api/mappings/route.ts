import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listItemMappings, updateItemMappings } from "@/lib/firestore-db";
import { safeNumber, toTitleCaseText } from "@/lib/normalize";
import type { UpdateMappingsPayload } from "@/lib/types";

export async function GET(): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mappings = await listItemMappings(user.id);
  return NextResponse.json({ mappings });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<UpdateMappingsPayload>;
  const updates = (body.updates ?? []).map((mapping) => ({
    id: mapping.id?.trim() || undefined,
    store_name: mapping.store_name?.trim() || "",
    receipt_item_name: mapping.receipt_item_name?.trim() || "",
    item_name: toTitleCaseText(mapping.item_name) ?? "",
    amount: safeNumber(mapping.amount),
    unit: mapping.unit?.trim() || null,
    item_type: toTitleCaseText(mapping.item_type),
    item_category: toTitleCaseText(mapping.item_category)
  }));
  const invalidUpdate = updates.find((mapping) => !mapping.store_name || !mapping.receipt_item_name || !mapping.item_name);
  if (invalidUpdate) {
    return NextResponse.json({ error: "Store, receipt item name, and item name are required." }, { status: 400 });
  }

  const mappings = await updateItemMappings(user.id, updates, (body.delete_ids ?? []).filter(Boolean));
  return NextResponse.json({ mappings });
}

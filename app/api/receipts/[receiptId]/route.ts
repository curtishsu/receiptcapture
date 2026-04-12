import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteReceipt, getReceiptDetail, updateReceipt } from "@/lib/firestore-db";
import { safeNumber, toTitleCaseText } from "@/lib/normalize";
import type { ReceiptItemInput, SaveReceiptPayload } from "@/lib/types";

function sanitizeItems(items: ReceiptItemInput[]): ReceiptItemInput[] {
  return items
    .filter((item) => item.receipt_item_name?.trim() || item.item_name?.trim())
    .map((item) => ({
      receipt_item_name: item.receipt_item_name?.trim() || item.item_name?.trim() || "UNKNOWN ITEM",
      item_name: toTitleCaseText(item.item_name) ?? (item.receipt_item_name?.trim() || "Unknown item"),
      amount: safeNumber(item.amount),
      unit: item.unit?.trim() || null,
      quantity: safeNumber(item.quantity),
      price: safeNumber(item.price),
      price_per_unit: safeNumber(item.price_per_unit),
      is_excluded: Boolean(item.is_excluded),
      item_type: toTitleCaseText(item.item_type),
      item_category: toTitleCaseText(item.item_category),
      llm_item_name: toTitleCaseText(item.llm_item_name),
      llm_item_type: toTitleCaseText(item.llm_item_type),
      llm_item_category: toTitleCaseText(item.llm_item_category),
      prefill_source: item.prefill_source,
      has_mapping_mismatch: Boolean(item.has_mapping_mismatch)
    }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> }
): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { receiptId } = await params;
  const detail = await getReceiptDetail(user.id, receiptId);
  if (!detail) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ receiptId: string }> }
): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { receiptId } = await params;
  const body = (await request.json()) as SaveReceiptPayload;
  const payload: SaveReceiptPayload = {
    store_name: body.store_name?.trim() || "",
    purchase_date: body.purchase_date?.trim() || "",
    receipt_total: safeNumber(body.receipt_total),
    receipt_tax: safeNumber(body.receipt_tax),
    items: sanitizeItems(body.items ?? []),
    llm_items: sanitizeItems(body.llm_items ?? [])
  };

  if (!payload.store_name) {
    return NextResponse.json({ error: "Store name is required." }, { status: 400 });
  }

  if (payload.items.length === 0) {
    return NextResponse.json({ error: "At least one receipt item is required." }, { status: 400 });
  }

  const detail = await updateReceipt(user.id, receiptId, payload);
  if (!detail) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> }
): Promise<NextResponse> {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { receiptId } = await params;
  const deleted = await deleteReceipt(user.id, receiptId);
  if (!deleted) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}

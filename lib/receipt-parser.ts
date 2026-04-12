import { getItemMapping, getItemStorePriceMemory } from "@/lib/firestore-db";
import type { ParsedReceipt, ReceiptItemInput } from "@/lib/types";
import { normalizeItemName, normalizeKeyPart, toTitleCaseText } from "@/lib/normalize";

type ClaudeCandidate = {
  store_name?: string;
  purchase_date?: string;
  receipt_total?: number | null;
  receipt_tax?: number | null;
  items?: Array<{
    receipt_item_name?: string;
    amount?: number | null;
    unit?: string | null;
    quantity?: number | null;
    price?: number | null;
    item_name?: string;
    item_type?: string | null;
    item_category?: string | null;
  }>;
};

type ClaudeMessageResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    type?: string;
    message?: string;
  };
};

type ClaudeItemCandidate = NonNullable<ClaudeCandidate["items"]>[number];

const CATEGORY_GUIDANCE = [
  "Vegetables",
  "Fruit",
  "Grains/Starches",
  "Proteins",
  "Dairy",
  "Other Fats",
  "Nuts and Seeds",
  "Baking",
  "Beverages",
  "Snack Foods",
  "Misc"
].join(", ");

const SAMPLE_RECEIPT: ParsedReceipt = {
  store_name: "Trader Joe's",
  purchase_date: "",
  receipt_total: 31.14,
  receipt_tax: null,
  parse_warning: "Using local fallback parser. Add ANTHROPIC_API_KEY or CLAUDE_API_KEY to enable live receipt parsing.",
  items: [
    {
      receipt_item_name: "PINEAPPLE TIDBITS",
      item_name: "Pineapple Tidbits",
      amount: null,
      unit: null,
      quantity: 1,
      price: 2.49,
      item_type: "Pineapple",
      item_category: "Fruit",
      is_excluded: false,
      llm_item_name: "Pineapple Tidbits",
      llm_item_type: "Pineapple",
      llm_item_category: "Fruit",
      prefill_source: "claude",
      has_mapping_mismatch: false
    },
    {
      receipt_item_name: "BABY SPINACH 12 OZ",
      item_name: "Baby spinach",
      amount: 12,
      unit: "oz",
      quantity: 1,
      price: 2.99,
      item_type: "Spinach",
      item_category: "Vegetables",
      is_excluded: false,
      llm_item_name: "Baby spinach",
      llm_item_type: "Spinach",
      llm_item_category: "Vegetables",
      prefill_source: "claude",
      has_mapping_mismatch: false
    },
    {
      receipt_item_name: "GREEN BELL PEPPER",
      item_name: "Green bell pepper",
      amount: null,
      unit: null,
      quantity: 2,
      price: 1.98,
      item_type: "Bell pepper",
      item_category: "Vegetables",
      is_excluded: false,
      llm_item_name: "Green bell pepper",
      llm_item_type: "Bell pepper",
      llm_item_category: "Vegetables",
      prefill_source: "claude",
      has_mapping_mismatch: false
    }
  ]
};

function sanitizeCategory(value: string | null | undefined): string | null {
  return toTitleCaseText(value);
}

function hasComparableCategoryMismatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeKeyPart(left);
  const normalizedRight = normalizeKeyPart(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft !== normalizedRight);
}

function cleanItem(item: ClaudeItemCandidate): ReceiptItemInput {
  const receiptItemName = item.receipt_item_name?.trim() || "UNKNOWN ITEM";
  const llmItemName = toTitleCaseText(item.item_name) ?? receiptItemName;
  const llmItemType = sanitizeCategory(item.item_type);
  const llmItemCategory = sanitizeCategory(item.item_category);

  return {
    receipt_item_name: receiptItemName,
    item_name: llmItemName,
    amount: item.amount ?? null,
    unit: item.unit?.trim() || null,
    quantity: item.quantity ?? null,
    price: item.price ?? null,
    item_type: llmItemType,
    item_category: llmItemCategory,
    is_excluded: false,
    is_per_pound: false,
    llm_item_name: llmItemName,
    llm_item_type: llmItemType,
    llm_item_category: llmItemCategory,
    prefill_source: "claude",
    has_mapping_mismatch: false
  };
}

function extractClaudeText(data: ClaudeMessageResponse): string {
  const text = data.content?.find((part) => part.type === "text" && part.text)?.text?.trim();
  if (!text) {
    throw new Error("Claude returned no structured content");
  }

  return text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
}

async function parseWithClaude(dataUrl: string, uploadDate: string): Promise<ParsedReceipt | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const [, mimeType, base64] = match;
  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514";
  const prompt = [
    "Your job is to parse a grocery receipt and return JSON only.",
    "Return store_name, purchase_date (YYYY-MM-DD or empty string), receipt_total (number or null), receipt_tax (number or null), and items.",
    `If the purchase date is missing, use ${uploadDate}.`,
    "For each item, return receipt_item_name, amount, unit, quantity, price, item_name, item_type, and item_category.",
    "receipt_item_name must be the exact receipt line item text.",
    "item_name must be the canonical exact item bought.",
    "Keep meaningful modifiers in item_name when they change product identity, such as organic, baby, shredded, low fat, greek, strawberry, grape, or heirloom.",
    "Remove package size, weight, pack count, receipt prefixes, store formatting noise, and packaging-only text from item_name.",
    "item_type must be broader than item_name while still being specific to the food.",
    `item_category must be one of: ${CATEGORY_GUIDANCE}.`,
    "Examples: GREENS KALE 10 OZ -> item_name Kale, item_type Leafy Greens, item_category Vegetables.",
    "A-TOMATOES GRAPE MINI PE -> item_name Grape Tomatoes, item_type Tomatoes, item_category Vegetables.",
    "CARROTS SHREDDED 10 OZ -> item_name Shredded Carrots, item_type Carrots, item_category Vegetables.",
    "R-SALAD SPINACH BABY 12 -> item_name Baby Spinach, item_type Spinach, item_category Vegetables.",
    "Do not include tax, subtotal, discounts, payment, loyalty, and other non-item lines as items.",
    "If the receipt shows tax separately, return it in receipt_tax.",
    "If a line or sub-line indicates quantity such as 'quantity 2', reflect that in quantity.",
    "If amount, unit, quantity, or price are unclear, return null for that field."
  ].join(" ");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: "You extract grocery receipt data and return valid JSON only.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64
              }
            },
            {
              type: "text",
              text: prompt
            }
          ]
        }
      ]
    })
  });

  const data = (await response.json()) as ClaudeMessageResponse;
  if (!response.ok) {
    const details = data.error?.message?.trim();
    throw new Error(details ? `Claude parse failed: ${details}` : `Claude parse failed with status ${response.status}`);
  }

  const parsed = JSON.parse(extractClaudeText(data)) as ClaudeCandidate;
  return {
    store_name: parsed.store_name?.trim() || "",
    purchase_date: parsed.purchase_date?.trim() || "",
    receipt_total: typeof parsed.receipt_total === "number" ? parsed.receipt_total : null,
    receipt_tax: typeof parsed.receipt_tax === "number" ? parsed.receipt_tax : null,
    items: (parsed.items ?? []).map(cleanItem)
  };
}

function hasMismatch(
  canonicalName: string,
  canonicalUnit: string | null,
  canonicalType: string | null,
  canonicalCategory: string | null,
  item: ReceiptItemInput
): boolean {
  return (
    normalizeItemName(canonicalName) !== normalizeItemName(item.llm_item_name ?? item.item_name) ||
    normalizeKeyPart(canonicalUnit) !== normalizeKeyPart(item.unit) ||
    hasComparableCategoryMismatch(canonicalType, item.llm_item_type ?? item.item_type) ||
    hasComparableCategoryMismatch(canonicalCategory, item.llm_item_category ?? item.item_category)
  );
}

function roundToHundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

function applyDefaultEachMeasure(item: ReceiptItemInput): ReceiptItemInput {
  if (item.unit?.trim()) {
    return item;
  }

  return {
    ...item,
    amount: item.amount ?? 1,
    unit: "each",
    quantity: item.quantity ?? 1
  };
}

function applyPerPoundMemory(item: ReceiptItemInput, pricePerUnit: number | null | undefined): ReceiptItemInput {
  const nextPricePerUnit = typeof pricePerUnit === "number" && Number.isFinite(pricePerUnit) && pricePerUnit > 0 ? pricePerUnit : null;
  if (!nextPricePerUnit) {
    return item;
  }

  return {
    ...item,
    amount: typeof item.price === "number" && item.price > 0 ? roundToHundredths(item.price / nextPricePerUnit) : null,
    unit: "lb",
    quantity: 1,
    price_per_unit: nextPricePerUnit,
    is_per_pound: true
  };
}

async function applyBackfill(userId: string, receipt: ParsedReceipt): Promise<ParsedReceipt> {
  const items = await Promise.all(
    receipt.items.map(async (item) => {
      const mapping = await getItemMapping(userId, receipt.store_name, item.receipt_item_name);
      const baseItem = !mapping
        ? {
          ...item,
          item_name: toTitleCaseText(item.llm_item_name ?? item.item_name) ?? item.receipt_item_name,
          amount: item.amount,
          unit: item.unit,
          item_type: item.llm_item_type ?? item.item_type ?? null,
          item_category: item.llm_item_category ?? item.item_category ?? null,
          is_per_pound: false,
          prefill_source: "claude" as const,
          has_mapping_mismatch: false
        }
        : {
        ...item,
        item_name: mapping.item_name,
        amount: mapping.amount ?? item.amount,
        unit: mapping.unit ?? item.unit,
        item_type: mapping.item_type,
        item_category: mapping.item_category,
        is_per_pound: false,
          prefill_source: "mapping" as const,
          has_mapping_mismatch: hasMismatch(mapping.item_name, mapping.unit, mapping.item_type, mapping.item_category, item)
      };

      const normalizedBaseItem = applyDefaultEachMeasure(baseItem);
      if (normalizeKeyPart(normalizedBaseItem.unit) !== "LB") {
        return normalizedBaseItem;
      }

      const memory = await getItemStorePriceMemory(userId, receipt.store_name, baseItem.item_name, "lb");
      return applyPerPoundMemory(normalizedBaseItem, memory?.price_per_unit);
    })
  );

  return { ...receipt, items };
}

export async function parseReceiptFromUpload(userId: string, dataUrl: string, uploadDate: string): Promise<ParsedReceipt> {
  const parsed = (await parseWithClaude(dataUrl, uploadDate)) ?? {
    ...SAMPLE_RECEIPT,
    purchase_date: uploadDate
  };

  const normalized: ParsedReceipt = {
    ...parsed,
    store_name: normalizeKeyPart(parsed.store_name) ? parsed.store_name : "",
    purchase_date: parsed.purchase_date?.trim() || uploadDate,
    items: parsed.items.map((item) => ({
      ...applyDefaultEachMeasure(item),
      receipt_item_name: item.receipt_item_name.trim() || "UNKNOWN ITEM",
      item_name: toTitleCaseText(item.item_name) ?? (item.receipt_item_name.trim() || "Unknown item"),
      item_type: sanitizeCategory(item.item_type),
      item_category: sanitizeCategory(item.item_category),
      llm_item_name: toTitleCaseText(item.llm_item_name ?? item.item_name) ?? (item.receipt_item_name.trim() || "Unknown item"),
      llm_item_type: sanitizeCategory(item.llm_item_type ?? item.item_type),
      llm_item_category: sanitizeCategory(item.llm_item_category ?? item.item_category),
      quantity: item.quantity ?? null,
      amount: item.amount ?? null,
      price: item.price ?? null,
      price_per_unit: item.price_per_unit ?? null,
      is_per_pound: item.is_per_pound ?? false,
      prefill_source: item.prefill_source ?? "claude",
      has_mapping_mismatch: false
    }))
  };

  return applyBackfill(userId, normalized);
}

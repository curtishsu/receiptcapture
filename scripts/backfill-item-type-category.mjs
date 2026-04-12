import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getPrivateKey() {
  return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId
    });
  }

  if (projectId) {
    return initializeApp({
      credential: applicationDefault(),
      projectId
    });
  }

  throw new Error("Firebase credentials are missing.");
}

function normalizeKeyPart(value) {
  return (value ?? "")
    .toUpperCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeItemName(value) {
  return normalizeKeyPart(value);
}

function mappingDocId(userId, storeName, receiptItemName) {
  return `${userId}:${normalizeKeyPart(storeName)}:${normalizeKeyPart(receiptItemName)}`;
}

function sanitizeCategory(value) {
  return toTitleCaseText(value);
}

function toTitleCaseText(value) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return null;
  }

  return nextValue
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function hasComparableCategoryMismatch(left, right) {
  const normalizedLeft = normalizeKeyPart(left);
  const normalizedRight = normalizeKeyPart(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft !== normalizedRight);
}

function extractClaudeText(data) {
  const text = data.content?.find((part) => part.type === "text" && part.text)?.text?.trim();
  if (!text) {
    throw new Error("Claude returned no structured content");
  }

  return text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
}

async function inferMetadataForMapping(mapping) {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error("Claude API key is required for metadata backfill.");
  }

  const prompt = [
    "Infer grocery metadata and return JSON only.",
    "Return item_name, item_type, and item_category.",
    "receipt_item_name is the literal source text from the receipt.",
    "item_name must be the canonical exact item bought.",
    "Keep meaningful product modifiers in item_name when they change what the shopper bought, such as organic, baby, shredded, low fat, greek, strawberry, grape, or heirloom.",
    "Remove package size, weight, pack count, receipt prefixes, store formatting noise, and packaging-only text from item_name.",
    "item_type must be broader than item_name while still being specific to the food.",
    "item_category must be one of: Vegetables, Fruit, Grains/Starches, Proteins, Dairy, Other Fats, Nuts and Seeds, Baking, Beverages, Snack Foods, Misc.",
    "Examples:",
    "GREENS KALE 10 OZ -> item_name Kale, item_type Leafy Greens, item_category Vegetables.",
    "A-TOMATOES GRAPE MINI PE -> item_name Grape Tomatoes, item_type Tomatoes, item_category Vegetables.",
    "CARROTS SHREDDED 10 OZ -> item_name Shredded Carrots, item_type Carrots, item_category Vegetables.",
    "R-SALAD SPINACH BABY 12 -> item_name Baby Spinach, item_type Spinach, item_category Vegetables.",
    `Store: ${mapping.store_name}`,
    `Receipt item name: ${mapping.receipt_item_name}`,
    `Current item name: ${mapping.item_name}`
  ].join(" ");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: "You classify grocery receipt items into canonical item taxonomy. Return valid JSON only.",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }]
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Claude request failed with status ${response.status}`);
  }

  const parsed = JSON.parse(extractClaudeText(data));
  return {
    item_name: toTitleCaseText(parsed.item_name) ?? mapping.item_name,
    item_type: sanitizeCategory(parsed.item_type),
    item_category: sanitizeCategory(parsed.item_category)
  };
}

const app = getFirebaseApp();
const firestore = getFirestore(app);

async function seedMappingsFromReceiptItems() {
  const snapshot = await firestore.collection("receipt_items").get();
  const latestByMappingId = new Map();

  snapshot.docs.forEach((doc) => {
    const item = doc.data();
    const receiptItemName = item.receipt_item_name?.trim();
    const itemName = toTitleCaseText(item.item_name) ?? receiptItemName;
    if (!item.user_id || !item.store_name || !receiptItemName || !itemName) {
      return;
    }

    const id = mappingDocId(item.user_id, item.store_name, receiptItemName);
    const nextRecord = {
      id,
      user_id: item.user_id,
      store_name: item.store_name,
      store_name_normalized: item.store_name_normalized ?? normalizeKeyPart(item.store_name),
      receipt_item_name: receiptItemName,
      receipt_item_name_normalized: item.receipt_item_name_normalized ?? normalizeKeyPart(receiptItemName),
      item_name: itemName,
      item_name_normalized: normalizeItemName(itemName),
      amount: typeof item.amount === "number" ? item.amount : null,
      unit: item.unit?.trim() || null,
      item_type: sanitizeCategory(item.item_type),
      item_category: sanitizeCategory(item.item_category),
      created_at: item.created_at ?? new Date().toISOString(),
      updated_at: item.updated_at ?? new Date().toISOString()
    };

    const current = latestByMappingId.get(id);
    if (!current || (nextRecord.updated_at ?? "") >= (current.updated_at ?? "")) {
      latestByMappingId.set(id, nextRecord);
    }
  });

  if (latestByMappingId.size === 0) {
    return 0;
  }

  const batch = firestore.batch();
  latestByMappingId.forEach((mapping, id) => {
    batch.set(firestore.collection("item_mappings").doc(id), mapping, { merge: true });
  });
  await batch.commit();
  return latestByMappingId.size;
}

async function propagateToReceiptItems(mapping) {
  const items = await firestore.collection("receipt_items").where("user_id", "==", mapping.user_id).get();
  const batch = firestore.batch();

  items.docs.forEach((doc) => {
    const item = doc.data();
    if (
      item.store_name_normalized !== mapping.store_name_normalized ||
      item.receipt_item_name_normalized !== mapping.receipt_item_name_normalized
    ) {
      return;
    }

    const llmItemName = item.llm_item_name ?? item.item_name;
    const llmItemType = item.llm_item_type ?? null;
    const llmItemCategory = item.llm_item_category ?? null;

    batch.update(doc.ref, {
      item_name: mapping.item_name,
      item_name_normalized: normalizeItemName(mapping.item_name),
      item_type: mapping.item_type,
      item_category: mapping.item_category,
      has_mapping_mismatch:
        normalizeItemName(mapping.item_name) !== normalizeItemName(llmItemName) ||
        hasComparableCategoryMismatch(mapping.item_type, llmItemType) ||
        hasComparableCategoryMismatch(mapping.item_category, llmItemCategory),
      updated_at: new Date().toISOString()
    });
  });

  await batch.commit();
}

async function main() {
  const seeded = await seedMappingsFromReceiptItems();
  const snapshot = await firestore.collection("item_mappings").get();
  const mappings = snapshot.docs.map((doc) => doc.data());
  const failures = [];
  let updated = 0;

  for (const mapping of mappings) {
    try {
      const inferred = await inferMetadataForMapping(mapping);
      await firestore.collection("item_mappings").doc(mapping.id).update({
        item_name: inferred.item_name,
        item_name_normalized: normalizeItemName(inferred.item_name),
        item_type: inferred.item_type,
        item_category: inferred.item_category,
        updated_at: new Date().toISOString()
      });
      await propagateToReceiptItems({
        ...mapping,
        item_name: inferred.item_name,
        item_type: inferred.item_type,
        item_category: inferred.item_category
      });
      updated += 1;
    } catch (error) {
      failures.push({
        id: mapping.id,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        seeded,
        checked: mappings.length,
        updated,
        failures
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

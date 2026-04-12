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

function toTitleCaseText(value) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return null;
  }

  return nextValue
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function sanitizeText(value, fallback = "") {
  return value?.trim() || fallback;
}

function toNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasOwnValue(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;
}

function isBlankValue(value) {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim() === "";
  }

  return false;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildReceiptItemPatch(item) {
  const receiptItemName = sanitizeText(item.receipt_item_name ?? item.raw_line_text, "UNKNOWN ITEM");
  const itemName = toTitleCaseText(item.item_name ?? item.corrected_item_name) ?? receiptItemName;
  const amount = toNumberOrNull(item.amount ?? item.corrected_quantum_of_unit ?? item.quantum_of_unit);
  const unit = sanitizeText(item.unit ?? item.corrected_unit) || null;
  const quantity = toNumberOrNull(item.quantity ?? item.corrected_quantity_purchased ?? item.quantity_purchased);
  const price = toNumberOrNull(item.price ?? item.line_price);
  const llmItemName = toTitleCaseText(item.llm_item_name ?? item.last_llm_item_name ?? item.item_name) ?? itemName;

  const patch = {};

  if (isBlankValue(item.receipt_item_name)) {
    patch.receipt_item_name = receiptItemName;
  }
  if (isBlankValue(item.receipt_item_name_normalized)) {
    patch.receipt_item_name_normalized = sanitizeText(
      item.receipt_item_name_normalized ?? item.raw_line_text_normalized,
      normalizeKeyPart(receiptItemName)
    );
  }
  if (isBlankValue(item.item_name)) {
    patch.item_name = itemName;
  }
  if (isBlankValue(item.item_name_normalized)) {
    patch.item_name_normalized = normalizeItemName(itemName);
  }
  if (amount !== null && isBlankValue(item.amount)) {
    patch.amount = amount;
  }
  if (unit && isBlankValue(item.unit)) {
    patch.unit = unit;
  }
  if (quantity !== null && isBlankValue(item.quantity)) {
    patch.quantity = quantity;
  }
  if (price !== null && isBlankValue(item.price)) {
    patch.price = price;
  }
  if (isBlankValue(item.llm_item_name)) {
    patch.llm_item_name = llmItemName;
  }
  if (!hasOwnValue(item, "llm_item_type")) {
    patch.llm_item_type = null;
  }
  if (!hasOwnValue(item, "llm_item_category")) {
    patch.llm_item_category = null;
  }
  if (!hasOwnValue(item, "has_mapping_mismatch")) {
    patch.has_mapping_mismatch = false;
  }

  return patch;
}

function buildItemMappingPatch(mapping) {
  const receiptItemName = sanitizeText(mapping.receipt_item_name ?? mapping.raw_line_text);
  const itemName = toTitleCaseText(mapping.item_name ?? mapping.corrected_item_name) ?? receiptItemName;
  const amount = toNumberOrNull(mapping.amount ?? mapping.corrected_quantum_of_unit);
  const unit = sanitizeText(mapping.unit ?? mapping.corrected_unit) || null;

  const patch = {};

  if (receiptItemName && isBlankValue(mapping.receipt_item_name)) {
    patch.receipt_item_name = receiptItemName;
  }
  if (receiptItemName && isBlankValue(mapping.receipt_item_name_normalized)) {
    patch.receipt_item_name_normalized = sanitizeText(
      mapping.receipt_item_name_normalized ?? mapping.raw_line_text_normalized,
      normalizeKeyPart(receiptItemName)
    );
  }
  if (itemName && isBlankValue(mapping.item_name)) {
    patch.item_name = itemName;
  }
  if (itemName && isBlankValue(mapping.item_name_normalized)) {
    patch.item_name_normalized = normalizeItemName(itemName);
  }
  if (amount !== null && isBlankValue(mapping.amount)) {
    patch.amount = amount;
  }
  if (unit && isBlankValue(mapping.unit)) {
    patch.unit = unit;
  }

  return patch;
}

async function applyPatches(collectionName, docsWithPatches, write) {
  if (!write || docsWithPatches.length === 0) {
    return;
  }

  for (const batchDocs of chunk(docsWithPatches, 400)) {
    const batch = firestore.batch();
    batchDocs.forEach(({ ref, patch }) => {
      batch.set(ref, patch, { merge: true });
    });
    await batch.commit();
  }
}

const shouldWrite = process.argv.includes("--write");
const app = getFirebaseApp();
const firestore = getFirestore(app);

async function main() {
  const receiptItemSnapshot = await firestore.collection("receipt_items").get();
  const receiptItemPatches = receiptItemSnapshot.docs
    .map((doc) => ({ ref: doc.ref, patch: buildReceiptItemPatch(doc.data()) }))
    .filter(({ patch }) => Object.keys(patch).length > 0);

  const itemMappingSnapshot = await firestore.collection("item_mappings").get();
  const itemMappingPatches = itemMappingSnapshot.docs
    .map((doc) => ({ ref: doc.ref, patch: buildItemMappingPatch(doc.data()) }))
    .filter(({ patch }) => Object.keys(patch).length > 0);

  await applyPatches("receipt_items", receiptItemPatches, shouldWrite);
  await applyPatches("item_mappings", itemMappingPatches, shouldWrite);

  console.log(
    JSON.stringify(
      {
        mode: shouldWrite ? "write" : "dry-run",
        receipt_items: {
          checked: receiptItemSnapshot.size,
          to_update: receiptItemPatches.length
        },
        item_mappings: {
          checked: itemMappingSnapshot.size,
          to_update: itemMappingPatches.length
        }
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

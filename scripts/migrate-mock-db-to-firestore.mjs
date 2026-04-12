import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "mock-db.json");

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

function mappingId(userId, storeName, receiptItemName) {
  return `${userId}:${normalizeKeyPart(storeName)}:${normalizeKeyPart(receiptItemName)}`;
}

const app = getFirebaseApp();
const firestore = getFirestore(app);

async function main() {
  const raw = await readFile(DB_PATH, "utf8");
  const db = JSON.parse(raw);

  const userMappings = new Map();

  for (const user of db.users ?? []) {
    await firestore.collection("users").doc(user.id).set(user);
  }

  for (const session of db.sessions ?? []) {
    await firestore.collection("sessions").doc(session.token).set(session);
  }

  for (const receipt of db.receipts ?? []) {
    await firestore.collection("receipts").doc(receipt.id).set(receipt);
  }

  for (const item of db.receipt_items ?? []) {
    const receiptItemName = item.raw_line_text ?? item.item_name ?? "UNKNOWN ITEM";
    const canonicalName = item.item_name_normalized ?? item.item_name ?? receiptItemName;

    const nextItem = {
      id: item.id,
      user_id: item.user_id,
      receipt_id: item.receipt_id,
      purchase_date: item.purchase_date,
      store_name: item.store_name,
      store_name_normalized: item.store_name_normalized ?? normalizeKeyPart(item.store_name),
      receipt_item_name: receiptItemName,
      receipt_item_name_normalized: item.raw_line_text_normalized ?? normalizeKeyPart(receiptItemName),
      item_name: canonicalName,
      item_name_normalized: normalizeItemName(canonicalName),
      amount: item.quantum_of_unit ?? null,
      unit: item.unit ?? null,
      quantity: item.quantity_purchased ?? null,
      price: item.line_price ?? null,
      item_type: null,
      item_category: null,
      llm_item_name: item.item_name ?? receiptItemName,
      llm_item_type: null,
      llm_item_category: null,
      has_mapping_mismatch: false,
      created_at: item.created_at,
      updated_at: item.updated_at
    };

    await firestore.collection("receipt_items").doc(nextItem.id).set(nextItem);

    const nextMappingId = mappingId(item.user_id, item.store_name, receiptItemName);
    if (!userMappings.has(nextMappingId)) {
      userMappings.set(nextMappingId, {
        id: nextMappingId,
        user_id: item.user_id,
        store_name: item.store_name,
        store_name_normalized: item.store_name_normalized ?? normalizeKeyPart(item.store_name),
        receipt_item_name: receiptItemName,
        receipt_item_name_normalized: item.raw_line_text_normalized ?? normalizeKeyPart(receiptItemName),
        item_name: canonicalName,
        item_name_normalized: normalizeItemName(canonicalName),
        item_type: null,
        item_category: null,
        created_at: item.created_at,
        updated_at: item.updated_at
      });
    }
  }

  for (const mapping of userMappings.values()) {
    await firestore.collection("item_mappings").doc(mapping.id).set(mapping);
  }

  const unitMap = new Map();
  for (const item of db.receipt_items ?? []) {
    const unit = item.unit?.trim();
    if (!unit) {
      continue;
    }

    const key = `${item.user_id}:${normalizeKeyPart(unit)}`;
    if (unitMap.has(key)) {
      continue;
    }

    unitMap.set(key, {
      id: key,
      user_id: item.user_id,
      unit,
      unit_normalized: normalizeKeyPart(unit),
      created_at: item.created_at,
      updated_at: item.updated_at
    });
  }

  for (const unit of unitMap.values()) {
    await firestore.collection("user_units").doc(unit.id).set(unit);
  }

  for (const memory of db.item_store_price_memory ?? []) {
    await firestore.collection("item_store_price_memory").doc(memory.id).set({
      ...memory,
      last_price: memory.last_line_price ?? memory.last_price ?? null
    });
  }

  console.log(
    JSON.stringify(
      {
        users: (db.users ?? []).length,
        sessions: (db.sessions ?? []).length,
        receipts: (db.receipts ?? []).length,
        receipt_items: (db.receipt_items ?? []).length,
        item_mappings: userMappings.size,
        user_units: unitMap.size
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

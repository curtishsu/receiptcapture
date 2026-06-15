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

function isBlankValue(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildReceiptItemPatch(item) {
  const patch = {};

  if (isBlankValue(item.amount)) {
    patch.amount = 1;
  }

  if (isBlankValue(item.quantity)) {
    patch.quantity = 1;
  }

  return patch;
}

function buildItemMappingPatch(mapping) {
  const patch = {};

  if (isBlankValue(mapping.amount)) {
    patch.amount = 1;
  }

  return patch;
}

async function applyPatches(firestore, docsWithPatches, write) {
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

  await applyPatches(firestore, receiptItemPatches, shouldWrite);
  await applyPatches(firestore, itemMappingPatches, shouldWrite);

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

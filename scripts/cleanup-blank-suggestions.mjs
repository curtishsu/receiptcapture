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

function hasComparableCategoryMismatch(left, right) {
  const normalizedLeft = normalizeKeyPart(left);
  const normalizedRight = normalizeKeyPart(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft !== normalizedRight);
}

function stillHasSuggestion(item) {
  const canonicalName = item.item_name ?? item.receipt_item_name ?? "";
  const llmName = item.llm_item_name ?? canonicalName;

  return (
    normalizeItemName(canonicalName) !== normalizeItemName(llmName) ||
    hasComparableCategoryMismatch(item.item_type, item.llm_item_type) ||
    hasComparableCategoryMismatch(item.item_category, item.llm_item_category)
  );
}

async function main() {
  const firestore = getFirestore(getFirebaseApp());
  const snapshot = await firestore.collection("receipt_items").where("has_mapping_mismatch", "==", true).get();

  let checked = 0;
  let kept = 0;
  let cleared = 0;
  let blankDriven = 0;
  const batch = firestore.batch();

  snapshot.docs.forEach((doc) => {
    checked += 1;
    const item = doc.data();
    const remainsMismatch = stillHasSuggestion(item);

    if (remainsMismatch) {
      kept += 1;
      return;
    }

    const llmTypeBlank = !normalizeKeyPart(item.llm_item_type);
    const llmCategoryBlank = !normalizeKeyPart(item.llm_item_category);
    if (llmTypeBlank || llmCategoryBlank) {
      blankDriven += 1;
    }

    batch.update(doc.ref, {
      has_mapping_mismatch: false,
      updated_at: new Date().toISOString()
    });
    cleared += 1;
  });

  if (cleared > 0) {
    await batch.commit();
  }

  console.log(
    JSON.stringify(
      {
        checked,
        kept,
        cleared,
        blank_driven_cleared: blankDriven
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

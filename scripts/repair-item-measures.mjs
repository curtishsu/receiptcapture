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

function sanitizeText(value, fallback = "") {
  return value?.trim() || fallback;
}

function toNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isBlank(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function chunk(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function singularizeUnit(unit) {
  const normalized = normalizeKeyPart(unit);
  const map = {
    CANS: "can",
    CAN: "can",
    BOTTLES: "bottle",
    BOTTLE: "bottle",
    JARS: "jar",
    JAR: "jar",
    BARS: "bar",
    BAR: "bar",
    PACKS: "pack",
    PACK: "pack",
    PK: "pack",
    PKG: "pack",
    BAGS: "bag",
    BAG: "bag",
    BOXES: "box",
    BOX: "box",
    EACH: "each",
    EA: "each",
    DOZEN: "dozen",
    COUNT: "count",
    CT: "count",
    OZ: "oz",
    LB: "lb",
    LBS: "lb",
    GALLON: "gallon",
    GALLONS: "gallon",
    GAL: "gallon",
    QUART: "quart",
    QUARTS: "quart",
    QT: "quart"
  };

  return map[normalized] ?? unit.toLowerCase();
}

function parseMeasureFromName(name) {
  const raw = sanitizeText(name);
  const normalized = normalizeKeyPart(raw);
  if (!normalized) {
    return null;
  }

  const compact = normalized.replace(/\s+/g, " ");
  const decimalCompact = compact.replace(/(\d)\s+(\d)\s+(LB|OZ)\b/g, "$1.$2 $3");

  let match = decimalCompact.match(/\b(\d+(?:\.\d+)?)\s*(OZ|LB|LBS|GALLON|GALLONS|GAL|QUART|QUARTS|QT|DOZEN|COUNT|CT)\b/);
  if (match) {
    const amount = Number(match[1]);
    const unit = singularizeUnit(match[2]);
    return { amount, unit, quantity: 1, source: "rule" };
  }

  match = decimalCompact.match(/\b(\d+(?:\.\d+)?)(OZ|LB|LBS|CT)\b/);
  if (match) {
    const amount = Number(match[1]);
    const unit = singularizeUnit(match[2]);
    return { amount, unit, quantity: 1, source: "rule" };
  }

  if (/\bHALF GALLON\b/.test(decimalCompact)) {
    return { amount: 0.5, unit: "gallon", quantity: 1, source: "rule" };
  }

  if (/\bQUART\b/.test(decimalCompact)) {
    return { amount: 1, unit: "quart", quantity: 1, source: "rule" };
  }

  if (/\bDOZEN\b/.test(decimalCompact)) {
    return { amount: 1, unit: "dozen", quantity: 1, source: "rule" };
  }

  match = decimalCompact.match(/\b(\d+)\s*(CANS?|BOTTLES?|JARS?|BARS?|PACKS?|PK|PKG|BAGS?|BOXES?)\b/);
  if (match) {
    return { amount: 1, unit: singularizeUnit(match[2]), quantity: Number(match[1]), source: "rule" };
  }

  if (/\bEACH\b/.test(decimalCompact)) {
    return { amount: 1, unit: "each", quantity: 1, source: "rule" };
  }

  if (/\bCAN\b/.test(decimalCompact)) {
    return { amount: 1, unit: "can", quantity: 1, source: "rule" };
  }

  return null;
}

function getInferenceKey(storeName, receiptItemName) {
  return `${normalizeKeyPart(storeName)}|${normalizeKeyPart(receiptItemName)}`;
}

function getGlobalInferenceKey(receiptItemName) {
  return normalizeKeyPart(receiptItemName);
}

function serializeCandidate(candidate) {
  return JSON.stringify({
    amount: candidate.amount ?? null,
    unit: candidate.unit ?? null,
    quantity: candidate.quantity ?? null
  });
}

function addCandidate(map, key, candidate) {
  if (!key) {
    return;
  }

  const serialized = serializeCandidate(candidate);
  const current = map.get(key) ?? new Map();
  const existing = current.get(serialized) ?? { ...candidate, count: 0 };
  existing.count += 1;
  current.set(serialized, existing);
  map.set(key, current);
}

function pickCandidate(map, key) {
  const entries = map.get(key);
  if (!entries || entries.size === 0) {
    return null;
  }

  return [...entries.values()].sort((left, right) => {
    const countDelta = right.count - left.count;
    if (countDelta !== 0) {
      return countDelta;
    }

    const leftFilled = Number(left.amount !== null) + Number(Boolean(left.unit)) + Number(left.quantity !== null);
    const rightFilled = Number(right.amount !== null) + Number(Boolean(right.unit)) + Number(right.quantity !== null);
    return rightFilled - leftFilled;
  })[0] ?? null;
}

async function inferWithClaude(receiptItemName) {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const prompt = [
    "Infer grocery purchase size from a receipt line item and return JSON only.",
    "Return amount, unit, and quantity.",
    "Use quantity for repeated packages, such as 2 cans -> amount 1, unit can, quantity 2.",
    "Use amount for package size, such as 10 OZ -> amount 10, unit oz, quantity 1.",
    "If a line says EACH, return amount 1, unit each, quantity 1 unless another count is explicit.",
    "If size is unclear, return null for amount and unit. Quantity should be 1 unless an explicit count is present.",
    "Examples:",
    'GREENS KALE 10 OZ -> {"amount":10,"unit":"oz","quantity":1}',
    'CHICKPEAS GARBANZO 2 CANS -> {"amount":1,"unit":"can","quantity":2}',
    'BANANA EACH -> {"amount":1,"unit":"each","quantity":1}',
    'UNBLEACHED ALL PURPOSE F -> {"amount":null,"unit":null,"quantity":1}',
    `Receipt item name: ${receiptItemName}`
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
      max_tokens: 256,
      system: "You infer grocery receipt quantity and unit fields. Return valid JSON only.",
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

  const text = data.content?.find((part) => part.type === "text" && part.text)?.text?.trim();
  if (!text) {
    throw new Error("Claude returned no structured content");
  }

  const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
  return {
    amount: toNumberOrNull(parsed.amount),
    unit: sanitizeText(parsed.unit) || null,
    quantity: toNumberOrNull(parsed.quantity) ?? 1,
    source: "llm"
  };
}

function buildPatch(current, inferred) {
  const patch = {};

  if (isBlank(current.amount) && inferred.amount !== null) {
    patch.amount = inferred.amount;
  }
  if (isBlank(current.unit) && inferred.unit) {
    patch.unit = inferred.unit;
  }
  if (isBlank(current.quantity) && inferred.quantity !== null) {
    patch.quantity = inferred.quantity;
  }

  return patch;
}

async function main() {
  const shouldWrite = process.argv.includes("--write");
  const useLlm = process.argv.includes("--use-llm");
  const app = getFirebaseApp();
  const firestore = getFirestore(app);

  const itemSnapshot = await firestore.collection("receipt_items").get();
  const mappingSnapshot = await firestore.collection("item_mappings").get();

  const byStoreAndName = new Map();
  const byName = new Map();

  itemSnapshot.docs.forEach((doc) => {
    const item = doc.data();
    const receiptItemName = sanitizeText(item.receipt_item_name ?? item.raw_line_text);
    const amount = toNumberOrNull(item.amount);
    const unit = sanitizeText(item.unit) || null;
    const quantity = toNumberOrNull(item.quantity);
    if (!receiptItemName || (amount === null && !unit)) {
      return;
    }

    const candidate = { amount, unit, quantity };
    addCandidate(byStoreAndName, getInferenceKey(item.store_name, receiptItemName), candidate);
    addCandidate(byName, getGlobalInferenceKey(receiptItemName), candidate);
  });

  mappingSnapshot.docs.forEach((doc) => {
    const mapping = doc.data();
    const receiptItemName = sanitizeText(mapping.receipt_item_name ?? mapping.raw_line_text);
    const amount = toNumberOrNull(mapping.amount);
    const unit = sanitizeText(mapping.unit) || null;
    if (!receiptItemName || (amount === null && !unit)) {
      return;
    }

    const candidate = { amount, unit, quantity: 1 };
    addCandidate(byStoreAndName, getInferenceKey(mapping.store_name, receiptItemName), candidate);
    addCandidate(byName, getGlobalInferenceKey(receiptItemName), candidate);
  });

  const llmCache = new Map();
  const receiptItemUpdates = [];
  const itemMappingUpdates = [];
  const stats = {
    receipt_items_checked: itemSnapshot.size,
    receipt_items_updated: 0,
    item_mappings_checked: mappingSnapshot.size,
    item_mappings_updated: 0,
    reused_exact_match: 0,
    reused_global_match: 0,
    parsed_by_rule: 0,
    parsed_by_llm: 0,
    unresolved: 0
  };

  for (const doc of itemSnapshot.docs) {
    const item = doc.data();
    const receiptItemName = sanitizeText(item.receipt_item_name ?? item.raw_line_text);
    if (!receiptItemName) {
      continue;
    }

    const exact = pickCandidate(byStoreAndName, getInferenceKey(item.store_name, receiptItemName));
    const global = exact ? null : pickCandidate(byName, getGlobalInferenceKey(receiptItemName));
    const parsed = exact || global || parseMeasureFromName(receiptItemName);
    let inferred = parsed;

    if (!inferred && useLlm) {
      const llmKey = getGlobalInferenceKey(receiptItemName);
      if (!llmCache.has(llmKey)) {
        llmCache.set(llmKey, await inferWithClaude(receiptItemName));
      }
      inferred = llmCache.get(llmKey);
    }

    if (!inferred) {
      if (isBlank(item.amount) || isBlank(item.unit) || isBlank(item.quantity)) {
        stats.unresolved += 1;
      }
      continue;
    }

    const patch = buildPatch(item, inferred);
    if (Object.keys(patch).length === 0) {
      continue;
    }

    if (exact) {
      stats.reused_exact_match += 1;
    } else if (global) {
      stats.reused_global_match += 1;
    } else if (inferred.source === "llm") {
      stats.parsed_by_llm += 1;
    } else {
      stats.parsed_by_rule += 1;
    }

    receiptItemUpdates.push({ ref: doc.ref, patch, userId: item.user_id, unit: patch.unit ?? null });
  }

  for (const doc of mappingSnapshot.docs) {
    const mapping = doc.data();
    const receiptItemName = sanitizeText(mapping.receipt_item_name ?? mapping.raw_line_text);
    if (!receiptItemName) {
      continue;
    }

    const exact = pickCandidate(byStoreAndName, getInferenceKey(mapping.store_name, receiptItemName));
    const global = exact ? null : pickCandidate(byName, getGlobalInferenceKey(receiptItemName));
    const parsed = exact || global || parseMeasureFromName(receiptItemName);
    let inferred = parsed;

    if (!inferred && useLlm) {
      const llmKey = getGlobalInferenceKey(receiptItemName);
      if (!llmCache.has(llmKey)) {
        llmCache.set(llmKey, await inferWithClaude(receiptItemName));
      }
      inferred = llmCache.get(llmKey);
    }

    if (!inferred) {
      continue;
    }

    const patch = {};
    if (isBlank(mapping.amount) && inferred.amount !== null) {
      patch.amount = inferred.amount;
    }
    if (isBlank(mapping.unit) && inferred.unit) {
      patch.unit = inferred.unit;
    }

    if (Object.keys(patch).length === 0) {
      continue;
    }

    itemMappingUpdates.push({ ref: doc.ref, patch });
  }

  if (shouldWrite) {
    for (const batchDocs of chunk(receiptItemUpdates, 400)) {
      const batch = firestore.batch();
      batchDocs.forEach(({ ref, patch }) => batch.set(ref, patch, { merge: true }));
      await batch.commit();
    }

    for (const batchDocs of chunk(itemMappingUpdates, 400)) {
      const batch = firestore.batch();
      batchDocs.forEach(({ ref, patch }) => batch.set(ref, patch, { merge: true }));
      await batch.commit();
    }

    const userUnits = new Map();
    receiptItemUpdates.forEach(({ userId, unit }) => {
      const nextUnit = sanitizeText(unit);
      if (!userId || !nextUnit) {
        return;
      }

      const id = `${userId}:${normalizeKeyPart(nextUnit)}`;
      userUnits.set(id, {
        id,
        user_id: userId,
        unit: nextUnit,
        unit_normalized: normalizeKeyPart(nextUnit),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    });

    for (const unit of userUnits.values()) {
      await firestore.collection("user_units").doc(unit.id).set(unit, { merge: true });
    }
  }

  stats.receipt_items_updated = receiptItemUpdates.length;
  stats.item_mappings_updated = itemMappingUpdates.length;

  console.log(
    JSON.stringify(
      {
        mode: shouldWrite ? "write" : "dry-run",
        use_llm: useLlm,
        stats
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

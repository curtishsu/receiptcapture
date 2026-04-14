import type {
  ItemMappingRecord,
  ItemStorePriceMemoryRecord,
  ReceiptItemInput,
  ReceiptItemRecord,
  ReceiptRecord,
  SaveReceiptPayload,
  SessionRecord,
  StatsDateBucket,
  StatsMetric,
  StatsSubjectKind,
  StatsSubjectOption,
  StatsResponse,
  UserRecord
} from "@/lib/types";
import { createId } from "@/lib/ids";
import { firestore } from "@/lib/firebase-admin";
import { normalizeItemName, normalizeKeyPart, toTitleCaseText } from "@/lib/normalize";

const COLLECTIONS = {
  users: "users",
  sessions: "sessions",
  receipts: "receipts",
  receiptItems: "receipt_items",
  itemMappings: "item_mappings",
  itemStorePriceMemory: "item_store_price_memory"
} as const;

function isoNow(): string {
  return new Date().toISOString();
}

function toNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeText(value: string | null | undefined, fallback = ""): string {
  return value?.trim() || fallback;
}

function isExcludedItem(item: Pick<ReceiptItemInput, "is_excluded"> | Pick<ReceiptItemRecord, "is_excluded">): boolean {
  return Boolean(item.is_excluded);
}

function computeExcludedTotal(items: ReceiptItemInput[]): number {
  return Number(
    items.reduce((total, item) => total + (isExcludedItem(item) ? toNumberOrNull(item.price) ?? 0 : 0), 0).toFixed(2)
  );
}

function compareDatesDesc(aDate: string, bDate: string, aUpdated: string, bUpdated: string): number {
  return bDate.localeCompare(aDate) || bUpdated.localeCompare(aUpdated);
}

function mappingDocId(userId: string, storeName: string, receiptItemName: string): string {
  return `${userId}:${normalizeKeyPart(storeName)}:${normalizeKeyPart(receiptItemName)}`;
}

function itemStorePriceMemoryDocId(userId: string, storeName: string, itemName: string, unit: string): string {
  return `${userId}:${normalizeKeyPart(storeName)}:${normalizeItemName(itemName)}:${normalizeKeyPart(unit)}`;
}

function normalizeCategory(value: string | null | undefined): string | null {
  return toTitleCaseText(value);
}

function hasComparableCategoryMismatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeKeyPart(left);
  const normalizedRight = normalizeKeyPart(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft !== normalizedRight);
}

function hasComparableUnitMismatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeKeyPart(left);
  const normalizedRight = normalizeKeyPart(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft !== normalizedRight);
}

function buildReceiptItemRecord(
  userId: string,
  receiptId: string,
  storeName: string,
  purchaseDate: string,
  item: ReceiptItemInput,
  llmItem?: ReceiptItemInput,
  existingId?: string
): ReceiptItemRecord {
  const now = isoNow();
  const receiptItemName = sanitizeText(item.receipt_item_name, "UNKNOWN ITEM");
  const itemName = toTitleCaseText(item.item_name) ?? receiptItemName;
  const llmItemName = toTitleCaseText(llmItem?.item_name ?? item.llm_item_name) ?? "";
  const llmItemType = normalizeCategory(llmItem?.item_type ?? item.llm_item_type);
  const llmItemCategory = normalizeCategory(llmItem?.item_category ?? item.llm_item_category);
  const canonicalType = normalizeCategory(item.item_type);
  const canonicalCategory = normalizeCategory(item.item_category);

  return {
    id: existingId ?? createId("item"),
    user_id: userId,
    receipt_id: receiptId,
    purchase_date: purchaseDate,
    store_name: storeName,
    store_name_normalized: normalizeKeyPart(storeName),
    receipt_item_name: receiptItemName,
    receipt_item_name_normalized: normalizeKeyPart(receiptItemName),
    item_name: itemName,
    item_name_normalized: normalizeItemName(itemName),
    amount: toNumberOrNull(item.amount),
    unit: sanitizeText(item.unit) || null,
    quantity: toNumberOrNull(item.quantity),
    price: toNumberOrNull(item.price),
    price_per_unit: toNumberOrNull(item.price_per_unit),
    is_excluded: isExcludedItem(item),
    item_type: canonicalType,
    item_category: canonicalCategory,
    llm_item_name: llmItemName || null,
    llm_item_type: llmItemType,
    llm_item_category: llmItemCategory,
    has_mapping_mismatch:
      normalizeItemName(itemName) !== normalizeItemName(llmItemName || itemName) ||
      hasComparableCategoryMismatch(canonicalType, llmItemType) ||
      hasComparableCategoryMismatch(canonicalCategory, llmItemCategory),
    created_at: now,
    updated_at: now
  };
}

function coerceReceiptItemRecord(raw: Partial<ReceiptItemRecord>): ReceiptItemRecord {
  const legacyRaw = raw as Partial<ReceiptItemRecord> & {
    raw_line_text?: string;
    quantum_of_unit?: number | null;
    quantity_purchased?: number | null;
    line_price?: number | null;
    last_llm_item_name?: string | null;
    last_llm_quantum_of_unit?: number | null;
    last_llm_unit?: string | null;
    last_llm_quantity_purchased?: number | null;
    corrected_item_name?: string | null;
    corrected_quantum_of_unit?: number | null;
    corrected_unit?: string | null;
    corrected_quantity_purchased?: number | null;
  };
  const receiptItemName = sanitizeText(raw.receipt_item_name ?? legacyRaw.raw_line_text, "UNKNOWN ITEM");
  const itemName = toTitleCaseText(raw.item_name ?? legacyRaw.corrected_item_name) ?? receiptItemName;

  return {
    id: sanitizeText(raw.id),
    user_id: sanitizeText(raw.user_id),
    receipt_id: sanitizeText(raw.receipt_id),
    purchase_date: sanitizeText(raw.purchase_date),
    store_name: sanitizeText(raw.store_name),
    store_name_normalized: sanitizeText(raw.store_name_normalized, normalizeKeyPart(raw.store_name)),
    receipt_item_name: receiptItemName,
    receipt_item_name_normalized: sanitizeText(raw.receipt_item_name_normalized, normalizeKeyPart(receiptItemName)),
    item_name: itemName,
    item_name_normalized: sanitizeText(raw.item_name_normalized, normalizeItemName(itemName)),
    amount: toNumberOrNull(raw.amount ?? legacyRaw.quantum_of_unit ?? legacyRaw.corrected_quantum_of_unit),
    unit: sanitizeText(raw.unit) || null,
    quantity: toNumberOrNull(raw.quantity ?? legacyRaw.quantity_purchased ?? legacyRaw.corrected_quantity_purchased),
    price: toNumberOrNull(raw.price ?? legacyRaw.line_price),
    price_per_unit: toNumberOrNull(
      raw.price_per_unit ??
        (legacyRaw as Partial<ReceiptItemRecord> & { last_llm_price_per_unit?: number | null; corrected_price_per_unit?: number | null })
          .corrected_price_per_unit ??
        (legacyRaw as Partial<ReceiptItemRecord> & { last_llm_price_per_unit?: number | null; corrected_price_per_unit?: number | null })
          .last_llm_price_per_unit
    ),
    is_excluded: Boolean(raw.is_excluded),
    item_type: normalizeCategory(raw.item_type),
    item_category: normalizeCategory(raw.item_category),
    llm_item_name: toTitleCaseText(raw.llm_item_name ?? legacyRaw.last_llm_item_name),
    llm_item_type: normalizeCategory(raw.llm_item_type),
    llm_item_category: normalizeCategory(raw.llm_item_category),
    has_mapping_mismatch: Boolean(raw.has_mapping_mismatch),
    created_at: sanitizeText(raw.created_at, isoNow()),
    updated_at: sanitizeText(raw.updated_at, isoNow())
  };
}

function coerceReceiptRecord(raw: Partial<ReceiptRecord>): ReceiptRecord {
  return {
    id: sanitizeText(raw.id),
    user_id: sanitizeText(raw.user_id),
    store_name: sanitizeText(raw.store_name),
    store_name_normalized: sanitizeText(raw.store_name_normalized, normalizeKeyPart(raw.store_name)),
    purchase_date: sanitizeText(raw.purchase_date),
    receipt_total: toNumberOrNull(raw.receipt_total),
    receipt_tax: toNumberOrNull(raw.receipt_tax),
    excluded_total: toNumberOrNull(raw.excluded_total) ?? 0,
    receipt_id: sanitizeText(raw.receipt_id, raw.id),
    item_count: typeof raw.item_count === "number" ? raw.item_count : 0,
    created_at: sanitizeText(raw.created_at, isoNow()),
    updated_at: sanitizeText(raw.updated_at, isoNow())
  };
}

function coerceUserRecord(raw: Partial<UserRecord>): UserRecord {
  return {
    id: sanitizeText(raw.id),
    email: sanitizeText(raw.email).toLowerCase(),
    created_at: sanitizeText(raw.created_at, isoNow()),
    updated_at: sanitizeText(raw.updated_at, isoNow())
  };
}

function coerceSessionRecord(raw: Partial<SessionRecord>): SessionRecord {
  return {
    token: sanitizeText(raw.token),
    user_id: sanitizeText(raw.user_id),
    created_at: sanitizeText(raw.created_at, isoNow())
  };
}

function coerceItemMappingRecord(raw: Partial<ItemMappingRecord>): ItemMappingRecord {
  const legacyRaw = raw as Partial<ItemMappingRecord> & {
    raw_line_text?: string;
    corrected_item_name?: string | null;
    corrected_quantum_of_unit?: number | null;
    corrected_unit?: string | null;
  };
  const receiptItemName = sanitizeText(raw.receipt_item_name ?? legacyRaw.raw_line_text);
  const itemName = toTitleCaseText(raw.item_name ?? legacyRaw.corrected_item_name) ?? receiptItemName;
  return {
    id: sanitizeText(raw.id),
    user_id: sanitizeText(raw.user_id),
    store_name: sanitizeText(raw.store_name),
    store_name_normalized: sanitizeText(raw.store_name_normalized, normalizeKeyPart(raw.store_name)),
    receipt_item_name: receiptItemName,
    receipt_item_name_normalized: sanitizeText(raw.receipt_item_name_normalized, normalizeKeyPart(receiptItemName)),
    item_name: itemName,
    item_name_normalized: sanitizeText(raw.item_name_normalized, normalizeItemName(itemName)),
    amount: toNumberOrNull(raw.amount ?? legacyRaw.corrected_quantum_of_unit),
    unit: sanitizeText(raw.unit ?? legacyRaw.corrected_unit) || null,
    item_type: normalizeCategory(raw.item_type),
    item_category: normalizeCategory(raw.item_category),
    created_at: sanitizeText(raw.created_at, isoNow()),
    updated_at: sanitizeText(raw.updated_at, isoNow())
  };
}

function coerceItemStorePriceMemoryRecord(raw: Partial<ItemStorePriceMemoryRecord>): ItemStorePriceMemoryRecord {
  const itemName = toTitleCaseText(raw.item_name) ?? "";
  const unit = sanitizeText(raw.unit, "lb");
  return {
    id: sanitizeText(raw.id),
    user_id: sanitizeText(raw.user_id),
    store_name: sanitizeText(raw.store_name),
    store_name_normalized: sanitizeText(raw.store_name_normalized, normalizeKeyPart(raw.store_name)),
    item_name: itemName,
    item_name_normalized: sanitizeText(raw.item_name_normalized, normalizeItemName(itemName)),
    unit,
    price_per_unit: toNumberOrNull(raw.price_per_unit) ?? 0,
    last_price: toNumberOrNull(raw.last_price),
    last_purchase_date: sanitizeText(raw.last_purchase_date),
    created_at: sanitizeText(raw.created_at, isoNow()),
    updated_at: sanitizeText(raw.updated_at, isoNow())
  };
}

function buildMappingRecordFromItem(
  userId: string,
  storeName: string,
  item: ReceiptItemInput,
  existing?: ItemMappingRecord | null
): ItemMappingRecord | null {
  const receiptItemName = sanitizeText(item.receipt_item_name);
  if (!receiptItemName) {
    return null;
  }

  const canonicalItemName = toTitleCaseText(item.item_name) ?? receiptItemName;
  const now = isoNow();
  return {
    id: existing?.id ?? mappingDocId(userId, storeName, receiptItemName),
    user_id: userId,
    store_name: sanitizeText(storeName),
    store_name_normalized: normalizeKeyPart(storeName),
    receipt_item_name: receiptItemName,
    receipt_item_name_normalized: normalizeKeyPart(receiptItemName),
    item_name: canonicalItemName,
    item_name_normalized: normalizeItemName(canonicalItemName),
    amount: toNumberOrNull(item.amount),
    unit: sanitizeText(item.unit) || null,
    item_type: normalizeCategory(item.item_type),
    item_category: normalizeCategory(item.item_category),
    created_at: existing?.created_at ?? now,
    updated_at: now
  };
}

async function upsertMappingsFromReceiptItems(userId: string, storeName: string, items: ReceiptItemInput[]): Promise<void> {
  for (const item of items) {
    const receiptItemName = sanitizeText(item.receipt_item_name);
    if (!receiptItemName) {
      continue;
    }

    const id = mappingDocId(userId, storeName, receiptItemName);
    const existingSnapshot = await firestore.collection(COLLECTIONS.itemMappings).doc(id).get();
    const existing = existingSnapshot.exists ? coerceItemMappingRecord(existingSnapshot.data() as Partial<ItemMappingRecord>) : null;
    const mapping = buildMappingRecordFromItem(userId, storeName, item, existing);
    if (!mapping) {
      continue;
    }

    await firestore.collection(COLLECTIONS.itemMappings).doc(mapping.id).set(mapping);
    await propagateMappingToReceiptItems(userId, mapping);
  }
}

async function upsertPriceMemoryFromReceiptItems(userId: string, storeName: string, purchaseDate: string, items: ReceiptItemInput[]): Promise<void> {
  for (const item of items) {
    const itemName = toTitleCaseText(item.item_name) ?? sanitizeText(item.receipt_item_name);
    const unit = sanitizeText(item.unit);
    const pricePerUnit = toNumberOrNull(item.price_per_unit);
    if (!itemName || normalizeKeyPart(unit) !== "LB" || !pricePerUnit || pricePerUnit <= 0) {
      continue;
    }

    const id = itemStorePriceMemoryDocId(userId, storeName, itemName, unit);
    const existingSnapshot = await firestore.collection(COLLECTIONS.itemStorePriceMemory).doc(id).get();
    const existing = existingSnapshot.exists
      ? coerceItemStorePriceMemoryRecord(existingSnapshot.data() as Partial<ItemStorePriceMemoryRecord>)
      : null;
    const now = isoNow();
    const memory: ItemStorePriceMemoryRecord = {
      id,
      user_id: userId,
      store_name: sanitizeText(storeName),
      store_name_normalized: normalizeKeyPart(storeName),
      item_name: itemName,
      item_name_normalized: normalizeItemName(itemName),
      unit,
      price_per_unit: pricePerUnit,
      last_price: toNumberOrNull(item.price),
      last_purchase_date: sanitizeText(purchaseDate),
      created_at: existing?.created_at ?? now,
      updated_at: now
    };

    await firestore.collection(COLLECTIONS.itemStorePriceMemory).doc(id).set(memory);
  }
}

async function getReceiptItemsForUser(userId: string): Promise<ReceiptItemRecord[]> {
  const snapshot = await firestore.collection(COLLECTIONS.receiptItems).where("user_id", "==", userId).get();
  return snapshot.docs.map((doc) => coerceReceiptItemRecord(doc.data() as Partial<ReceiptItemRecord>));
}

async function getMappingsForUser(userId: string): Promise<ItemMappingRecord[]> {
  const snapshot = await firestore.collection(COLLECTIONS.itemMappings).where("user_id", "==", userId).get();
  return snapshot.docs.map((doc) => coerceItemMappingRecord(doc.data() as Partial<ItemMappingRecord>));
}

async function propagateMappingToReceiptItems(userId: string, mapping: ItemMappingRecord): Promise<void> {
  const snapshot = await firestore.collection(COLLECTIONS.receiptItems).where("user_id", "==", userId).get();
  const batch = firestore.batch();

  snapshot.docs.forEach((doc) => {
    const item = coerceReceiptItemRecord(doc.data() as Partial<ReceiptItemRecord>);
    if (
      item.store_name_normalized !== mapping.store_name_normalized ||
      item.receipt_item_name_normalized !== mapping.receipt_item_name_normalized
    ) {
      return;
    }

    const llmItemName = item.llm_item_name || item.item_name;
    const llmItemType = item.llm_item_type;
    const llmItemCategory = item.llm_item_category;

    batch.update(doc.ref, {
      item_name: mapping.item_name,
      item_name_normalized: mapping.item_name_normalized,
      amount: mapping.amount,
      unit: mapping.unit,
      item_type: mapping.item_type,
      item_category: mapping.item_category,
      has_mapping_mismatch:
        normalizeItemName(mapping.item_name) !== normalizeItemName(llmItemName) ||
        hasComparableUnitMismatch(mapping.unit, item.unit) ||
        hasComparableCategoryMismatch(mapping.item_type, llmItemType) ||
        hasComparableCategoryMismatch(mapping.item_category, llmItemCategory),
      updated_at: isoNow()
    });
  });

  await batch.commit();
}

export async function upsertUserByEmail(email: string): Promise<UserRecord> {
  const normalizedEmail = email.trim().toLowerCase();
  const snapshot = await firestore.collection(COLLECTIONS.users).where("email", "==", normalizedEmail).limit(1).get();
  const now = isoNow();

  if (!snapshot.empty) {
    const existingRef = snapshot.docs[0]!.ref;
    await existingRef.update({ updated_at: now });
    return coerceUserRecord({ ...(snapshot.docs[0]!.data() as Partial<UserRecord>), updated_at: now });
  }

  const user: UserRecord = {
    id: createId("usr"),
    email: normalizedEmail,
    created_at: now,
    updated_at: now
  };

  await firestore.collection(COLLECTIONS.users).doc(user.id).set(user);
  return user;
}

export async function createSession(userId: string): Promise<SessionRecord> {
  const session: SessionRecord = {
    token: createId("sess"),
    user_id: userId,
    created_at: isoNow()
  };

  const existingSessions = await firestore.collection(COLLECTIONS.sessions).where("user_id", "==", userId).get();
  const batch = firestore.batch();
  existingSessions.docs.forEach((doc) => batch.delete(doc.ref));
  batch.set(firestore.collection(COLLECTIONS.sessions).doc(session.token), session);
  await batch.commit();
  return session;
}

export async function getSession(token: string): Promise<SessionRecord | null> {
  const snapshot = await firestore.collection(COLLECTIONS.sessions).doc(token).get();
  return snapshot.exists ? coerceSessionRecord(snapshot.data() as Partial<SessionRecord>) : null;
}

export async function deleteSession(token: string): Promise<void> {
  await firestore.collection(COLLECTIONS.sessions).doc(token).delete();
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const snapshot = await firestore.collection(COLLECTIONS.users).doc(userId).get();
  return snapshot.exists ? coerceUserRecord(snapshot.data() as Partial<UserRecord>) : null;
}

export async function getItemMapping(
  userId: string,
  storeName: string,
  receiptItemName: string
): Promise<ItemMappingRecord | null> {
  const snapshot = await firestore
    .collection(COLLECTIONS.itemMappings)
    .doc(mappingDocId(userId, storeName, receiptItemName))
    .get();

  return snapshot.exists ? coerceItemMappingRecord(snapshot.data() as Partial<ItemMappingRecord>) : null;
}

export async function getItemStorePriceMemory(
  userId: string,
  storeName: string,
  itemName: string,
  unit = "lb"
): Promise<ItemStorePriceMemoryRecord | null> {
  const snapshot = await firestore
    .collection(COLLECTIONS.itemStorePriceMemory)
    .doc(itemStorePriceMemoryDocId(userId, storeName, itemName, unit))
    .get();

  return snapshot.exists ? coerceItemStorePriceMemoryRecord(snapshot.data() as Partial<ItemStorePriceMemoryRecord>) : null;
}

export async function saveReceipt(userId: string, payload: SaveReceiptPayload): Promise<{ receipt: ReceiptRecord }> {
  const now = isoNow();
  const receiptId = createId("rcpt");
  const receipt: ReceiptRecord = {
    id: receiptId,
    user_id: userId,
    store_name: payload.store_name,
    store_name_normalized: normalizeKeyPart(payload.store_name),
    purchase_date: payload.purchase_date,
    receipt_total: toNumberOrNull(payload.receipt_total),
    receipt_tax: toNumberOrNull(payload.receipt_tax),
    excluded_total: computeExcludedTotal(payload.items),
    receipt_id: receiptId,
    item_count: payload.items.length,
    created_at: now,
    updated_at: now
  };

  const batch = firestore.batch();
  batch.set(firestore.collection(COLLECTIONS.receipts).doc(receiptId), receipt);

  payload.items.forEach((item, index) => {
    const llmItem = payload.llm_items[index];
    const record = buildReceiptItemRecord(userId, receiptId, payload.store_name, payload.purchase_date, item, llmItem);
    batch.set(firestore.collection(COLLECTIONS.receiptItems).doc(record.id), record);
  });

  await batch.commit();
  await upsertMappingsFromReceiptItems(userId, payload.store_name, payload.items);
  await upsertPriceMemoryFromReceiptItems(userId, payload.store_name, payload.purchase_date, payload.items);
  return { receipt };
}

export async function listReceipts(userId: string): Promise<ReceiptRecord[]> {
  const snapshot = await firestore.collection(COLLECTIONS.receipts).where("user_id", "==", userId).get();
  return snapshot.docs
    .map((doc) => coerceReceiptRecord(doc.data() as Partial<ReceiptRecord>))
    .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date) || b.created_at.localeCompare(a.created_at));
}

export async function getReceiptDetail(userId: string, receiptId: string): Promise<{ receipt: ReceiptRecord; items: ReceiptItemRecord[] } | null> {
  const receiptSnapshot = await firestore.collection(COLLECTIONS.receipts).doc(receiptId).get();
  if (!receiptSnapshot.exists) {
    return null;
  }

  const receipt = coerceReceiptRecord(receiptSnapshot.data() as Partial<ReceiptRecord>);
  if (receipt.user_id !== userId) {
    return null;
  }

  const itemSnapshot = await firestore.collection(COLLECTIONS.receiptItems).where("receipt_id", "==", receiptId).get();
  const items = itemSnapshot.docs
    .map((doc) => coerceReceiptItemRecord(doc.data() as Partial<ReceiptItemRecord>))
    .filter((item) => item.user_id === userId);

  return { receipt, items };
}

export async function updateReceipt(
  userId: string,
  receiptId: string,
  payload: SaveReceiptPayload
): Promise<{ receipt: ReceiptRecord; items: ReceiptItemRecord[] } | null> {
  const current = await getReceiptDetail(userId, receiptId);
  if (!current) {
    return null;
  }

  const now = isoNow();
  const receipt: ReceiptRecord = {
    ...current.receipt,
    store_name: payload.store_name,
    store_name_normalized: normalizeKeyPart(payload.store_name),
    purchase_date: payload.purchase_date,
    receipt_total: toNumberOrNull(payload.receipt_total),
    receipt_tax: toNumberOrNull(payload.receipt_tax),
    excluded_total: computeExcludedTotal(payload.items),
    item_count: payload.items.length,
    updated_at: now
  };

  const batch = firestore.batch();
  batch.set(firestore.collection(COLLECTIONS.receipts).doc(receiptId), receipt);
  current.items.forEach((item) => batch.delete(firestore.collection(COLLECTIONS.receiptItems).doc(item.id)));

  const nextItems = payload.items.map((item, index) => {
    const llmItem = payload.llm_items[index];
    const record = buildReceiptItemRecord(userId, receiptId, payload.store_name, payload.purchase_date, item, llmItem);
    batch.set(firestore.collection(COLLECTIONS.receiptItems).doc(record.id), record);
    return record;
  });

  await batch.commit();
  await upsertMappingsFromReceiptItems(userId, payload.store_name, payload.items);
  await upsertPriceMemoryFromReceiptItems(userId, payload.store_name, payload.purchase_date, payload.items);
  return { receipt, items: nextItems };
}

export async function deleteReceipt(userId: string, receiptId: string): Promise<boolean> {
  const current = await getReceiptDetail(userId, receiptId);
  if (!current) {
    return false;
  }

  const batch = firestore.batch();
  batch.delete(firestore.collection(COLLECTIONS.receipts).doc(receiptId));
  current.items.forEach((item) => batch.delete(firestore.collection(COLLECTIONS.receiptItems).doc(item.id)));
  await batch.commit();
  return true;
}

export async function listKnownUnits(userId: string): Promise<string[]> {
  const items = await getReceiptItemsForUser(userId);
  return [...new Set(items.map((item) => item.unit).filter((unit): unit is string => Boolean(unit?.trim())))]
    .sort((a, b) => a.localeCompare(b));
}

type GetStatsOptions = {
  metric?: StatsMetric;
  startDate?: string | null;
  endDate?: string | null;
  subjectKind?: StatsSubjectKind | null;
  subjectValue?: string | null;
  dateBucket?: StatsDateBucket;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type ParsedDateValue = DateParts & {
  key: string;
};

type MetricContribution = {
  quantity: number;
  dollars: number;
  totalAmount: number;
  totalAmountUnit: string;
};

type RankedItem = {
  item_name: string;
  quantity: number;
  dollars: number;
  total_amount: number;
  unit_totals: Map<string, number>;
};

type BucketTooltipRow = StatsResponse["deep_dive"]["series"][number]["tooltip_rows"][number];

const MULTI_UNIT_TOOLTIP = "Current filtering contains multiple units";

function parseDateParts(value: string | null | undefined): ParsedDateValue | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return {
    year,
    month,
    day,
    key: `${match[1]}-${match[2]}-${match[3]}`
  };
}

function datePartsToUtcDate(date: DateParts): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function formatUtcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeStatsSubjectValue(value: string | null | undefined): string {
  return normalizeKeyPart(value);
}

function formatBucketLabel(bucketKey: string, dateBucket: StatsDateBucket): string {
  if (dateBucket === "day" || dateBucket === "week") {
    const parsed = parseDateParts(bucketKey);
    if (!parsed) {
      return bucketKey;
    }
    return `${parsed.month}/${parsed.day}`;
  }

  if (dateBucket === "month") {
    return bucketKey;
  }

  return bucketKey;
}

function getBucketKey(dateKey: string, dateBucket: StatsDateBucket): string {
  const parsed = parseDateParts(dateKey);
  if (!parsed) {
    return dateKey;
  }

  if (dateBucket === "day") {
    return parsed.key;
  }

  if (dateBucket === "month") {
    return `${parsed.year}-${`${parsed.month}`.padStart(2, "0")}`;
  }

  if (dateBucket === "year") {
    return `${parsed.year}`;
  }

  const date = datePartsToUtcDate(parsed);
  const dayOfWeek = date.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return formatUtcDateKey(date);
}

function incrementBucketKey(bucketKey: string, dateBucket: StatsDateBucket): string | null {
  if (dateBucket === "day") {
    const parsed = parseDateParts(bucketKey);
    if (!parsed) {
      return null;
    }

    const date = datePartsToUtcDate(parsed);
    date.setUTCDate(date.getUTCDate() + 1);
    return formatUtcDateKey(date);
  }

  if (dateBucket === "week") {
    const parsed = parseDateParts(bucketKey);
    if (!parsed) {
      return null;
    }

    const date = datePartsToUtcDate(parsed);
    date.setUTCDate(date.getUTCDate() + 7);
    return formatUtcDateKey(date);
  }

  if (dateBucket === "month") {
    const match = bucketKey.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const date = new Date(Date.UTC(year, month - 1, 1));
    date.setUTCMonth(date.getUTCMonth() + 1);
    return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}`;
  }

  const year = Number(bucketKey);
  if (!Number.isInteger(year)) {
    return null;
  }

  return `${year + 1}`;
}

function expandBucketKeys(bucketKeys: string[], dateBucket: StatsDateBucket): string[] {
  if (bucketKeys.length === 0) {
    return [];
  }

  const sorted = [...bucketKeys].sort((a, b) => a.localeCompare(b));
  const expanded: string[] = [];
  let current = sorted[0];
  const last = sorted[sorted.length - 1];

  while (current) {
    expanded.push(current);
    if (current === last) {
      break;
    }

    const next = incrementBucketKey(current, dateBucket);
    if (!next || next <= current) {
      break;
    }
    current = next;
  }

  return expanded;
}

function getMetricContribution(item: ReceiptItemRecord): MetricContribution {
  const amount = item.amount ?? 1;
  const quantity = item.quantity ?? 1;
  return {
    quantity: item.quantity ?? 0,
    dollars: item.price ?? 0,
    totalAmount: amount * quantity,
    totalAmountUnit: item.unit?.trim() || "Each"
  };
}

function getMetricValue(metric: StatsMetric, contribution: MetricContribution): number {
  if (metric === "dollars") {
    return contribution.dollars;
  }

  if (metric === "total_amount") {
    return contribution.totalAmount;
  }

  return contribution.quantity;
}

function formatAmountNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

function buildTotalAmountDisplay(unitTotals: Map<string, number>): { text: string; hasMultipleUnits: boolean } {
  const segments = [...unitTotals.entries()]
    .filter(([, total]) => Number.isFinite(total))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([unit, total]) => `${formatAmountNumber(Number(total.toFixed(2)))}${unit}`);

  return {
    text: segments.join(" + "),
    hasMultipleUnits: segments.length > 1
  };
}

function addRankedItemContribution(
  totals: Map<string, RankedItem>,
  item: ReceiptItemRecord,
  contribution: MetricContribution
): void {
  const key = item.item_name_normalized;
  const preferredItemName = item.item_name?.trim() || item.receipt_item_name;
  const current = totals.get(key) ?? {
    item_name: preferredItemName,
    quantity: 0,
    dollars: 0,
    total_amount: 0,
    unit_totals: new Map<string, number>()
  };

  if (!current.item_name && preferredItemName) {
    current.item_name = preferredItemName;
  }

  current.quantity += contribution.quantity;
  current.dollars += contribution.dollars;
  current.total_amount += contribution.totalAmount;
  current.unit_totals.set(
    contribution.totalAmountUnit,
    (current.unit_totals.get(contribution.totalAmountUnit) ?? 0) + contribution.totalAmount
  );
  totals.set(key, current);
}

function buildTooltipRows(items: ReceiptItemRecord[]): BucketTooltipRow[] {
  const totals = new Map<string, RankedItem>();

  items.forEach((item) => {
    addRankedItemContribution(totals, item, getMetricContribution(item));
  });

  return [...totals.values()]
    .sort((a, b) => b.dollars - a.dollars || a.item_name.localeCompare(b.item_name))
    .map((item) => {
      const totalAmountDisplay = buildTotalAmountDisplay(item.unit_totals);
      return {
        item_name: item.item_name,
        total_amount_display: totalAmountDisplay.text,
        dollars: Number(item.dollars.toFixed(2)),
        has_multiple_units: totalAmountDisplay.hasMultipleUnits
      };
    });
}

function buildSubjectOptions(items: ReceiptItemRecord[]): StatsSubjectOption[] {
  const options: StatsSubjectOption[] = [];
  const seen = new Set<string>();

  const addOption = (label: string | null | undefined, kind: StatsSubjectKind): void => {
    const nextLabel = label?.trim();
    if (!nextLabel) {
      return;
    }

    const value = normalizeStatsSubjectValue(nextLabel);
    const key = `${kind}:${value}`;
    if (!value || seen.has(key)) {
      return;
    }

    seen.add(key);
    options.push({ label: nextLabel, value, kind });
  };

  items.forEach((item) => {
    addOption(item.item_name, "item");
    addOption(item.item_type, "type");
    addOption(item.item_category, "category");
  });

  const kindOrder: Record<StatsSubjectKind, number> = {
    item: 0,
    type: 1,
    category: 2
  };

  return options.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.label.localeCompare(b.label));
}

function matchesSubjectFilter(item: ReceiptItemRecord, subjectKind: StatsSubjectKind, subjectValue: string): boolean {
  if (subjectKind === "item") {
    return normalizeStatsSubjectValue(item.item_name) === subjectValue;
  }

  if (subjectKind === "type") {
    return normalizeStatsSubjectValue(item.item_type) === subjectValue;
  }

  return normalizeStatsSubjectValue(item.item_category) === subjectValue;
}

function buildSelectedSubject(
  subjectOptions: StatsSubjectOption[],
  subjectKind: StatsSubjectKind | null | undefined,
  subjectValue: string | null | undefined
): StatsResponse["deep_dive"]["selected_subject"] {
  if (!subjectKind || !subjectValue) {
    return null;
  }

  return subjectOptions.find((option) => option.kind === subjectKind && option.value === subjectValue) ?? null;
}

function buildTopItems(items: ReceiptItemRecord[], metric: StatsMetric): StatsResponse["deep_dive"]["top_items"] {
  const totals = new Map<string, RankedItem>();

  items.forEach((item) => {
    addRankedItemContribution(totals, item, getMetricContribution(item));
  });

  return [...totals.values()]
    .sort((a, b) => {
      const primary =
        metric === "dollars"
          ? b.dollars - a.dollars
          : metric === "total_amount"
            ? b.total_amount - a.total_amount
            : b.quantity - a.quantity;
      if (primary !== 0) {
        return primary;
      }

      return a.item_name.localeCompare(b.item_name);
    })
    .slice(0, 5)
    .map((item) => {
      const totalAmountDisplay = buildTotalAmountDisplay(item.unit_totals);
      return {
        item_name: item.item_name,
        quantity: Number(item.quantity.toFixed(2)),
        dollars: Number(item.dollars.toFixed(2)),
        total_amount: Number(item.total_amount.toFixed(2)),
        total_amount_display: totalAmountDisplay.text,
        has_multiple_units: totalAmountDisplay.hasMultipleUnits
      };
    });
}

function buildSeries(
  items: ReceiptItemRecord[],
  metric: StatsMetric,
  dateBucket: StatsDateBucket
): StatsResponse["deep_dive"]["series"] {
  const totals = new Map<string, number>();
  const bucketItems = new Map<string, ReceiptItemRecord[]>();

  items.forEach((item) => {
    const purchaseDateKey = parseDateParts(item.purchase_date)?.key;
    if (!purchaseDateKey) {
      return;
    }

    const bucketKey = getBucketKey(purchaseDateKey, dateBucket);
    const value = getMetricValue(metric, getMetricContribution(item));
    totals.set(bucketKey, (totals.get(bucketKey) ?? 0) + value);
    const currentItems = bucketItems.get(bucketKey) ?? [];
    currentItems.push(item);
    bucketItems.set(bucketKey, currentItems);
  });

  return expandBucketKeys([...totals.keys()], dateBucket).map((bucketKey) => {
    const tooltipRows = buildTooltipRows(bucketItems.get(bucketKey) ?? []);
    return {
      bucket_key: bucketKey,
      bucket_label: formatBucketLabel(bucketKey, dateBucket),
      value: Number((totals.get(bucketKey) ?? 0).toFixed(2)),
      tooltip_rows: tooltipRows,
      has_multiple_units: tooltipRows.some((row) => row.has_multiple_units)
    };
  });
}

function resolveSeriesUnit(
  metric: StatsMetric,
  items: ReceiptItemRecord[]
): Pick<StatsResponse["deep_dive"], "series_unit_label" | "series_unit_tooltip"> {
  if (metric === "dollars") {
    return {
      series_unit_label: "$",
      series_unit_tooltip: null
    };
  }

  if (metric === "quantity") {
    return {
      series_unit_label: null,
      series_unit_tooltip: null
    };
  }

  const units = [...new Set(items.map((item) => getMetricContribution(item).totalAmountUnit))];
  if (units.length === 0) {
    return {
      series_unit_label: "Each",
      series_unit_tooltip: null
    };
  }

  if (units.length === 1) {
    return {
      series_unit_label: units[0],
      series_unit_tooltip: null
    };
  }

  return {
    series_unit_label: "Multiple Units",
    series_unit_tooltip: MULTI_UNIT_TOOLTIP
  };
}

function isWithinDateRange(dateKey: string, startDate: string | null, endDate: string | null): boolean {
  if (startDate && dateKey < startDate) {
    return false;
  }

  if (endDate && dateKey > endDate) {
    return false;
  }

  return true;
}

export async function getStats(userId: string, options: GetStatsOptions = {}): Promise<StatsResponse> {
  const metric = options.metric ?? "dollars";
  const dateBucket = options.dateBucket ?? "month";
  const receipts = await listReceipts(userId);
  const items = await getReceiptItemsForUser(userId);
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const rangeStart = parseDateParts(options.startDate)?.key ?? null;
  const rangeEnd = parseDateParts(options.endDate)?.key ?? null;
  const subjectKind = options.subjectKind ?? null;
  const subjectValue = normalizeStatsSubjectValue(options.subjectValue);
  const subjectOptions = buildSubjectOptions(items);

  let spend7 = 0;
  let spend30 = 0;
  receipts.forEach((receipt) => {
    const purchaseDateParts = parseDateParts(receipt.purchase_date);
    if (!purchaseDateParts || receipt.receipt_total === null) {
      return;
    }

    const purchaseDate = datePartsToUtcDate(purchaseDateParts);
    if (purchaseDate >= sevenDaysAgo) {
      spend7 += receipt.receipt_total;
    }
    if (purchaseDate >= thirtyDaysAgo) {
      spend30 += receipt.receipt_total;
    }
  });

  const filteredItems = items.filter((item) => {
    const purchaseDateKey = parseDateParts(item.purchase_date)?.key;
    if (!purchaseDateKey || !isWithinDateRange(purchaseDateKey, rangeStart, rangeEnd)) {
      return false;
    }

    if (subjectKind && subjectValue && !matchesSubjectFilter(item, subjectKind, subjectValue)) {
      return false;
    }

    return true;
  });

  const seriesUnit = resolveSeriesUnit(metric, filteredItems);

  return {
    spend_last_7_days: Number(spend7.toFixed(2)),
    spend_last_30_days: Number(spend30.toFixed(2)),
    filters: {
      subject_options: subjectOptions
    },
    deep_dive: {
      selected_subject: buildSelectedSubject(subjectOptions, subjectKind, subjectValue),
      metric,
      date_bucket: dateBucket,
      series: buildSeries(filteredItems, metric, dateBucket),
      series_unit_label: seriesUnit.series_unit_label,
      series_unit_tooltip: seriesUnit.series_unit_tooltip,
      top_items: buildTopItems(filteredItems, metric)
    }
  };
}

export async function listItemMappings(userId: string): Promise<ItemMappingRecord[]> {
  const mappings = await getMappingsForUser(userId);
  return mappings.sort(
    (a, b) =>
      a.store_name.localeCompare(b.store_name) ||
      a.receipt_item_name.localeCompare(b.receipt_item_name) ||
      a.item_name.localeCompare(b.item_name)
  );
}

export async function updateItemMappings(
  userId: string,
  updates: Array<{
    id?: string;
    store_name: string;
    receipt_item_name: string;
    item_name: string;
    amount?: number | null;
    unit?: string | null;
    item_type: string | null;
    item_category: string | null;
  }>,
  deleteIds: string[]
): Promise<ItemMappingRecord[]> {
  const batch = firestore.batch();
  const now = isoNow();
  const changedMappings: ItemMappingRecord[] = [];

  for (const update of updates) {
    const id = update.id?.trim() || mappingDocId(userId, update.store_name, update.receipt_item_name);
    const ref = firestore.collection(COLLECTIONS.itemMappings).doc(id);
    const existing = await ref.get();
    const existingData = existing.exists ? coerceItemMappingRecord(existing.data() as Partial<ItemMappingRecord>) : null;

    const record: ItemMappingRecord = {
      id,
      user_id: userId,
      store_name: sanitizeText(update.store_name),
      store_name_normalized: normalizeKeyPart(update.store_name),
      receipt_item_name: sanitizeText(update.receipt_item_name),
      receipt_item_name_normalized: normalizeKeyPart(update.receipt_item_name),
      item_name: toTitleCaseText(update.item_name) ?? sanitizeText(update.receipt_item_name),
      item_name_normalized: normalizeItemName(toTitleCaseText(update.item_name) ?? update.receipt_item_name),
      amount: toNumberOrNull(update.amount),
      unit: sanitizeText(update.unit) || null,
      item_type: normalizeCategory(update.item_type),
      item_category: normalizeCategory(update.item_category),
      created_at: existingData?.created_at ?? now,
      updated_at: now
    };

    batch.set(ref, record);
    changedMappings.push(record);
  }

  deleteIds.forEach((deleteId) => {
    batch.delete(firestore.collection(COLLECTIONS.itemMappings).doc(deleteId));
  });

  await batch.commit();

  for (const mapping of changedMappings) {
    await propagateMappingToReceiptItems(userId, mapping);
  }

  return listItemMappings(userId);
}

export async function acceptItemSuggestion(userId: string, receiptItemId: string): Promise<ItemMappingRecord | null> {
  const snapshot = await firestore.collection(COLLECTIONS.receiptItems).doc(receiptItemId).get();
  if (!snapshot.exists) {
    return null;
  }

  const item = coerceReceiptItemRecord(snapshot.data() as Partial<ReceiptItemRecord>);
  if (item.user_id !== userId || !item.llm_item_name) {
    return null;
  }

  const id = mappingDocId(userId, item.store_name, item.receipt_item_name);
  const now = isoNow();
  const existing = await firestore.collection(COLLECTIONS.itemMappings).doc(id).get();
  const mapping: ItemMappingRecord = {
    id,
    user_id: userId,
    store_name: item.store_name,
    store_name_normalized: item.store_name_normalized,
    receipt_item_name: item.receipt_item_name,
    receipt_item_name_normalized: item.receipt_item_name_normalized,
    item_name: toTitleCaseText(item.llm_item_name) ?? item.receipt_item_name,
    item_name_normalized: normalizeItemName(toTitleCaseText(item.llm_item_name) ?? item.receipt_item_name),
    amount: toNumberOrNull(item.amount),
    unit: sanitizeText(item.unit) || null,
    item_type: normalizeCategory(item.llm_item_type),
    item_category: normalizeCategory(item.llm_item_category),
    created_at: existing.exists ? coerceItemMappingRecord(existing.data() as Partial<ItemMappingRecord>).created_at : now,
    updated_at: now
  };

  await firestore.collection(COLLECTIONS.itemMappings).doc(id).set(mapping);
  await propagateMappingToReceiptItems(userId, mapping);
  return mapping;
}

export async function declineItemSuggestion(userId: string, receiptItemId: string): Promise<boolean> {
  const ref = firestore.collection(COLLECTIONS.receiptItems).doc(receiptItemId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return false;
  }

  const item = coerceReceiptItemRecord(snapshot.data() as Partial<ReceiptItemRecord>);
  if (item.user_id !== userId) {
    return false;
  }

  await ref.update({
    has_mapping_mismatch: false,
    updated_at: isoNow()
  });

  return true;
}

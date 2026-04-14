"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import type { ReceiptItemInput, ReceiptItemRecord, ReceiptRecord } from "@/lib/types";

type ReceiptDetailEditorProps = {
  initialReceipt: ReceiptRecord;
  initialItems: ReceiptItemRecord[];
};

const PER_POUND_OPTION = "__per_pound__";
const EMPTY_UNIT_OPTION = "__empty_unit__";
const CUSTOM_UNIT_OPTION = "__custom_unit__";

function buildEditableItems(items: ReceiptItemRecord[]): ReceiptItemInput[] {
  return items.map((item) => ({
    receipt_item_name: item.receipt_item_name,
    item_name: item.item_name,
    amount: item.amount,
    unit: item.unit,
    quantity: item.quantity,
    price: item.price,
    price_per_unit: item.price_per_unit,
    is_excluded: item.is_excluded,
    is_per_pound: item.price_per_unit !== null,
    item_type: item.item_type,
    item_category: item.item_category,
    llm_item_name: item.llm_item_name,
    llm_item_type: item.llm_item_type,
    llm_item_category: item.llm_item_category,
    prefill_source: "manual",
    has_mapping_mismatch: item.has_mapping_mismatch
  }));
}

function buildEmptyRow(): ReceiptItemInput {
  return {
    receipt_item_name: "",
    item_name: "",
    amount: null,
    unit: null,
    quantity: null,
    price: null,
    price_per_unit: null,
    is_excluded: false,
    is_per_pound: false,
    item_type: null,
    item_category: null,
    llm_item_name: null,
    llm_item_type: null,
    llm_item_category: null,
    prefill_source: "manual",
    has_mapping_mismatch: false
  };
}

function sanitizeNumericValue(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPerPoundItem(item: ReceiptItemInput): boolean {
  return Boolean(item.is_per_pound || (item.unit?.trim().toLowerCase() === "lb" && typeof item.price_per_unit === "number"));
}

function roundToHundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

function derivePerPoundAmount(price: number | null, pricePerUnit: number | null): number | null {
  if (typeof price !== "number" || typeof pricePerUnit !== "number" || pricePerUnit <= 0) {
    return null;
  }

  return roundToHundredths(price / pricePerUnit);
}

function applyPerPoundFields(item: ReceiptItemInput, pricePerUnit: number | null): ReceiptItemInput {
  return {
    ...item,
    amount: derivePerPoundAmount(item.price, pricePerUnit),
    unit: "lb",
    quantity: 1,
    price_per_unit: pricePerUnit,
    is_per_pound: true
  };
}

function getUnitSelectOptions(knownUnits: string[], currentUnit: string | null): string[] {
  const options = new Set<string>();
  knownUnits.forEach((unit) => {
    const nextUnit = unit.trim();
    if (nextUnit) {
      options.add(nextUnit);
    }
  });
  if (currentUnit?.trim()) {
    options.add(currentUnit.trim());
  }
  return [...options].sort((left, right) => left.localeCompare(right));
}

function getUnitSelectValue(item: ReceiptItemInput, knownUnits: string[]): string {
  if (isPerPoundItem(item)) {
    return PER_POUND_OPTION;
  }

  const currentUnit = item.unit?.trim();
  if (!currentUnit) {
    return EMPTY_UNIT_OPTION;
  }

  return knownUnits.some((unit) => unit.trim() === currentUnit) ? currentUnit : CUSTOM_UNIT_OPTION;
}

function showsCustomUnitInput(item: ReceiptItemInput, knownUnits: string[]): boolean {
  return !isPerPoundItem(item) && getUnitSelectValue(item, knownUnits) === CUSTOM_UNIT_OPTION;
}

function getRegularUnitOptions(knownUnits: string[], currentUnit: string | null): string[] {
  return getUnitSelectOptions(knownUnits, currentUnit).filter((unit) => !unit.startsWith("/"));
}

function shouldToggleExcluded(item: ReceiptItemInput): boolean {
  return Boolean(
    item.receipt_item_name?.trim() ||
      item.item_name?.trim() ||
      item.price !== null ||
      item.amount !== null ||
      item.quantity !== null ||
      item.unit?.trim()
  );
}

function formatCurrency(value: number | null | undefined, fallback = "No total"): string {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : fallback;
}

function getExcludedTotal(items: Array<Pick<ReceiptItemInput, "is_excluded" | "price">>): number {
  return Number(items.reduce((total, item) => total + (item.is_excluded ? item.price ?? 0 : 0), 0).toFixed(2));
}

function getAdjustedTotal(receiptTotal: number | null | undefined, excludedTotal: number): number | null {
  if (typeof receiptTotal !== "number" || !Number.isFinite(receiptTotal)) {
    return null;
  }

  return Number((receiptTotal - excludedTotal).toFixed(2));
}

function formatTaxSuffix(receiptTax: number | null | undefined): string {
  return typeof receiptTax === "number" && Number.isFinite(receiptTax) ? ` (${receiptTax.toFixed(2)})` : "";
}

function displayTextValue(value: string | null | undefined): string {
  const nextValue = value?.trim();
  return !nextValue || nextValue === "Unknown item" || nextValue === "UNKNOWN ITEM" ? "-" : nextValue;
}

function displayNumberValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toString() : "-";
}

export function ReceiptDetailEditor({
  initialReceipt,
  initialItems
}: ReceiptDetailEditorProps): ReactElement {
  const router = useRouter();
  const [receipt, setReceipt] = useState(initialReceipt);
  const [items, setItems] = useState(initialItems);
  const [knownUnits, setKnownUnits] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [draftReceipt, setDraftReceipt] = useState(initialReceipt);
  const [draftItems, setDraftItems] = useState<ReceiptItemInput[]>(buildEditableItems(initialItems));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [suggestionItem, setSuggestionItem] = useState<ReceiptItemRecord | null>(null);
  const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false);

  useEffect(() => {
    setReceipt(initialReceipt);
    setItems(initialItems);
    setDraftReceipt(initialReceipt);
    setDraftItems(buildEditableItems(initialItems));
  }, [initialReceipt, initialItems]);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/units");
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { units: string[] };
      setKnownUnits(data.units);
    })();
  }, []);

  function startEditing(): void {
    setDraftReceipt(receipt);
    setDraftItems(buildEditableItems(items));
    setStatus(null);
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing(): void {
    setDraftReceipt(receipt);
    setDraftItems(buildEditableItems(items));
    setStatus(null);
    setError(null);
    setIsEditing(false);
  }

  function updateDraftReceipt(field: "store_name" | "purchase_date" | "receipt_total" | "receipt_tax", value: string): void {
    setDraftReceipt((current) => ({
      ...current,
      [field]: field === "receipt_total" || field === "receipt_tax" ? sanitizeNumericValue(value) : value
    }));
  }

  function updateDraftItem(index: number, recipe: (item: ReceiptItemInput) => ReceiptItemInput): void {
    setDraftItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        return recipe(item);
      })
    );
  }

  function updateDraftItemField(index: number, field: keyof ReceiptItemInput, value: string): void {
    updateDraftItem(index, (item) => {
      if (field === "amount" || field === "quantity" || field === "price" || field === "price_per_unit") {
        const nextValue = sanitizeNumericValue(value);
        if (field === "price" && isPerPoundItem(item)) {
          return applyPerPoundFields({ ...item, price: nextValue }, item.price_per_unit ?? null);
        }

        if (field === "price_per_unit") {
          return applyPerPoundFields(item, nextValue);
        }

        return { ...item, [field]: nextValue };
      }

      return { ...item, [field]: value.trim() ? value : null };
    });
  }

  function updateDraftItemUnitSelection(index: number, value: string): void {
    updateDraftItem(index, (item) => {
      if (value === PER_POUND_OPTION) {
        return applyPerPoundFields(item, item.price_per_unit ?? null);
      }

      return {
        ...item,
        unit: value === EMPTY_UNIT_OPTION ? null : value === CUSTOM_UNIT_OPTION ? item.unit : value,
        price_per_unit: null,
        is_per_pound: false
      };
    });
  }

  function addRow(): void {
    setDraftItems((current) => [...current, buildEmptyRow()]);
  }

  function handleRowDelete(index: number): void {
    const item = draftItems[index];
    if (!item) {
      return;
    }

    if (shouldToggleExcluded(item)) {
      updateDraftItem(index, (currentItem) => ({
        ...currentItem,
        is_excluded: !currentItem.is_excluded
      }));
      return;
    }

    setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSave(): Promise<void> {
    setStatus("Saving changes...");
    setError(null);

    const response = await fetch(`/api/receipts/${receipt.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_name: draftReceipt.store_name,
        purchase_date: draftReceipt.purchase_date,
        receipt_total: draftReceipt.receipt_total,
        receipt_tax: draftReceipt.receipt_tax,
        items: draftItems,
        llm_items: draftItems.map((item, index) => ({
          ...item,
          llm_item_name: items[index]?.llm_item_name ?? item.llm_item_name,
          llm_item_type: items[index]?.llm_item_type ?? item.llm_item_type,
          llm_item_category: items[index]?.llm_item_category ?? item.llm_item_category
        }))
      })
    });

    const data = (await response.json()) as
      | { error: string }
      | { receipt: ReceiptRecord; items: ReceiptItemRecord[] };

    if (!response.ok || "error" in data) {
      setError(("error" in data ? data.error : "Save failed.") || "Save failed.");
      setStatus(null);
      return;
    }

    setReceipt(data.receipt);
    setItems(data.items);
    setDraftReceipt(data.receipt);
    setDraftItems(buildEditableItems(data.items));
    setStatus("Receipt updated.");
    setError(null);
    setIsEditing(false);
    router.refresh();
  }

  async function handleDelete(): Promise<void> {
    const confirmed = window.confirm("Delete this receipt permanently?");
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setStatus(null);

    const response = await fetch(`/api/receipts/${receipt.id}`, {
      method: "DELETE"
    });

    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Delete failed.");
      setIsDeleting(false);
      return;
    }

    router.push("/?tab=history");
    router.refresh();
  }

  async function acceptSuggestion(): Promise<void> {
    if (!suggestionItem) {
      return;
    }

    setIsApplyingSuggestion(true);
    setError(null);

    const response = await fetch("/api/mappings/accept-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt_item_id: suggestionItem.id })
    });

    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Suggestion update failed.");
      setIsApplyingSuggestion(false);
      return;
    }

    const detailResponse = await fetch(`/api/receipts/${receipt.id}`);
    const detail = (await detailResponse.json()) as { receipt: ReceiptRecord; items: ReceiptItemRecord[]; error?: string };
    if (!detailResponse.ok || detail.error) {
      setError(detail.error ?? "Refresh failed.");
      setIsApplyingSuggestion(false);
      return;
    }

    setReceipt(detail.receipt);
    setItems(detail.items);
    setDraftReceipt(detail.receipt);
    setDraftItems(buildEditableItems(detail.items));
    setSuggestionItem(null);
    setIsApplyingSuggestion(false);
    setStatus("Mapping updated from suggestion.");
    router.refresh();
  }

  async function declineSuggestion(): Promise<void> {
    if (!suggestionItem) {
      return;
    }

    setIsApplyingSuggestion(true);
    setError(null);

    const response = await fetch("/api/mappings/decline-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt_item_id: suggestionItem.id })
    });

    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Suggestion decline failed.");
      setIsApplyingSuggestion(false);
      return;
    }

    const detailResponse = await fetch(`/api/receipts/${receipt.id}`);
    const detail = (await detailResponse.json()) as { receipt: ReceiptRecord; items: ReceiptItemRecord[]; error?: string };
    if (!detailResponse.ok || detail.error) {
      setError(detail.error ?? "Refresh failed.");
      setIsApplyingSuggestion(false);
      return;
    }

    setReceipt(detail.receipt);
    setItems(detail.items);
    setDraftReceipt(detail.receipt);
    setDraftItems(buildEditableItems(detail.items));
    setSuggestionItem(null);
    setIsApplyingSuggestion(false);
    router.refresh();
  }

  const draftExcludedTotal = getExcludedTotal(draftItems);
  const draftAdjustedTotal = getAdjustedTotal(draftReceipt.receipt_total, draftExcludedTotal);
  const savedExcludedTotal = receipt.excluded_total;
  const savedAdjustedTotal = getAdjustedTotal(receipt.receipt_total, savedExcludedTotal);

  return (
    <main className="page-shell">
      <datalist id="detail-known-units">
        {knownUnits.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
      <div className="app-frame">
        <div className="app-card">
          <header className="hero">
            <div className="stack">
              <Link href="/?tab=history">Back</Link>
              <div className="history-header">
                <div>
                  {isEditing ? (
                    <>
                      <h1>Edit receipt</h1>
                      <p className="muted">Receipt ID: {receipt.receipt_id}</p>
                    </>
                  ) : (
                    <h1>{receipt.store_name}</h1>
                  )}
                  {!isEditing ? (
                    <p>
                      {receipt.purchase_date || "No date"} • {formatCurrency(savedAdjustedTotal)}
                      {formatTaxSuffix(receipt.receipt_tax)} • {receipt.item_count} items
                      {savedExcludedTotal > 0 ? ` • excl. ${formatCurrency(savedExcludedTotal, "$0.00")}` : ""}
                    </p>
                  ) : null}
                </div>
                {!isEditing ? (
                  <div className="action-icons">
                    <button
                      aria-label="Edit receipt"
                      className="icon-button"
                      onClick={startEditing}
                      title="Edit receipt"
                      type="button"
                    >
                      <span aria-hidden="true">✎</span>
                    </button>
                    <button
                      aria-label="Delete receipt"
                      className="icon-button danger"
                      disabled={isDeleting}
                      onClick={() => void handleDelete()}
                      title="Delete receipt"
                      type="button"
                    >
                      <span aria-hidden="true">x</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>
          <div className="content stack">
            {isEditing ? (
              <section className="panel">
                <div className="receipt-edit-grid">
                  <label className="label">
                    Store
                    <input
                      className="field"
                      value={draftReceipt.store_name}
                      onChange={(event) => updateDraftReceipt("store_name", event.target.value)}
                    />
                  </label>
                  <label className="label">
                    Date
                    <input
                      className="field"
                      type="date"
                      value={draftReceipt.purchase_date}
                      onChange={(event) => updateDraftReceipt("purchase_date", event.target.value)}
                    />
                  </label>
                  <label className="label">
                    Total
                    <input
                      className="field"
                      type="number"
                      step="0.01"
                      value={draftReceipt.receipt_total ?? ""}
                      onChange={(event) => updateDraftReceipt("receipt_total", event.target.value)}
                      placeholder="Receipt total"
                    />
                  </label>
                  <label className="label">
                    Tax
                    <input
                      className="field"
                      type="number"
                      step="0.01"
                      value={draftReceipt.receipt_tax ?? ""}
                      onChange={(event) => updateDraftReceipt("receipt_tax", event.target.value)}
                      placeholder="Tax"
                    />
                  </label>
                </div>
                <div className="receipt-summary muted">
                  {draftReceipt.purchase_date || "No date"} • {formatCurrency(draftAdjustedTotal)}
                  {formatTaxSuffix(draftReceipt.receipt_tax)}
                  {draftExcludedTotal > 0 ? ` • excl. ${formatCurrency(draftExcludedTotal, "$0.00")}` : ""}
                </div>
              </section>
            ) : null}

            {!isEditing && status ? <div className="pill">{status}</div> : null}
            {error && !isEditing ? <div className="error">{error}</div> : null}

            <section className="panel stack">
              <div className="row spread">
                <h2 className="section-title">Saved items</h2>
              </div>
              <div className="item-table-shell">
                <div className="table item-table">
                  <div className="table-head table-head-item-editor">
                    <span>Item Name</span>
                    <span>Amount</span>
                    <span>Unit</span>
                    <span>Quantity</span>
                    <span>Price</span>
                    {isEditing ? <span className="table-head-spacer" aria-hidden="true" /> : null}
                  </div>
                  {isEditing
                    ? draftItems.map((item, index) => (
                        <div className="table-row table-row-item-editor" key={`${item.receipt_item_name}-${index}`}>
                          <div className="stack compact">
                            <input
                              className="field"
                              value={item.item_name}
                              onChange={(event) => updateDraftItemField(index, "item_name", event.target.value)}
                              placeholder="Item name"
                            />
                            <input
                              className="field"
                              value={item.receipt_item_name}
                              onChange={(event) => updateDraftItemField(index, "receipt_item_name", event.target.value)}
                              placeholder="Receipt item name"
                            />
                          </div>
                          <input
                            className="field"
                            type="number"
                            step="0.25"
                            value={item.amount ?? ""}
                            disabled={isPerPoundItem(item)}
                            onChange={(event) => updateDraftItemField(index, "amount", event.target.value)}
                            placeholder="Amount"
                          />
                          <div className="stack compact">
                            <div className={`unit-input-row ${isPerPoundItem(item) ? "per-pound" : ""}`}>
                              {isPerPoundItem(item) ? (
                                <input
                                  className="field"
                                  type="number"
                                  step="0.01"
                                  value={item.price_per_unit ?? ""}
                                  onChange={(event) => updateDraftItemField(index, "price_per_unit", event.target.value)}
                                  placeholder="Price/lb"
                                />
                              ) : null}
                              <select
                                className="field select-field"
                                value={getUnitSelectValue(item, knownUnits)}
                                onChange={(event) => updateDraftItemUnitSelection(index, event.target.value)}
                              >
                                <option value={EMPTY_UNIT_OPTION}>Unit</option>
                                <optgroup label="Unit">
                                  {getRegularUnitOptions(knownUnits, item.unit).map((unit) => (
                                    <option key={unit} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Per unit">
                                  <option value={PER_POUND_OPTION}>/ lb</option>
                                </optgroup>
                                <option value={CUSTOM_UNIT_OPTION}>Custom</option>
                              </select>
                            </div>
                            {showsCustomUnitInput(item, knownUnits) ? (
                              <input
                                className="field"
                                value={item.unit ?? ""}
                                onChange={(event) => updateDraftItemField(index, "unit", event.target.value)}
                                placeholder="Custom unit"
                              />
                            ) : null}
                          </div>
                          <input
                            className="field"
                            type="number"
                            step="0.01"
                            value={item.quantity ?? ""}
                            disabled={isPerPoundItem(item)}
                            onChange={(event) => updateDraftItemField(index, "quantity", event.target.value)}
                            placeholder="Qty"
                          />
                          <input
                            className="field"
                            type="number"
                            step="0.01"
                            value={item.price ?? ""}
                            onChange={(event) => updateDraftItemField(index, "price", event.target.value)}
                            placeholder="Price"
                          />
                          <button
                            className="icon-button small danger"
                            onClick={() => handleRowDelete(index)}
                            type="button"
                            aria-label={item.is_excluded ? "Restore row" : "Delete row"}
                            title={item.is_excluded ? "Restore row" : "Delete row"}
                          >
                            <span aria-hidden="true">x</span>
                          </button>
                        </div>
                      ))
                    : items.map((item) => (
                        <div className="table-row table-row-item-saved" key={item.id}>
                          <div className="item-name-cell">
                            <div className="row gap-sm">
                              <strong>{displayTextValue(item.item_name)}</strong>
                              {item.has_mapping_mismatch ? (
                                <button className="link-button" onClick={() => setSuggestionItem(item)} type="button" title="Review suggested metadata">
                                  *
                                </button>
                              ) : null}
                              {item.is_excluded ? <span className="pill">Excluded</span> : null}
                            </div>
                            <span className="item-name-secondary">({displayTextValue(item.receipt_item_name)})</span>
                          </div>
                          <span>{displayNumberValue(item.amount)}</span>
                          <span>{displayTextValue(item.unit)}</span>
                          <span>{displayNumberValue(item.quantity)}</span>
                          <span>{formatCurrency(item.price, "-")}</span>
                        </div>
                      ))}
                </div>
              </div>
            </section>
            {isEditing ? (
              <section className="panel">
                {status ? <div className="pill">{status}</div> : null}
                {error ? <div className="error">{error}</div> : null}
                <div className="row receipt-edit-actions">
                  <button className="button ghost" onClick={addRow} type="button">
                    Add row
                  </button>
                  <button className="button ghost" onClick={cancelEditing} type="button">
                    Cancel
                  </button>
                  <button className="button primary" onClick={() => void handleSave()} type="button">
                    Save changes
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </div>
        <BottomTabBar activeTab="history" />
      </div>

      {suggestionItem ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" aria-modal="true" role="dialog">
            <div className="row spread">
              <h2 className="section-title">Review suggestion</h2>
              <button className="icon-button" onClick={() => setSuggestionItem(null)} type="button" aria-label="Close suggestion">
                <span aria-hidden="true">x</span>
              </button>
            </div>
            <div className="stack compact">
              <div className="muted">Receipt item</div>
              <strong>{suggestionItem.receipt_item_name}</strong>
            </div>
            <div className="table">
              <div className="table-head table-head-modal-comparison">
                <span>Source</span>
                <span>Item Name</span>
                <span>Type</span>
                <span>Category</span>
              </div>
              <div className="table-row modal-comparison-row">
                <span>Current mapping</span>
                <span>{displayTextValue(suggestionItem.item_name)}</span>
                <span>{displayTextValue(suggestionItem.item_type)}</span>
                <span>{displayTextValue(suggestionItem.item_category)}</span>
              </div>
              <div className="table-row modal-comparison-row">
                <span>LLM suggestion</span>
                <span>{displayTextValue(suggestionItem.llm_item_name)}</span>
                <span>{displayTextValue(suggestionItem.llm_item_type)}</span>
                <span>{displayTextValue(suggestionItem.llm_item_category)}</span>
              </div>
            </div>
            <div className="row receipt-edit-actions">
              <button className="button ghost" disabled={isApplyingSuggestion} onClick={() => void declineSuggestion()} type="button">
                Decline
              </button>
              <button className="button primary" disabled={isApplyingSuggestion} onClick={() => void acceptSuggestion()} type="button">
                Accept Suggestion
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

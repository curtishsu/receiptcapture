"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type ReactElement
} from "react";
import Link from "next/link";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut
} from "firebase/auth";
import { BottomTabBar, type TabKey } from "@/components/bottom-tab-bar";
import { StatsTimeSeriesChart } from "@/components/stats-time-series-chart";
import { getFirebaseClientAuth } from "@/lib/firebase-client";
import type {
  ItemMappingRecord,
  MappingInput,
  ParsedReceipt,
  ReceiptItemInput,
  ReceiptRecord,
  StatsDateBucket,
  StatsMetric,
  StatsSubjectKind,
  StatsSubjectOption,
  StatsResponse
} from "@/lib/types";

type SessionUser = {
  id: string;
  email: string;
};

type AppShellProps = {
  initialSessionUser: SessionUser | null;
  initialTab: TabKey;
};

type StatsRangePreset = "all_time" | "last_365" | "last_30" | "last_7" | "custom";

const PER_POUND_OPTION = "__per_pound__";
const EMPTY_UNIT_OPTION = "__empty_unit__";
const CUSTOM_UNIT_OPTION = "__custom_unit__";

const EMPTY_STATS: StatsResponse = {
  spend_last_7_days: 0,
  spend_last_30_days: 0,
  filters: {
    subject_options: []
  },
  deep_dive: {
    selected_subject: null,
    metric: "quantity",
    date_bucket: "month",
    series: [],
    series_unit_label: null,
    series_unit_tooltip: null,
    top_items: []
  }
};

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftIsoDate(daysBack: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

function formatStatsValue(metric: StatsMetric, value: number): string {
  if (metric === "dollars") {
    return `$${value.toFixed(2)}`;
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function getStatsDisplayValue(
  metric: StatsMetric,
  item: StatsResponse["deep_dive"]["top_items"][number]
): number {
  if (metric === "dollars") {
    return item.dollars;
  }

  if (metric === "total_amount") {
    return item.total_amount;
  }

  return item.quantity;
}

function getStatsSubjectKindLabel(kind: StatsSubjectKind): string {
  if (kind === "item") {
    return "Food item";
  }

  if (kind === "type") {
    return "Food type";
  }

  return "Category";
}

function getStatsDateRange(rangePreset: StatsRangePreset, startDate: string, endDate: string): { startDate?: string; endDate?: string } {
  if (rangePreset === "custom") {
    return {
      startDate: startDate || undefined,
      endDate: endDate || undefined
    };
  }

  if (rangePreset === "last_365") {
    return { startDate: shiftIsoDate(365), endDate: isoDateToday() };
  }

  if (rangePreset === "last_30") {
    return { startDate: shiftIsoDate(30), endDate: isoDateToday() };
  }

  if (rangePreset === "last_7") {
    return { startDate: shiftIsoDate(7), endDate: isoDateToday() };
  }

  return {};
}

function getProfileLabel(email: string): string {
  return email.trim().charAt(0).toUpperCase() || "?";
}

function getAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : "";

  if (code === "auth/email-already-in-use") {
    return "That email already has an account. Sign in instead.";
  }

  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "Email or password is incorrect.";
  }

  if (code === "auth/weak-password") {
    return "Password must be at least 6 characters.";
  }

  if (code === "auth/invalid-email") {
    return "Enter a valid email address.";
  }

  if (code === "auth/configuration-not-found" || code === "auth/operation-not-allowed") {
    return "Firebase email/password authentication is not enabled for this project.";
  }

  if (error instanceof Error && error.message.includes("Missing Firebase client config")) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to authenticate with Firebase.";
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

function formatCurrency(value: number | null | undefined, fallback = "No total"): string {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : fallback;
}

function getExcludedTotal(items: ReceiptItemInput[]): number {
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

function toTitleCase(value: string | null | undefined): string | null {
  const nextValue = value?.trim();
  if (!nextValue) {
    return null;
  }

  return nextValue
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function mappingToInput(mapping: ItemMappingRecord): MappingInput {
  return {
    id: mapping.id,
    store_name: mapping.store_name,
    receipt_item_name: mapping.receipt_item_name,
    item_name: mapping.item_name,
    item_type: toTitleCase(mapping.item_type),
    item_category: mapping.item_category
  };
}

const MAPPING_FIELD_LABELS = {
  store_name: "Store",
  receipt_item_name: "Receipt item",
  item_name: "Canonical item",
  item_type: "Type",
  item_category: "Category"
} as const;

export function AppShell({ initialSessionUser, initialTab }: AppShellProps): ReactElement {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(initialSessionUser);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [llmItems, setLlmItems] = useState<ReceiptItemInput[]>([]);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [stats, setStats] = useState<StatsResponse>(EMPTY_STATS);
  const [history, setHistory] = useState<ReceiptRecord[]>([]);
  const [mappings, setMappings] = useState<ItemMappingRecord[]>([]);
  const [mappingDrafts, setMappingDrafts] = useState<MappingInput[]>([]);
  const [deletedMappingIds, setDeletedMappingIds] = useState<string[]>([]);
  const [isMappingEditing, setIsMappingEditing] = useState(false);
  const [mappingSaveMessage, setMappingSaveMessage] = useState<string | null>(null);
  const [knownUnits, setKnownUnits] = useState<string[]>([]);
  const [statsMetric, setStatsMetric] = useState<StatsMetric>("quantity");
  const [statsSubjectKind, setStatsSubjectKind] = useState<StatsSubjectKind | null>(null);
  const [statsSubjectValue, setStatsSubjectValue] = useState("");
  const [statsSubjectSearch, setStatsSubjectSearch] = useState("");
  const [statsDateBucket, setStatsDateBucket] = useState<StatsDateBucket>("month");
  const [isStatsSubjectMenuOpen, setIsStatsSubjectMenuOpen] = useState(false);
  const [statsRangePreset, setStatsRangePreset] = useState<StatsRangePreset>("all_time");
  const [statsStartDate, setStatsStartDate] = useState("");
  const [statsEndDate, setStatsEndDate] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const statsSubjectMenuRef = useRef<HTMLDivElement | null>(null);

  async function loadSession(): Promise<void> {
    const response = await fetch("/api/auth/session");
    const data = (await response.json()) as { user: SessionUser | null };
    setSessionUser(data.user);
  }

  async function loadHistory(): Promise<void> {
    if (!sessionUser) {
      return;
    }

    const response = await fetch("/api/receipts");
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { receipts: ReceiptRecord[] };
    setHistory(data.receipts);
  }

  async function loadStats(): Promise<void> {
    if (!sessionUser) {
      return;
    }

    const { startDate, endDate } = getStatsDateRange(statsRangePreset, statsStartDate, statsEndDate);
    const searchParams = new URLSearchParams({ metric: statsMetric });
    if (startDate) {
      searchParams.set("startDate", startDate);
    }
    if (endDate) {
      searchParams.set("endDate", endDate);
    }
    searchParams.set("dateBucket", statsDateBucket);
    if (statsSubjectKind && statsSubjectValue) {
      searchParams.set("subjectKind", statsSubjectKind);
      searchParams.set("subjectValue", statsSubjectValue);
    }

    const response = await fetch(`/api/stats?${searchParams.toString()}`);
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as StatsResponse;
    setStats(data);
  }

  async function loadKnownUnits(): Promise<void> {
    if (!sessionUser) {
      return;
    }

    const response = await fetch("/api/units");
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { units: string[] };
    setKnownUnits(data.units);
  }

  async function loadMappings(): Promise<void> {
    if (!sessionUser) {
      return;
    }

    const response = await fetch("/api/mappings");
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { mappings: ItemMappingRecord[] };
    setMappings(data.mappings);
    if (!isMappingEditing) {
      setMappingDrafts(data.mappings.map(mappingToInput));
      setDeletedMappingIds([]);
    }
  }

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    startTransition(() => {
      void loadSession();
    });
  }, []);

  useEffect(() => {
    if (!sessionUser) {
      return;
    }

    startTransition(() => {
      void Promise.all([loadHistory(), loadKnownUnits(), loadMappings()]);
    });
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser) {
      return;
    }

    startTransition(() => {
      void loadStats();
    });
  }, [sessionUser, statsMetric, statsSubjectKind, statsSubjectValue, statsDateBucket, statsRangePreset, statsStartDate, statsEndDate]);

  useEffect(() => {
    if (!isProfileOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isProfileOpen]);

  useEffect(() => {
    if (!isStatsSubjectMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (!statsSubjectMenuRef.current?.contains(event.target as Node)) {
        setIsStatsSubjectMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isStatsSubjectMenuOpen]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAuthError(null);
    setIsAuthenticating(true);

    try {
      const auth = getFirebaseClientAuth();
      const email = authEmail.trim();
      const credential = await signInWithEmailAndPassword(auth, email, authPassword);
      const idToken = await credential.user.getIdToken();

      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setAuthError(data.error ?? "Unable to start an app session.");
        return;
      }

      await loadSession();
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    try {
      await firebaseSignOut(getFirebaseClientAuth());
    } catch {
      // The server session is still cleared below.
    }

    await fetch("/api/auth/sign-out", { method: "POST" });
    setIsProfileOpen(false);
    setSessionUser(null);
    setReceipt(null);
    setLlmItems([]);
    setHistory([]);
    setMappings([]);
    setMappingDrafts([]);
    setDeletedMappingIds([]);
    setStats(EMPTY_STATS);
    setKnownUnits([]);
    setStatsMetric("quantity");
    setStatsSubjectKind(null);
    setStatsSubjectValue("");
    setStatsSubjectSearch("");
    setStatsDateBucket("month");
    setIsStatsSubjectMenuOpen(false);
    setStatsRangePreset("all_time");
    setStatsStartDate("");
    setStatsEndDate("");
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSelectedFileName(file.name);
    setStatus("Parsing receipt...");
    setError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const response = await fetch("/api/parse-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_data_url: reader.result, upload_date: isoDateToday() })
        });
        const data = (await response.json()) as ParsedReceipt & { error?: string };
        if (!response.ok) {
          setError(data.error ?? "Parse failed.");
          return;
        }

        const normalizedItems = data.items.map((item) => ({ ...item }));
        setReceipt({ ...data, items: normalizedItems });
        setLlmItems(normalizedItems.map((item) => ({ ...item })));
        setStatus("Receipt parsed. Review rows before saving.");
      } catch (parseError) {
        setError(parseError instanceof Error ? parseError.message : "Parse failed.");
      }
    };
    reader.readAsDataURL(file);
  }

  function updateReceiptField(field: "store_name" | "purchase_date" | "receipt_total" | "receipt_tax", value: string): void {
    setReceipt((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: field === "receipt_total" || field === "receipt_tax" ? sanitizeNumericValue(value) : value
      };
    });
  }

  function updateItem(index: number, recipe: (item: ReceiptItemInput) => ReceiptItemInput): void {
    setReceipt((current) => {
      if (!current) {
        return current;
      }

      const nextItems = current.items.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        return recipe(item);
      });

      return { ...current, items: nextItems };
    });
  }

  function updateItemField(index: number, field: keyof ReceiptItemInput, value: string): void {
    updateItem(index, (item) => {
      if (field === "amount" || field === "quantity" || field === "price" || field === "price_per_unit") {
        const nextValue = sanitizeNumericValue(value);
        if (field === "price" && isPerPoundItem(item)) {
          return applyPerPoundFields({ ...item, price: nextValue }, item.price_per_unit ?? null);
        }

        if (field === "price_per_unit") {
          return applyPerPoundFields(item, nextValue);
        }

        return {
          ...item,
          [field]: nextValue
        };
      }

      return {
        ...item,
        [field]: value.trim() ? value : null
      };
    });
  }

  function updateItemUnitSelection(index: number, value: string): void {
    updateItem(index, (item) => {
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
    setReceipt((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: [...current.items, buildEmptyRow()]
      };
    });
    setLlmItems((current) => [...current, buildEmptyRow()]);
  }

  function handleRowDelete(index: number): void {
    const item = receipt?.items[index];
    if (!item) {
      return;
    }

    if (shouldToggleExcluded(item)) {
      updateItem(index, (currentItem) => ({
        ...currentItem,
        is_excluded: !currentItem.is_excluded
      }));
      return;
    }

    setReceipt((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index)
      };
    });
    setLlmItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSave(): Promise<void> {
    if (!receipt) {
      return;
    }

    setStatus("Saving receipt...");
    setError(null);

    const response = await fetch("/api/save-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_name: receipt.store_name,
        purchase_date: receipt.purchase_date,
        receipt_total: receipt.receipt_total,
        receipt_tax: receipt.receipt_tax,
        items: receipt.items,
        llm_items: receipt.items.map((item, index) => {
          const original = llmItems[index];
          return {
            ...item,
            item_name: original?.item_name ?? item.llm_item_name ?? item.item_name,
            item_type: original?.item_type ?? item.llm_item_type ?? item.item_type,
            item_category: original?.item_category ?? item.llm_item_category ?? item.item_category,
            llm_item_name: original?.llm_item_name ?? item.llm_item_name,
            llm_item_type: original?.llm_item_type ?? item.llm_item_type,
            llm_item_category: original?.llm_item_category ?? item.llm_item_category
          };
        })
      })
    });

    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Save failed.");
      return;
    }

    setStatus(null);
    setReceipt(null);
    setLlmItems([]);
    setSelectedFileName("");
    await Promise.all([loadHistory(), loadStats(), loadKnownUnits(), loadMappings()]);
    setActiveTab("history");
  }

  function startMappingEdit(): void {
    setMappingDrafts(mappings.map(mappingToInput));
    setDeletedMappingIds([]);
    setIsMappingEditing(true);
    setMappingSaveMessage(null);
    setStatus(null);
    setError(null);
  }

  function cancelMappingEdit(): void {
    setMappingDrafts(mappings.map(mappingToInput));
    setDeletedMappingIds([]);
    setIsMappingEditing(false);
    setMappingSaveMessage(null);
  }

  function updateMappingDraft(index: number, field: keyof MappingInput, value: string): void {
    setMappingSaveMessage(null);
    setMappingDrafts((current) =>
      current.map((mapping, mappingIndex) => {
        if (mappingIndex !== index) {
          return mapping;
        }

        if (field === "item_type" || field === "item_category") {
          return { ...mapping, [field]: value.trim() || null };
        }

        return { ...mapping, [field]: value };
      })
    );
  }

  function stageDeleteMapping(index: number): void {
    setMappingSaveMessage(null);
    setMappingDrafts((current) => {
      const mapping = current[index];
      if (!mapping) {
        return current;
      }

      if (mapping.id) {
        setDeletedMappingIds((existing) => [...existing, mapping.id!]);
      }

      return current.filter((_, mappingIndex) => mappingIndex !== index);
    });
  }

  async function saveMappingChanges(): Promise<void> {
    setStatus("Saving mappings...");
    setMappingSaveMessage(null);
    setError(null);

    const response = await fetch("/api/mappings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: mappingDrafts,
        delete_ids: deletedMappingIds
      })
    });

    const data = (await response.json()) as { error?: string; mappings?: ItemMappingRecord[] };
    if (!response.ok || !data.mappings) {
      setError(data.error ?? "Mapping update failed.");
      setStatus(null);
      return;
    }

    setMappings(data.mappings);
    setMappingDrafts(data.mappings.map(mappingToInput));
    setDeletedMappingIds([]);
    setIsMappingEditing(false);
    setStatus(null);
    setMappingSaveMessage("Mapping changes saved.");
    await loadStats();
  }

  const visibleMappings = isMappingEditing ? mappingDrafts : mappings.map(mappingToInput);
  const selectedStatsSubject =
    stats.filters.subject_options.find((option) => option.kind === statsSubjectKind && option.value === statsSubjectValue) ?? null;
  const statsTopItems = stats.deep_dive.top_items;
  const receiptExcludedTotal = receipt ? getExcludedTotal(receipt.items) : 0;
  const receiptAdjustedTotal = receipt ? getAdjustedTotal(receipt.receipt_total, receiptExcludedTotal) : null;
  const filteredStatsSubjectOptions = stats.filters.subject_options.filter((option) => {
    const query = statsSubjectSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return option.label.toLowerCase().includes(query) || getStatsSubjectKindLabel(option.kind).toLowerCase().includes(query);
  });

  function selectStatsSubject(option: StatsSubjectOption | null): void {
    setStatsSubjectKind(option?.kind ?? null);
    setStatsSubjectValue(option?.value ?? "");
    setStatsSubjectSearch("");
    setIsStatsSubjectMenuOpen(false);
  }

  function toggleStatsSubjectMenu(): void {
    setIsStatsSubjectMenuOpen((current) => {
      const next = !current;
      if (!next) {
        setStatsSubjectSearch("");
      }
      return next;
    });
  }

  return (
    <main className="page-shell">
      <datalist id="known-units">
        {knownUnits.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
      <div className="app-frame">
        <div className="app-card">
          <header className="hero">
            <div className="hero-top">
              <div>
                <p className="pill">Receipt Tracker v2</p>
                <h1>Groceries in, patterns out.</h1>
              </div>
              {sessionUser ? (
                <div className="profile-menu" ref={profileMenuRef}>
                  <button
                    aria-expanded={isProfileOpen}
                    aria-haspopup="menu"
                    className="profile-button"
                    onClick={() => setIsProfileOpen((current) => !current)}
                    type="button"
                  >
                    {getProfileLabel(sessionUser.email)}
                  </button>
                  {isProfileOpen ? (
                    <div className="profile-popover" role="menu">
                      <strong>{sessionUser.email}</strong>
                      <div className="muted">Receipts, mappings, and stats stay scoped to this account.</div>
                      <button className="button ghost" onClick={() => void handleSignOut()} type="button">
                        Sign out
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </header>

          <div className="content stack">
            {!sessionUser ? (
              <section className="panel stack">
                <div>
                  <h2 className="section-title">Sign in</h2>
                  <p className="muted">Use your approved Firebase email and password. Receipts, mappings, and history stay scoped to your account.</p>
                </div>
                <form className="stack" onSubmit={(event) => void handleSignIn(event)}>
                  <label className="label">
                    Email
                    <input
                      className="field"
                      autoComplete="email"
                      required
                      type="email"
                      placeholder="you@example.com"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                    />
                  </label>
                  <label className="label">
                    Password
                    <input
                      className="field"
                      autoComplete="current-password"
                      minLength={6}
                      required
                      type="password"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                    />
                  </label>
                  {authError ? <div className="error">{authError}</div> : null}
                  <button className="button primary" disabled={isAuthenticating} type="submit">
                    {isAuthenticating ? "Working..." : "Sign in"}
                  </button>
                </form>
              </section>
            ) : (
              <>
                {status ? (
                  <section className="panel row spread">
                    <span className="pill">{status}</span>
                  </section>
                ) : null}

                {activeTab === "photo" ? (
                  <section className="stack">
                    <div className="panel stack">
                      <div className="upload-box">
                        <strong>Upload or photograph a grocery receipt</strong>
                        <div className="muted">The image is sent for parsing and is not persisted after inference.</div>
                        <label className="upload-button">
                          Choose receipt image
                          <input hidden type="file" accept="image/*" capture="environment" onChange={(event) => void handleFileChange(event)} />
                        </label>
                        {selectedFileName ? <div className="muted">Selected: {selectedFileName}</div> : null}
                      </div>
                      {error ? <div className="error">{error}</div> : null}
                    </div>

                    {receipt ? (
                      <>
                        <section className="panel stack">
                          <div className="grid-2">
                            <label className="label">
                              Store name
                              <input
                                className="field"
                                value={receipt.store_name}
                                onChange={(event) => updateReceiptField("store_name", event.target.value)}
                              />
                            </label>
                            <label className="label">
                              Purchase date
                              <input
                                className="field"
                                type="date"
                                value={receipt.purchase_date}
                                onChange={(event) => updateReceiptField("purchase_date", event.target.value)}
                              />
                            </label>
                          </div>
                          <div className="grid-2">
                            <label className="label">
                              Estimated total
                              <input
                                className="field"
                                type="number"
                                step="0.01"
                                value={receipt.receipt_total ?? ""}
                                onChange={(event) => updateReceiptField("receipt_total", event.target.value)}
                              />
                            </label>
                            <label className="label">
                              Tax
                              <input
                                className="field"
                                type="number"
                                step="0.01"
                                value={receipt.receipt_tax ?? ""}
                                onChange={(event) => updateReceiptField("receipt_tax", event.target.value)}
                                placeholder="Tax"
                              />
                            </label>
                          </div>
                          <div className="receipt-summary muted">
                            {receipt.purchase_date || "No date"} • {formatCurrency(receiptAdjustedTotal)}
                            {formatTaxSuffix(receipt.receipt_tax)}
                            {receiptExcludedTotal > 0 ? ` • excl. ${formatCurrency(receiptExcludedTotal, "$0.00")}` : ""}
                          </div>
                          {receipt.parse_warning ? <div className="muted">{receipt.parse_warning}</div> : null}
                        </section>

                        <section className="panel stack">
                          <div className="row spread">
                            <div>
                              <h2 className="section-title">Editable items</h2>
                              <div className="muted">Mappings win for saved item name, type, and category when they already exist.</div>
                            </div>
                            <button className="button ghost" onClick={addRow} type="button">
                              Add row
                            </button>
                          </div>
                          <div className="item-table-shell">
                            <div className="table item-table">
                              <div className="table-head table-head-item-editor">
                                <span>Item Name</span>
                                <span>Amount</span>
                                <span>Unit</span>
                                <span>Quantity</span>
                                <span>Price</span>
                                <span className="table-head-spacer" aria-hidden="true" />
                              </div>
                              {receipt.items.map((item, index) => (
                                <div className="table-row table-row-item-editor" key={`${item.receipt_item_name}-${index}`}>
                                  <div className="stack compact">
                                    <input
                                      className="field"
                                      value={item.item_name}
                                      onChange={(event) => updateItemField(index, "item_name", event.target.value)}
                                      placeholder="Item name"
                                    />
                                    <input
                                      className="field"
                                      value={item.receipt_item_name}
                                      onChange={(event) => updateItemField(index, "receipt_item_name", event.target.value)}
                                      placeholder="Receipt item name"
                                    />
                                    {item.prefill_source === "mapping" ? <span className="pill">Using mapping</span> : null}
                                  </div>
                                  <input
                                    className="field"
                                    type="number"
                                    step="0.25"
                                    value={item.amount ?? ""}
                                    disabled={isPerPoundItem(item)}
                                    onChange={(event) => updateItemField(index, "amount", event.target.value)}
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
                                          onChange={(event) => updateItemField(index, "price_per_unit", event.target.value)}
                                          placeholder="Price/lb"
                                        />
                                      ) : null}
                                      <select
                                        className="field select-field"
                                        value={getUnitSelectValue(item, knownUnits)}
                                        onChange={(event) => updateItemUnitSelection(index, event.target.value)}
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
                                        onChange={(event) => updateItemField(index, "unit", event.target.value)}
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
                                    onChange={(event) => updateItemField(index, "quantity", event.target.value)}
                                    placeholder="Qty"
                                  />
                                  <input
                                    className="field"
                                    type="number"
                                    step="0.01"
                                    value={item.price ?? ""}
                                    onChange={(event) => updateItemField(index, "price", event.target.value)}
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
                              ))}
                            </div>
                          </div>
                          <div className="save-bar">
                            <button className="button primary" disabled={isPending} onClick={() => void handleSave()} type="button">
                              Save receipt
                            </button>
                          </div>
                        </section>
                      </>
                    ) : (
                      <section className="empty-state">Upload a receipt to parse it into editable line items.</section>
                    )}
                  </section>
                ) : null}

                {activeTab === "stats" ? (
                  <section className="stack">
                    <div className="stats-grid">
                      <article className="stat-card">
                        <span className="muted">Spend L7 Days</span>
                        <strong>${stats.spend_last_7_days.toFixed(2)}</strong>
                      </article>
                      <article className="stat-card">
                        <span className="muted">Spend L30 Days</span>
                        <strong>${stats.spend_last_30_days.toFixed(2)}</strong>
                      </article>
                    </div>
                    <section className="panel stack">
                      <div className="stats-panel-header">
                        <h2 className="section-title">Food Deep Dive</h2>
                      </div>
                      <div className="stats-deep-dive-controls">
                          <div className="stats-subject-picker" ref={statsSubjectMenuRef}>
                            <div className="field stats-subject-trigger-shell">
                              <button
                                aria-expanded={isStatsSubjectMenuOpen}
                                aria-haspopup="listbox"
                                className="stats-subject-trigger"
                                onClick={toggleStatsSubjectMenu}
                                type="button"
                              >
                                <span className="stats-subject-trigger-label">
                                  {selectedStatsSubject?.label ?? "All foods"}
                                </span>
                                <span className={`stats-kind-chip ${selectedStatsSubject ? selectedStatsSubject.kind : "all"}`}>
                                  {selectedStatsSubject ? getStatsSubjectKindLabel(selectedStatsSubject.kind) : "All"}
                                </span>
                              </button>
                              {selectedStatsSubject ? (
                                <button
                                  aria-label="Clear food filter"
                                  className="stats-subject-clear"
                                  onClick={() => selectStatsSubject(null)}
                                  type="button"
                                >
                                  x
                                </button>
                              ) : null}
                            </div>
                            {isStatsSubjectMenuOpen ? (
                              <div className="stats-subject-menu" role="listbox">
                                <div className="stats-subject-search-shell">
                                  <input
                                    autoFocus
                                    className="field stats-subject-search"
                                    onChange={(event) => setStatsSubjectSearch(event.target.value)}
                                    placeholder="Search foods"
                                    type="text"
                                    value={statsSubjectSearch}
                                  />
                                </div>
                                <button className="stats-subject-option" onClick={() => selectStatsSubject(null)} type="button">
                                  <span>All foods</span>
                                  <span className="stats-kind-chip all">All</span>
                                </button>
                                {filteredStatsSubjectOptions.map((option) => (
                                  <button
                                    className="stats-subject-option"
                                    key={`${option.kind}-${option.value}`}
                                    onClick={() => selectStatsSubject(option)}
                                    type="button"
                                  >
                                    <span>{option.label}</span>
                                    <span className={`stats-kind-chip ${option.kind}`}>{getStatsSubjectKindLabel(option.kind)}</span>
                                  </button>
                                ))}
                                {filteredStatsSubjectOptions.length === 0 ? <div className="stats-subject-empty muted">No matching foods.</div> : null}
                              </div>
                              ) : null}
                          </div>
                          <label className="stats-inline-select">
                            <select
                              className="field stats-range-select"
                              value={statsRangePreset}
                              onChange={(event) => setStatsRangePreset(event.target.value as StatsRangePreset)}
                            >
                              <option value="all_time">All time</option>
                              <option value="last_365">Last 365</option>
                              <option value="last_30">Last 30</option>
                              <option value="last_7">Last 7</option>
                              <option value="custom">Custom date</option>
                            </select>
                          </label>
                          <label className="stats-inline-select">
                            <select className="field stats-metric-select" value={statsMetric} onChange={(event) => setStatsMetric(event.target.value as StatsMetric)}>
                              <option value="quantity">Quantity</option>
                              <option value="dollars">Dollar</option>
                              <option value="total_amount">Total Amount</option>
                            </select>
                          </label>
                      </div>
                      {statsRangePreset === "custom" ? (
                        <div className="stats-date-range">
                          <label className="label">
                            Start date
                            <input
                              className="field"
                              type="date"
                              max={statsEndDate || undefined}
                              value={statsStartDate}
                              onChange={(event) => setStatsStartDate(event.target.value)}
                            />
                          </label>
                          <label className="label">
                            End date
                            <input
                              className="field"
                              type="date"
                              min={statsStartDate || undefined}
                              value={statsEndDate}
                              onChange={(event) => setStatsEndDate(event.target.value)}
                            />
                          </label>
                        </div>
                      ) : null}
                      <StatsTimeSeriesChart
                        dateBucket={statsDateBucket}
                        metric={statsMetric}
                        onDateBucketChange={setStatsDateBucket}
                        points={stats.deep_dive.series}
                        unitLabel={stats.deep_dive.series_unit_label}
                        unitTooltip={stats.deep_dive.series_unit_tooltip}
                      />
                      <div className="stats-table-header">
                        <h3 className="section-title">Top Items</h3>
                      </div>
                      {statsTopItems.length > 0 ? (
                        statsTopItems.map((item) => (
                          <div className="row spread" key={item.item_name}>
                            <span>{item.item_name}</span>
                            <span className="pill">{formatStatsValue(statsMetric, getStatsDisplayValue(statsMetric, item))}</span>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">Save receipts in the selected date range to generate food rankings.</div>
                      )}
                    </section>
                  </section>
                ) : null}

                {activeTab === "history" ? (
                  <section className="panel stack">
                    <div>
                      <h2 className="section-title">Receipt history</h2>
                      <p className="muted">Saved receipts and item tables are private to this user account.</p>
                    </div>
                    {history.length > 0 ? (
                      <div className="history-list">
                        {history.map((entry) => (
                          <Link className="history-link" href={`/history/${entry.id}`} key={entry.id}>
                            <strong>{entry.store_name || "Unknown store"}</strong>
                            <span className="muted">{entry.purchase_date || "No date"} • {entry.item_count} items</span>
                            <span className="pill">
                              {formatCurrency(getAdjustedTotal(entry.receipt_total, entry.excluded_total))}
                              {formatTaxSuffix(entry.receipt_tax)}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">No receipts saved yet.</div>
                    )}
                  </section>
                ) : null}

                {activeTab === "mapping" ? (
                  <section className="panel stack">
                    <div className="row spread">
                      <div>
                        <h2 className="section-title">Item mappings</h2>
                        <p className="muted">Store-specific receipt item names mapped to canonical item name, type, and category.</p>
                      </div>
                      {!isMappingEditing ? (
                        <button className="icon-button" onClick={startMappingEdit} type="button" aria-label="Edit mappings" title="Edit mappings">
                          <span aria-hidden="true">✎</span>
                        </button>
                      ) : null}
                    </div>
                    {visibleMappings.length > 0 ? (
                      <>
                        <div className="mapping-table-shell">
                          <div className="table mapping-table">
                            <div
                              className={`table-head mapping-table-head ${isMappingEditing ? "table-head-mapping-v2" : "table-head-mapping-v2-saved"}`}
                            >
                              <span>Store</span>
                              <span>Receipt Item Name</span>
                              <span>Item Name</span>
                              <span>Type</span>
                              <span>Category</span>
                              {isMappingEditing ? <span className="table-head-spacer" aria-hidden="true" /> : null}
                            </div>
                            {visibleMappings.map((mapping, index) => (
                              <div
                                className={`table-row mapping-table-row ${isMappingEditing ? "table-row-mapping-v2 mapping-table-row-editing" : "table-row-mapping-v2-saved"}`}
                                key={`${mapping.store_name}-${mapping.receipt_item_name}-${index}`}
                              >
                                {isMappingEditing ? (
                                  <>
                                    <label className="mapping-cell mapping-cell-edit">
                                      <span className="mapping-cell-label">{MAPPING_FIELD_LABELS.store_name}</span>
                                      <input className="field mapping-field" value={mapping.store_name} onChange={(event) => updateMappingDraft(index, "store_name", event.target.value)} />
                                    </label>
                                    <label className="mapping-cell mapping-cell-edit">
                                      <span className="mapping-cell-label">{MAPPING_FIELD_LABELS.receipt_item_name}</span>
                                      <input className="field mapping-field" value={mapping.receipt_item_name} onChange={(event) => updateMappingDraft(index, "receipt_item_name", event.target.value)} />
                                    </label>
                                    <label className="mapping-cell mapping-cell-edit">
                                      <span className="mapping-cell-label">{MAPPING_FIELD_LABELS.item_name}</span>
                                      <input className="field mapping-field" value={mapping.item_name} onChange={(event) => updateMappingDraft(index, "item_name", event.target.value)} />
                                    </label>
                                    <label className="mapping-cell mapping-cell-edit">
                                      <span className="mapping-cell-label">{MAPPING_FIELD_LABELS.item_type}</span>
                                      <input className="field mapping-field" value={mapping.item_type ?? ""} onChange={(event) => updateMappingDraft(index, "item_type", event.target.value)} />
                                    </label>
                                    <label className="mapping-cell mapping-cell-edit">
                                      <span className="mapping-cell-label">{MAPPING_FIELD_LABELS.item_category}</span>
                                      <input className="field mapping-field" value={mapping.item_category ?? ""} onChange={(event) => updateMappingDraft(index, "item_category", event.target.value)} />
                                    </label>
                                    <button className="icon-button small danger" onClick={() => stageDeleteMapping(index)} type="button" aria-label="Delete mapping" title="Delete mapping">
                                      <span aria-hidden="true">x</span>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <div className="mapping-cell">
                                      <span className="mapping-cell-label">{MAPPING_FIELD_LABELS.store_name}</span>
                                      <span className="mapping-cell-value">{mapping.store_name}</span>
                                    </div>
                                    <div className="mapping-cell">
                                      <span className="mapping-cell-label">{MAPPING_FIELD_LABELS.receipt_item_name}</span>
                                      <span className="mapping-cell-value mapping-cell-value-secondary">{mapping.receipt_item_name}</span>
                                    </div>
                                    <div className="mapping-cell">
                                      <span className="mapping-cell-label">{MAPPING_FIELD_LABELS.item_name}</span>
                                      <strong className="mapping-cell-value mapping-cell-value-primary">{mapping.item_name}</strong>
                                    </div>
                                    <div className="mapping-cell">
                                      <span className="mapping-cell-label">{MAPPING_FIELD_LABELS.item_type}</span>
                                      <span className="mapping-cell-value mapping-cell-value-muted">{toTitleCase(mapping.item_type) ?? "Blank"}</span>
                                    </div>
                                    <div className="mapping-cell">
                                      <span className="mapping-cell-label">{MAPPING_FIELD_LABELS.item_category}</span>
                                      <span className="mapping-cell-value mapping-cell-value-muted">{mapping.item_category ?? "Blank"}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        {isMappingEditing ? (
                          <div className="row receipt-edit-actions">
                            <button className="button ghost" onClick={cancelMappingEdit} type="button">
                              Dismiss
                            </button>
                            <button className="button primary" onClick={() => void saveMappingChanges()} type="button">
                              Save
                            </button>
                          </div>
                        ) : null}
                        {mappingSaveMessage ? <div className="mapping-save-message">{mappingSaveMessage}</div> : null}
                      </>
                    ) : (
                      <div className="empty-state">Save receipts to build item mappings.</div>
                    )}
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>

        {sessionUser ? <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} /> : null}
      </div>
    </main>
  );
}

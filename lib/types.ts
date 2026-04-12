export type PrefillSource = "claude" | "mapping" | "manual";

export type ReceiptItemInput = {
  receipt_item_name: string;
  item_name: string;
  amount: number | null;
  unit: string | null;
  quantity: number | null;
  price: number | null;
  price_per_unit?: number | null;
  is_excluded?: boolean;
  is_per_pound?: boolean;
  item_type: string | null;
  item_category: string | null;
  llm_item_name?: string | null;
  llm_item_type?: string | null;
  llm_item_category?: string | null;
  prefill_source?: PrefillSource;
  has_mapping_mismatch?: boolean;
};

export type ParsedReceipt = {
  store_name: string;
  purchase_date: string;
  receipt_total: number | null;
  receipt_tax?: number | null;
  items: ReceiptItemInput[];
  parse_warning?: string | null;
};

export type UserRecord = {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
};

export type ReceiptRecord = {
  id: string;
  user_id: string;
  store_name: string;
  store_name_normalized: string;
  purchase_date: string;
  receipt_total: number | null;
  receipt_tax: number | null;
  excluded_total: number;
  receipt_id: string;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export type ReceiptItemRecord = {
  id: string;
  user_id: string;
  receipt_id: string;
  purchase_date: string;
  store_name: string;
  store_name_normalized: string;
  receipt_item_name: string;
  receipt_item_name_normalized: string;
  item_name: string;
  item_name_normalized: string;
  amount: number | null;
  unit: string | null;
  quantity: number | null;
  price: number | null;
  price_per_unit: number | null;
  is_excluded: boolean;
  item_type: string | null;
  item_category: string | null;
  llm_item_name: string | null;
  llm_item_type: string | null;
  llm_item_category: string | null;
  has_mapping_mismatch: boolean;
  created_at: string;
  updated_at: string;
};

export type ItemMappingRecord = {
  id: string;
  user_id: string;
  store_name: string;
  store_name_normalized: string;
  receipt_item_name: string;
  receipt_item_name_normalized: string;
  item_name: string;
  item_name_normalized: string;
  amount: number | null;
  unit: string | null;
  item_type: string | null;
  item_category: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionRecord = {
  token: string;
  user_id: string;
  created_at: string;
};

export type UserUnitRecord = {
  id: string;
  user_id: string;
  unit: string;
  unit_normalized: string;
  created_at: string;
  updated_at: string;
};

export type ItemStorePriceMemoryRecord = {
  id: string;
  user_id: string;
  store_name: string;
  store_name_normalized: string;
  item_name: string;
  item_name_normalized: string;
  unit: string;
  price_per_unit: number;
  last_price: number | null;
  last_purchase_date: string;
  created_at: string;
  updated_at: string;
};

export type SaveReceiptPayload = {
  store_name: string;
  purchase_date: string;
  receipt_total: number | null;
  receipt_tax?: number | null;
  items: ReceiptItemInput[];
  llm_items: ReceiptItemInput[];
};

export type MappingInput = {
  id?: string;
  store_name: string;
  receipt_item_name: string;
  item_name: string;
  amount?: number | null;
  unit?: string | null;
  item_type: string | null;
  item_category: string | null;
};

export type UpdateMappingsPayload = {
  updates: MappingInput[];
  delete_ids: string[];
};

export type StatsMetric = "quantity" | "dollars" | "total_amount";

export type StatsSubjectKind = "item" | "type" | "category";

export type StatsDateBucket = "day" | "week" | "month" | "year";

export type StatsSubjectOption = {
  label: string;
  value: string;
  kind: StatsSubjectKind;
};

export type StatsSelectedSubject = {
  label: string;
  value: string;
  kind: StatsSubjectKind;
} | null;

export type StatsQuery = {
  metric?: StatsMetric;
  startDate?: string | null;
  endDate?: string | null;
  subjectKind?: StatsSubjectKind | null;
  subjectValue?: string | null;
  dateBucket?: StatsDateBucket;
};

export type StatsSeriesPoint = {
  bucket_key: string;
  bucket_label: string;
  value: number;
};

export type StatsTopItemRow = {
  item_name: string;
  quantity: number;
  dollars: number;
  total_amount: number;
};

export type StatsDeepDive = {
  selected_subject: StatsSelectedSubject;
  metric: StatsMetric;
  date_bucket: StatsDateBucket;
  series: StatsSeriesPoint[];
  series_unit_label: string | null;
  series_unit_tooltip: string | null;
  top_items: StatsTopItemRow[];
};

export type StatsResponse = {
  spend_last_7_days: number;
  spend_last_30_days: number;
  filters: {
    subject_options: StatsSubjectOption[];
  };
  deep_dive: StatsDeepDive;
};

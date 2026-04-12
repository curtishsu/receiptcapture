# Receipt Tracker v1 Product Spec

## Overview

Receipt Tracker is a mobile-first web app that helps users understand what foods they buy and how much they spend on them by parsing grocery receipts from photos.

The core workflow is:
1. User uploads a receipt photo
2. Gemini parses the receipt into line items and store metadata
3. The app backfills prior corrections for matching store + receipt text combinations
4. User reviews and edits the parsed table
5. User saves the receipt
6. The app generates purchase-based food and spend insights over time

This product is intentionally not a calorie tracker or exact food-consumption tracker. It is a lightweight grocery-purchase tracker that infers diet patterns from receipts.

---

## Product Goals

### Primary Goal
Make it very easy for users to track what foods they buy, with minimal manual work.

### Secondary Goals
Help users answer questions like:
- What foods do I buy most often?
- How much do I spend on groceries?
- Do I buy fruit regularly?
- Am I buying the same foods repeatedly?
- How diverse is my diet based on grocery purchases?

### Non-Goals for v1
- Exact food consumption tracking
- Calorie or macro tracking
- Pantry/inventory tracking
- Meal logging
- Photo storage
- Barcode scanning
- Multi-user households
- Crowdsourced correction workflows

---

## Product Principles

- Mobile-first
- Low-friction
- Editable AI output
- Learns from prior corrections
- Honest about what is measured: purchases, not actual consumption
- Privacy-conscious: do not store uploaded receipt photos

---

## Tech Stack

- Frontend: Next.js
- Hosting: Vercel
- Database: Firebase Firestore
- Authentication: Firebase Authentication using email-based sign-in
- Receipt parsing: Google Gemini API
- Photo handling: temporary upload for inference only; do not persist photo after parsing

---

## Authentication

Use Firebase Authentication with email as the primary auth mechanism.

### v1 Auth Requirements
- Users must be able to sign up with email
- Users must be able to sign in with email
- Each saved receipt, saved item, and user override rule must be tied to a `user_id`
- Stats and history are scoped to the signed-in user

### Auth Rationale
User-specific history and user-specific override behavior require an authenticated account.

---

## Core User Experience

The app has 3 bottom tabs:
- Photo
- Stats
- History

---

## Tab 1: Photo

### Purpose
Primary entry point for uploading a receipt and saving parsed grocery data.

### UX Flow
1. User opens app
2. User sees a large upload/photo box
3. User taps it and uploads or takes a photo
4. App sends image to backend
5. Backend sends image to Gemini
6. Gemini returns structured receipt JSON
7. App checks for matching user-specific overrides
8. If none exist, app checks for matching shared defaults
9. Matching corrections are backfilled into the editable table
10. User reviews and edits rows as needed
11. User taps Save
12. Receipt and receipt items are persisted to Firestore
13. Correction rules are updated based on final saved values

### Receipt Header Fields
Display these above the table if available:
- Store name
- Purchase date
- Estimated total (optional for v1)
- Parse status or warning if uncertain

### Editable Table Columns
Each row represents one purchased item.

Columns:
1. Item Name
2. Quantum of Unit
3. Unit
4. Quantity Purchased

Notes:
- If no unit is implied, leave `Quantum of Unit` and `Unit` blank
- All fields must be editable
- Users can edit any prefilled value
- Users should be able to add a row
- Users should be able to delete a row

### Save Behavior
When user taps Save:
- Save receipt metadata
- Save receipt items
- Update user-specific override rules for each item based on final saved values
- Optionally update shared default rules if product logic allows it in v1

### Backfill Behavior
For each parsed item:
1. Attempt to match on `user_id + normalized_store_name + normalized_raw_line_text`
2. If a user-specific override exists, use it to prefill the row
3. Otherwise check shared defaults using `normalized_store_name + normalized_raw_line_text`
4. If a shared default exists, use it to prefill the row
5. User can still edit any field before saving

Backfill is suggestion only, never final truth.

### Suggested UI Details
- Bottom sticky Save button
- Inline editable cells
- Optional badge on rows:
  - `Using your saved edit`
  - `Using shared default`
- Validation should be lightweight and not block edits unnecessarily

---

## Tab 2: Stats

### Purpose
Help users understand grocery purchasing patterns and approximate diet diversity.

### Key Principle
Stats are based on saved receipt items, not raw Gemini output.

### v1 Stats
Show a small set of simple, useful stats.

#### Spend
- Grocery spend this week
- Grocery spend this month

#### Food Frequency
- Most frequently purchased foods

#### Diversity
- Unique foods purchased in the last 30 days
- Most repeated foods
- Diversity score

### Suggested Diversity Score for v1
A simple metric:
- `count(distinct normalized item names over last 30 days)`

### Fruit / Vegetable Insights
Examples:
- Number of fruit purchase events in last 30 days
- Number of vegetable purchase events in last 30 days
- Top fruit purchased
- Top vegetable purchased

### Example Questions Stats Should Help Answer
- Do I buy fruit often?
- Am I buying peppers all the time?
- What do I spend the most on?
- How repetitive are my groceries?

### v1 Stats Scope
Keep stats simple and stable. Prefer a few clear metrics over many ambiguous ones.

---

## Tab 3: History

### Purpose
Let users browse previously saved receipts and inspect saved item tables.

### History List
Each row is one receipt.

Fields:
- Date
- Store
- Receipt ID

Optional additions:
- Item count
- Total spend

### Interaction
Tapping a row opens the saved receipt detail view.

### Receipt Detail View
Show:
- Store
- Date
- Receipt ID
- Saved items table

Since photos are not stored, do not show original image.

---

## Data Model

Use Firestore.

### Collection: users

Example document:
```json
{
  "email": "user@example.com",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

---

### Collection: receipts

Each document represents one uploaded and saved receipt.

Fields:
```json
{
  "user_id": "string",
  "store_name": "Trader Joe's",
  "store_name_normalized": "TRADER JOES",
  "purchase_date": "2026-03-26",
  "receipt_total": 31.14,
  "receipt_id": "string",
  "item_count": 8,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

Notes:
- `receipt_total` is optional in v1
- `purchase_date` can be blank if Gemini cannot extract it
- No image URL or image blob is stored

---

### Collection: receipt_items

Each document represents one saved line item.

Fields:
```json
{
  "user_id": "string",
  "receipt_id": "string",
  "purchase_date": "2026-03-26",
  "store_name": "Trader Joe's",
  "store_name_normalized": "TRADER JOES",

  "raw_line_text": "PINEAPPLE TIDBITS",
  "raw_line_text_normalized": "PINEAPPLE TIDBITS",

  "item_name": "Pineapple tidbits",
  "item_name_normalized": "PINEAPPLE TIDBITS",

  "quantum_of_unit": null,
  "unit": null,
  "quantity_purchased": 1,

  "line_price": 2.49,

  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

Notes:
- `raw_line_text` should always be saved
- `item_name` is the final saved value
- `item_name_normalized` is for analytics and aggregation
- `quantum_of_unit` and `unit` can be null
- `line_price` is optional but recommended

---

### Collection: user_override_rules

This is the per-user memory layer that improves future parses for that specific user.

Each document represents a per-user correction for:
`user_id + store_name_normalized + raw_line_text_normalized`

Fields:
```json
{
  "user_id": "string",

  "store_name": "Trader Joe's",
  "store_name_normalized": "TRADER JOES",

  "raw_line_text": "PINEAPPLE TIDBITS",
  "raw_line_text_normalized": "PINEAPPLE TIDBITS",

  "last_llm_item_name": "Pineapple tidbits",
  "last_llm_quantum_of_unit": 1,
  "last_llm_unit": "each",
  "last_llm_quantity_purchased": 1,

  "corrected_item_name": "Pineapple tidbits",
  "corrected_quantum_of_unit": null,
  "corrected_unit": null,
  "corrected_quantity_purchased": 1,

  "override_count": 3,
  "last_used_at": "timestamp",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

Behavior:
- Highest-priority source for future backfill for that user
- Updated whenever a user saves a row that differs from the backfilled or LLM version

---

### Collection: shared_default_rules

This is the cross-user default memory layer.

It stores common fixes that should be suggested for other users unless they override them.

Each document represents a shared default for:
`store_name_normalized + raw_line_text_normalized`

Fields:
```json
{
  "store_name": "Trader Joe's",
  "store_name_normalized": "TRADER JOES",

  "raw_line_text": "PINEAPPLE TIDBITS",
  "raw_line_text_normalized": "PINEAPPLE TIDBITS",

  "default_item_name": "Pineapple tidbits",
  "default_quantum_of_unit": null,
  "default_unit": null,
  "default_quantity_purchased": 1,

  "source_count": 12,
  "last_used_at": "timestamp",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Shared Default Behavior
- Used only when the user has no override rule for that store + raw line text pair
- Intended to improve first-time experiences for other users
- In v1, this can be a simple default layer maintained by product logic
- Later, this can evolve into a more explicit crowdsourcing and review system

### Important Future Note
Eventually there will be a mechanism to crowdsource edits, but that is out of scope for v1. For now, shared defaults are just a default suggestion layer.

---

## Rule Precedence

When backfilling a parsed item, use this order:

1. User-specific override rule
2. Shared default rule
3. Raw Gemini parse output

This means:
- the user’s own past correction always wins
- otherwise the product can benefit from known good defaults from other users
- Gemini is the fallback when no rule exists

---

## Matching Logic

### Key Decision
Use:
- normalized store name
- normalized raw receipt line text

Do **not** key on Gemini-generated phrasing, because that may vary between runs.

### Normalization Rules
For store and raw line text:
- uppercase
- trim whitespace
- collapse repeated spaces
- optionally strip punctuation

Example:
- `Trader Joe's` -> `TRADER JOES`
- `PINEAPPLE TIDBITS` -> `PINEAPPLE TIDBITS`

### v1 Matching
- Exact match only
- No fuzzy matching in v1

Reason:
- simpler
- safer
- more predictable

---

## Gemini Parsing Requirements

### Input
A receipt image uploaded from client to backend.

### Output Contract
Gemini should return structured JSON only.

Example expected JSON shape:
```json
{
  "store_name": "Trader Joe's",
  "purchase_date": "2026-03-26",
  "receipt_total": 31.14,
  "items": [
    {
      "raw_line_text": "PINEAPPLE TIDBITS",
      "item_name": "Pineapple tidbits",
      "quantum_of_unit": null,
      "unit": null,
      "quantity_purchased": 1,
      "line_price": 2.49
    }
  ]
}
```

### Parsing Guidance
Gemini should:
- extract store name if possible
- extract purchase date if possible
- extract line items only, not subtotal, tax, payment, or loyalty lines
- preserve raw printed item text when possible
- infer clean item names when possible
- leave `quantum_of_unit` and `unit` blank if not clearly implied
- return `quantity_purchased` as integer when possible

### Important Rule
If package size or unit is not clearly implied, leave it blank.

Bad:
```json
{
  "item_name": "Pineapple tidbits",
  "quantum_of_unit": 1,
  "unit": "each"
}
```

Preferred:
```json
{
  "item_name": "Pineapple tidbits",
  "quantum_of_unit": null,
  "unit": null
}
```

---

## Receipt Parse Flow

### Step 1: Upload
User uploads receipt image from Photo tab.

### Step 2: Parse
Backend sends image to Gemini and receives structured JSON.

### Step 3: Normalize
Backend normalizes:
- store_name
- raw_line_text
- item_name

### Step 4: Apply Memory Layers
For each item:
1. Check `user_override_rules` using `user_id + store_name_normalized + raw_line_text_normalized`
2. If no match, check `shared_default_rules` using `store_name_normalized + raw_line_text_normalized`
3. If still no match, use Gemini output

### Step 5: Return Editable Table
Backend returns parsed receipt payload to client with:
- receipt header
- item rows
- indication of where the prefill came from

### Step 6: User Review
User edits any fields they want.

### Step 7: Save
On save:
- create receipt document
- create receipt item documents
- upsert user override rules using final saved values
- optionally update shared defaults using product logic

---

## Save Logic

When saving a receipt:

### Create receipt
Save receipt-level metadata.

### Create receipt items
Save one document per final row.

### Update user override rules
For each row, upsert user override rule keyed by:
- user_id
- store_name_normalized
- raw_line_text_normalized

Update:
- last LLM interpretation
- corrected values
- override_count
- last_used_at

### Update shared default rules
If product logic determines that this row should contribute to shared defaults, update shared default rule keyed by:
- store_name_normalized
- raw_line_text_normalized

Update:
- default values
- source_count
- last_used_at

### Important
Always save the final user-confirmed values, not just the Gemini values.

---

## Shared Default Strategy for v1

The product requirement is:

If a store + raw text combination has a known good correction, use that as the default for other users unless a given user has their own override.

Example:
- `Trader Joe's + PINEAPPLE TIDBITS`
- Gemini interprets `unit = each`
- A known correction says `unit = null`
- For new users, the app should prefill `unit = null`
- If a specific user later prefers something else, their own override wins

### Recommendation for v1 Implementation
Keep shared defaults simple:
- one shared default document per `store_name_normalized + raw_line_text_normalized`
- use most recently accepted or product-approved correction as the default
- do not build moderation, voting, or trust systems yet

This leaves room for a future crowdsourcing layer without blocking v1.

---

## Stats Computation Logic

Stats should run against saved `receipt_items`.

### Recommended Derived Values
- spend_last_7_days
- spend_last_30_days
- top_items_last_30_days
- unique_items_last_30_days
- fruit_purchase_count_last_30_days
- vegetable_purchase_count_last_30_days

### v1 Simplification
If category classification is not implemented in the first build, stats can still be useful using normalized item names only.

Example v1 stats:
- total grocery spend last 30 days
- most frequently purchased items
- number of unique items purchased
- repeated items count
- top 5 most common items

---

## v1 Item Schema Decision

The editable item schema for v1 is:

- Item Name
- Quantum of Unit
- Unit
- Quantity Purchased

Rules:
- `Quantum of Unit` can be null
- `Unit` can be null
- `Quantity Purchased` should default to 1 unless clearly repeated
- User can edit all fields

---

## Example Receipt Output

Example saved canonical rows for the Trader Joe's receipt discussed earlier:

```json
[
  {
    "item_name": "Low fat milk",
    "quantum_of_unit": 0.5,
    "unit": "gallon",
    "quantity_purchased": 1
  },
  {
    "item_name": "Baby spinach",
    "quantum_of_unit": 12,
    "unit": "oz",
    "quantity_purchased": 1
  },
  {
    "item_name": "Boneless skinless chicken breast",
    "quantum_of_unit": null,
    "unit": null,
    "quantity_purchased": 2
  },
  {
    "item_name": "Pineapple tidbits",
    "quantum_of_unit": null,
    "unit": null,
    "quantity_purchased": 1
  },
  {
    "item_name": "Kale",
    "quantum_of_unit": 10,
    "unit": "oz",
    "quantity_purchased": 2
  },
  {
    "item_name": "Brown crimini mushrooms",
    "quantum_of_unit": null,
    "unit": null,
    "quantity_purchased": 1
  },
  {
    "item_name": "Green bell pepper",
    "quantum_of_unit": 1,
    "unit": "each",
    "quantity_purchased": 2
  },
  {
    "item_name": "Broccoli florets",
    "quantum_of_unit": 12,
    "unit": "oz",
    "quantity_purchased": 1
  }
]
```

---

## Open Product Decisions

These are not blockers, but should be decided soon.

### 1. Categories
Do we want category classification in v1?
Recommendation:
- optional
- can defer until after basic receipt parsing is working

### 2. Aggregation
Should duplicate items within the same receipt be combined before display?
Recommendation:
- display them combined if clearly identical after normalization
- but save raw line text on items so provenance is preserved when possible

### 3. Edit UX
Should rows be inline-editable or open a small modal?
Recommendation:
- inline-editable for speed on mobile

### 4. Shared Default Governance
How should a shared default be updated when different users submit conflicting corrections?
Recommendation for v1:
- keep it simple
- use one current shared default value
- leave conflict resolution and crowdsourcing workflow for follow-up

---

## Error States

### Parse Failure
If Gemini cannot parse receipt:
- show error state
- allow user to retry upload

### Partial Parse
If some items are unclear:
- still show table
- allow user to edit manually

### Missing Store
If store is unknown:
- leave store blank and editable

### Missing Date
If purchase date is unknown:
- leave blank and editable
- optionally default to today's date only if user confirms

---

## Security / Privacy

- Do not persist uploaded receipt photos
- Process image transiently only for parsing
- Store only structured receipt data and user edits
- User-specific history is private
- User-specific overrides are private
- Shared defaults are used as product defaults for all users
- Crowdsourced edit workflows are out of scope for v1

---

## Suggested Firestore Collections Summary

- `users`
- `receipts`
- `receipt_items`
- `user_override_rules`
- `shared_default_rules`

---

## Suggested API Endpoints

### `POST /api/parse-receipt`
Accepts receipt image upload.
Returns parsed and backfilled editable receipt payload.

Response example:
```json
{
  "store_name": "Trader Joe's",
  "purchase_date": "2026-03-26",
  "receipt_total": 31.14,
  "items": [
    {
      "raw_line_text": "PINEAPPLE TIDBITS",
      "item_name": "Pineapple tidbits",
      "quantum_of_unit": null,
      "unit": null,
      "quantity_purchased": 1,
      "line_price": 2.49,
      "prefill_source": "shared_default"
    }
  ]
}
```

`prefill_source` enum:
- `user_override`
- `shared_default`
- `claude`

### `POST /api/save-receipt`
Accepts final edited receipt payload.
Creates receipt + item records and updates override and shared default rules.

### `GET /api/receipts`
Returns receipt history list for current user.

### `GET /api/receipts/:receiptId`
Returns saved receipt detail and saved item table for current user.

### `GET /api/stats`
Returns summary stats for current user.

---

## Coding Priorities for v1

### Phase 1
- Firebase Authentication with email sign-in
- Mobile-first shell with bottom tabs
- Photo upload flow
- Gemini parsing endpoint
- Editable parsed table
- Save receipt flow

### Phase 2
- Firestore persistence
- History tab
- Receipt detail page

### Phase 3
- User override backfill logic
- Shared default backfill logic
- Rule updates on save

### Phase 4
- Stats tab
- Basic spend + diversity metrics

---

## Definition of Done for v1

The product is v1-complete when a user can:
1. Sign up and sign in with email
2. Open the app on mobile
3. Upload a grocery receipt photo
4. See a parsed editable table
5. See suggested backfills from either their own past edits or a shared default
6. Edit any item values
7. Save the receipt
8. View saved receipts in History
9. Re-upload a similar receipt and see prior corrections backfilled
10. View simple stats about grocery purchases over time

---

## Summary

Receipt Tracker v1 is a mobile-first grocery receipt parser that turns receipt photos into structured, editable food purchase data. It improves over time through two memory layers:
- user-specific override rules
- shared default rules across users

User-specific overrides always take precedence. Shared defaults improve the first-time experience for everyone else. The app does not store photos, uses Gemini for parsing, stores structured data in Firebase, uses Firebase email authentication, and provides lightweight stats about grocery spending and food diversity.

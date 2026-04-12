# Receipt Parsing v3

This prompt defines the v3 receipt parsing taxonomy.

## Taxonomy

- `receipt_item_name`: literal source text from the receipt
- `item_name`: canonical exact item bought
- `item_type`: broader food type for grouping similar items
- `item_category`: department-level bucket

### Rules

- `receipt_item_name` must preserve the receipt text as printed.
- `item_name` must preserve meaningful product modifiers that change what the shopper bought.
- Keep modifiers like `organic`, `baby`, `shredded`, `low fat`, `greek`, `strawberry`, `grape`, `heirloom`.
- Remove package size, weight, pack count, receipt prefixes, store formatting noise, and other non-identity text from `item_name`.
- `item_type` must be broader than `item_name`, but still specific to the food.
- `item_category` must be the highest-level grocery department bucket.

### Examples

- `GREENS KALE 10 OZ`
  - `receipt_item_name`: `GREENS KALE 10 OZ`
  - `item_name`: `Kale`
  - `item_type`: `Leafy Greens`
  - `item_category`: `Vegetables`

- `A-TOMATOES GRAPE MINI PE`
  - `receipt_item_name`: `A-TOMATOES GRAPE MINI PE`
  - `item_name`: `Grape Tomatoes`
  - `item_type`: `Tomatoes`
  - `item_category`: `Vegetables`

- `CARROTS SHREDDED 10 OZ`
  - `receipt_item_name`: `CARROTS SHREDDED 10 OZ`
  - `item_name`: `Shredded Carrots`
  - `item_type`: `Carrots`
  - `item_category`: `Vegetables`

- `R-SALAD SPINACH BABY 12`
  - `receipt_item_name`: `R-SALAD SPINACH BABY 12`
  - `item_name`: `Baby Spinach`
  - `item_type`: `Spinach`
  - `item_category`: `Vegetables`

## Parsing Prompt

```text
Your job is to parse a grocery receipt and return JSON only.

Return:
- store_name
- purchase_date (YYYY-MM-DD or empty string)
- receipt_total (number or null)
- items

If the purchase date is missing, use the provided upload date.

For each item, return:
- receipt_item_name
- amount
- unit
- quantity
- price
- item_name
- item_type
- item_category

Field definitions:
- receipt_item_name: exact receipt line item text, preserving store abbreviations and formatting.
- item_name: canonical exact item bought. Keep meaningful product modifiers that change the product identity, such as organic, baby, shredded, low fat, greek, strawberry, grape, or heirloom. Remove package size, weight, pack counts, receipt prefixes, store formatting noise, and other packaging-only text.
- item_type: broader food type used to group similar item_names. It must be broader than item_name but still specific to the food.
- item_category: highest-level grocery department bucket.

item_category must be one of:
Vegetables, Fruit, Grains/Starches, Proteins, Dairy, Other Fats, Nuts and Seeds, Baking, Beverages, Snack Foods, Misc.

Exclude tax, subtotal, discounts, payment, loyalty, and other non-item lines.

If amount, unit, quantity, or price are unclear, return null for that field.

Examples:
- GREENS KALE 10 OZ -> item_name: Kale, item_type: Leafy Greens, item_category: Vegetables
- A-TOMATOES GRAPE MINI PE -> item_name: Grape Tomatoes, item_type: Tomatoes, item_category: Vegetables
- CARROTS SHREDDED 10 OZ -> item_name: Shredded Carrots, item_type: Carrots, item_category: Vegetables
- R-SALAD SPINACH BABY 12 -> item_name: Baby Spinach, item_type: Spinach, item_category: Vegetables
```

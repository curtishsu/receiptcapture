stats.v2

## Bar hover / tap tooltip
If I hover on desktop or tap on mobile over a bar on the bar graph, show a tooltip popover.

The tooltip should show all item names that contribute to that bar. Group rows by `item_name`.

The format is:
Date (Selected Metric Value)
Item Name: Total Amount ($)

For example:
3/23 ($10.04)
Kale: 30oz ($4.24)

Tooltip row rules:
- Rows should always show `total amount`, regardless of the selected metric.
- `total amount` is derived from `quantity * amount`, with the unit appended.
- If an item has multiple units in the same bar, show all summed unit totals in one row such as `20oz + 3ct`.
- Sort rows by dollar amount descending. Break ties alphabetically by item name.
- If any row in the tooltip contains multiple units, show italic text at the bottom that says `Multiple units`.

Interaction rules:
- Desktop: hover shows the tooltip.
- Mobile: tap shows the tooltip and keeps it open until another bar is tapped, the same bar is tapped again, or the user taps outside the tooltip.

## Units on Top Items
`Top Items` is the existing section in the app below the chart.

If the selected metric is `total amount`, display the unit in each top item row.

Examples:
- Single unit: `30oz`
- Multiple units: `20oz + 3ct`

Ranking rules:
- Ranking should still be based on the numeric total amount.
- For mixed units, rank by the sum of the numeric totals across units. Example: `20oz + 3ct` ranks as `23`.

## Bar Chart labels
Create a visually optimal way to select data labels.

Rules:
- If there is enough space on a given bar to display a data label without the text exceeding the width of the bar, include it.
- If labels would overlap, exclude labels to prevent overlap.
- Prioritize bars with values farthest from the median.
- If additional prioritization is needed, prefer higher values first, then lower values, then recency.

## Metric default
Have the metric default be `dollars`, not `quantity`.

This applies to:
- Initial stats page load
- Stats reset state
- API fallback when the metric is missing or invalid

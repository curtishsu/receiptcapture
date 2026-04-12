stats_v1.md

The goal of this section is to 
The questions I want to answer
1. How often do I go to grocery stores. This will be solved in a later section. 
2. For a given food, how much did I eat (amount unit quantity multiple)
3. For a given food type / category, how much do I eat over time. 



# Food Deep Dive.
The point of this section is to deep dive into how much of a specific food I eat over time.
## Filters:
Drop down: I should be able to select food type, food category, or food item. All this can be under the same selector. On the drop down, the left side should be the value, and the right side is a colored chip of what it is. 
Example: Drop down values are: 
Green Kale | Food item 
Vegatable | Cateogry 
Milk | Food Type
Chocolate | Food Type


Metric: This is the metric that appears for all the following assets. The metric types can be 
1. Quantity: This is the sum of the number of 'Quantity' that I've purchased for a given item
2. Dollar: This is the sum of the amount of money spent on an item
3. Total Amount: This is the expected amount of unit purchased of an item. This is generally Amount * quanityt with the unit of units. If an item has a 'Blank' amount or unit, then impute it as 1 and assume the unit is 'Each' for this metric


## Assets
### Time Series Chart: 
This is to show how much I have purchased over time. The X axis is time, with the unit being the feature. The Y axis is the metric selected (quantity, dollar, total amount). Use the corresponding unit with the metric, if dollar, use the $ symbol. If total amount is the metric and all the items that map to the filter is the same unit, then display the unit. Otherwise, display unit as 'Mult'. When hovering over it, have the tool tip say 'Current filtering contains multiple units'

#### Features of the time series chart
Date unit: At the right of the time series chart, there is a selctor for the unit of the date. Default is month, but additional options are day, week and year
Data labels: Select the data labels that are most relevant, primarily the highest value and the most recent time frame. For points that do not have the label, have the value shown upon tool tip hover on web or upon click on mobile. 


### Most Frequent Purchases: 
This is the existing table at the bottom of the stats page. For when the 'Total Amount' metric is used, ignore the unit and assume all units are the same



Other issues with the stats page
1. When the date range selector is updated, the most frequent purchases data should update given the date range. For example, if Last 7 is selected, it should be the last 7 day. This isn't happening. 
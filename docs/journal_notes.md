


## foodprint mobile view improvements - stats
Spacing on the graph for trends can be improved on mobile
1. There's a lot of white space above and below the graph. If the graph cannot be enlarged, the white space should be removed. 
2. Change the x-axis ticks to be at a 45 degrees and slightly increase the font to increase readability. 
3. The month button is oddly large relative to the trends text. Can you make the sizing similar. 
4. For the Top Items, instead of having the price chip wrap around the whole item, I want it to be a two column view. If text needs to be wrapped, that is okay
5. Currently the "Top Items" section is limited to the top five. Have a button at the bottom of the list that is 'Show All' which enables the list to show all items I'
6. When I click onto a value in the bar chart, the tooltip extends beyond the boundary of the mobile view. The popover should be within the confines of the card.

## New Feature 
### Breakdown Section under Deep Dive
User Goal: I want to see what percentage of the food I purchase is what. For example, 30% of my spending on vegatables is from Kale. 
Solution: 
1. Include a pie chart under the breakdown selection. This pie chart is how a user knows what percentage a purchase is of their overall
2. There is a button that selects what the slices / group by for the pie chart is. The pie chart is sliced by a breakdown selector. The breakdown selector has three options: Food Item, Food Type, Category. Food Item is the default
3. Each slice should have a data label that is the name of the slice (e.g. if Food Item then 'Kale', if Category, then "Vegatable") and the percentage.
4. The graphic follows the filters at the top: this includes date range, the foods that are filtered, and the unit. The unit at the top is how the percentage is used. Total Amount logic should follow the rest of the stats screen.
5. There should not be too many slices that are unreadable. To prevent this, a slice must be at least 5% of the total to be shwon. If not, then it should be included in an 'Others' Category. When the others category is clicked on, there should be a tool tip that includes the slices that make up the Others category and the percentage of that category. 
6. Click action: If a user clicks on a slice, then it will show the following data:
Name of slice | Amount | Percentage of Total.
Underneath, it will be the make up of the slice by Food item. This means it will be Food Item | Percentage of slice. Note that percentage should be the percentage of that item in the make up of the slice. The list should be ordered descending by percentage amount. 

UI/UX: Under 'Deep Dive' include another Card labeled 'Breakdown'. It should have the same design principles as the 'Trends' Card. That means the button sizes, overall card size, and fonts should be the same


## Improvements to default on uploading receipts
Currently, if quantity and amount can't be identified on the receipt, then it defaults to blank. I am concerned that this impacts the math of calculating total amount. Is this something I should be concerned about?

Implement the two:
1. Defaulted values to 1 when uploading a photo if quantity or amount cannot be found.
2. For the history values, if there is a blank value, change is to 1
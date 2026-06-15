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
improvements_v2.md

Parsing and Normalization
The goal of this section is to make the items purchased easier and readble. It will also be used to inform future stats


One improvement is to make sure the LLM parses the grocery receipt with the right metadata. 

Proposed prompt for receipts 
Your job is to parse a grocery receipt. From it you should get the following information 
1. Date of transaction 
2. Store name 
3. All the tiems

Each item should have the following metadata 
1. Receipt Item Name: this is the exact text for each item on receipt. This was previously "Item Name"
2. Amount: the amount of unit. Example is 10
3. Unit: the unit the item is measured in. Examples include oz or gallons
4. Quantity: the number of items purchased 
5. Price: amount of money spent on the item 
From the item name, you should also try to impute the following metadata 
1. Item Name. This is a human readable form of the receipt item. An example is 'Chicken Breast'. This was previously 'normalized item name'
2. Item Type: this should be what the item purchased was, specifically the food purchased. Examples are
    1. Kale
    2. Milk 
    3. Frozen pineapple
3. Item category. This is how the food would be categorized into broad buckets. Broad bucket examples are below. Use best judgement to categorize a food.
    1. Vegetables: ex kale, broccoli, carrots
    2. Fruit: frozen pineapple, blueberries
    3. Grains/Starches: bread, potatoes 
    4. Proteins: chicken, salmon, eggs, beans. Dairy items are not included
    5. Dairy: milk, cheese, greek yogurt. Do not include butter
    6. Other Fats: Butter, oils, coconut milk
    7. Nuts and Seeds: Peanuts, sunflower seeds
    8. Baking: Ingredients used in baking. Sugar, flour, vanilla, baking powder, chocolate chips
    9: Beverages: Soda, alcohol
    10: Snack Foods: sesame sticks, chips, cookies
    11. Misc: All other foods


The output of the receipt should be attached to the metadata for each item. Update the firebase database for this change. 

# Column Name
Update all instances of Item Name to now 'Receipt Item Name' and 'Normalized Item Name' to just 'Item Name'

# Rules for parsing
The LLM should parse the entire receipt for al the metadata. Use the mapping table first to fill in the metadata for item type and item category. if an item doesn't exist, use the LLM data as a backfill.

If the LLM metadata doesn't match the existing mapping data, have an asterisk by the name. Clicking that asterisk opens an interstitial of the specific item name and enables the user to 'accept' the new metadata based on what was read. 


# Backfilling
Currently, there is no item type and item category data. The mapping table should be backfilled to have this data. This means for existing items in the mapping table, the LLM should be used to impute this data. This also means updating the metadata for all the previously uplaoded receipts. 

The mapping table should then have the following data
Store | Receipt Item Name | Item Name | Type | Category 

Instead of an edit button next to each row, have a pencil icon at the top right. Clicking this enters edit mode, where a user can manually override any column. At the top right is an 'x' icon. Clicking it will mark the row for deletion There is a save and dismiss button at the bottom of the mapping table to confirm the changes. 
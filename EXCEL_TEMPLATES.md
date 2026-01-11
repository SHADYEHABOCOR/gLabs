# Excel Templates & Headers Guide

This document lists all accepted Excel column headers for gLabs applications.

---

## Menu Studio Pro - Transformer

The Transformer uses **smart header detection** to automatically recognize and map header variations to standardized columns.

**✨ Key Features:**
- **Case-insensitive**: `NAME`, `Name`, `name` all work
- **Flexible naming**: `item name`, `menu item name`, `title` all map to the same field
- **Language support**: Automatically detects `(EN)`, `(AR)`, `[EN]`, `[AR]` formats
- **Google Drive auto-conversion**: Drive links in `Images` column are automatically converted to direct URLs
- **No strict requirements**: The system adapts to YOUR format

The tables below show common variations, but the system is **not limited** to these exact headers.

### Core Fields

| Your Header (case-insensitive) | Maps To | Description |
|-------------------------------|---------|-------------|
| `id`, `item id`, `menu item id`, `item_id` | **Menu Item Id** | Unique identifier for the item |
| `name`, `item name`, `menu item name`, `title` | **Menu Item Name** | Name of the menu item |
| `brand`, `brand name` | **Brand Name** | Brand or manufacturer |
| `brand id` | **Brand Id** | Brand identifier |
| `description`, `desc` | **Description** | Item description |
| `price`, `cost`, `amount` | **Price** | Item price (supports AED, SAR, USD, etc.) |
| `calories`, `kcal` | **Calories(kcal)** | Calorie count |
| `tag`, `tags`, `category` | **Tag** | Item tags/categories |
| `classification` | **Classification** | Item classification |
| `allergen`, `allergens` | **Allergen** | Allergen information |
| `external id` | **External Id** | External system ID |
| `barcode` | **Barcode** | Product barcode |
| `active`, `status`, `enabled` | **Active** | Item status (active/inactive) |
| `image`, `images`, `image url`, `imageurl` | **Image URL** | Item image URL |

### Modifier Fields

| Your Header | Maps To | Description |
|-------------|---------|-------------|
| `modifier group`, `modifier group name`, `mod group` | **Modifier Group Name** | Modifier group name |
| `modifier name`, `modifier_name` | **Modifier Name** | Individual modifier name |
| `sub modifier group`, `sub-modifier group name` | **Sub-Modifier Group Name** | Sub-modifier group |
| `sub modifier name` | **Sub-Modifier Name** | Sub-modifier name |

### Arabic Translation Format

The transformer supports **two formats** for Arabic translations:

#### Format 1: Separate Translation Rows (Traditional)

Use rows with `[ar-ae]:` prefix:

```
Menu Item Id | Menu Item Name | Description
123          | Chicken Burger | Grilled chicken with lettuce
             | [ar-ae]: برجر الدجاج | [ar-ae]: دجاج مشوي مع الخس
```

#### Format 2: Language-Specific Columns (Modern)

Use columns with language indicators in parentheses or brackets:

```
Menu Item Id | NAME (EN) | NAME (AR) | Description (EN) | Description (AR)
123          | Chicken Burger | برجر الدجاج | Grilled chicken | دجاج مشوي مع الخس
```

**All these variations are automatically recognized:**
- `NAME (EN)` / `NAME (AR)` - Parentheses format
- `NAME [EN]` / `NAME [AR]` - Bracket format
- `Name(EN)` / `Name(AR)` - No spaces
- `name (en)` / `name (ar)` - Lowercase (case-insensitive)
- `Description (AR)` / `DESCRIPTION (AR)` - Any case variation

**Output format:** Both methods produce the same standardized output:
- English → `Menu Item Name`, `Description`
- Arabic → `Menu Item Name[ar-ae]`, `Description[ar-ae]`

### Price Format

Supports multiple formats:
- `AED 25.50`
- `SAR 30`
- `25.50 AED`
- `30` (defaults to AED)

Output columns: `Price[AED]`, `Price[SAR]`, etc.

### Google Drive Image Links

**Automatic conversion** - no manual work needed!

If your Excel file has Google Drive links in the `Images` column, the transformer will automatically:
1. Detect the Drive links
2. Extract the file ID
3. Convert them to direct thumbnail URLs that work without authentication

**Supported Drive formats:**
- `https://drive.google.com/file/d/FILE_ID/view`
- `https://drive.google.com/open?id=FILE_ID`
- `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`

**Converted to:**
- `https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000`

**Requirements:**
- Files must be shared with "Anyone with the link can view"
- This works in the **Transformer** - you don't need to use the Image Scraper

### Example Templates

#### Template 1: Traditional Format (Separate Translation Rows)

```csv
Menu Item Id,Menu Item Name,Description,Brand Name,Price,Calories,Tag
101,Chicken Burger,Grilled chicken with lettuce,McDonald's,AED 25.50,450,Fast Food
,Menu Item Name[ar-ae],Description[ar-ae],,,,
,[ar-ae]: برجر الدجاج,[ar-ae]: دجاج مشوي مع الخس,,,,
102,Caesar Salad,Fresh romaine lettuce,Subway,AED 18.00,200,Healthy
```

#### Template 2: Modern Format (Language Columns with Drive Links)

```csv
Barcode,NAME (EN),NAME (AR),Description (EN),Description (AR),CATEGORY (EN),CATEGORY (AR),Active,Price,Images
SKU123,Chicken Burger,برجر الدجاج,Grilled chicken with lettuce,دجاج مشوي مع الخس,Fast Food,وجبات سريعة,Yes,AED 25.50,https://drive.google.com/file/d/1ABC123XYZ456/view
SKU124,Caesar Salad,سلطة سيزر,Fresh romaine lettuce,خس روماني طازج,Healthy,صحي,Yes,AED 18.00,https://drive.google.com/file/d/1DEF789UVW012/view
SKU125,Pasta Carbonara,باستا كاربونارا,Creamy pasta with bacon,باستا كريمية مع لحم مقدد,Italian,إيطالي,No,AED 32.00,https://example.com/pasta.jpg
```

**Note:** Drive links are automatically converted to thumbnail URLs in the output!

**Both templates produce identical standardized output!** Use whichever format matches your existing data structure.

---

## Image Scraper - Excel Upload

Upload an Excel file with Google Drive links to bulk import images.

### Required Columns

At least one column from each category:

#### Image URL Column (required)
Any header containing these keywords (case-insensitive):
- `image`, `imageurl`, `image_url`, `image url`
- `photo`, `picture`, `img`
- `url`, `link`
- `drive`, `drivelink`, `drive link`

#### Item Name Column (optional, recommended)
Any header containing:
- `name`, `item`, `itemname`, `item_name`, `item name`
- `title`, `product`, `dish`

#### Item ID Column (optional)
Any header containing:
- `id`, `itemid`, `item_id`, `item id`
- `sku`, `code`

### Example Template

```csv
Item ID,Item Name,Image URL
101,Chicken Burger,https://drive.google.com/file/d/ABC123XYZ/view
102,Caesar Salad,https://drive.google.com/file/d/DEF456UVW/view
103,Pasta Carbonara,https://drive.google.com/file/d/GHI789RST/view
```

**Alternative formats also work:**

```csv
SKU,Product,Drive Link
SKU-001,Burger,https://drive.google.com/file/d/ABC123/view
```

```csv
Code,Dish Name,Photo
001,Salad,https://drive.google.com/file/d/XYZ789/view
```

### Google Drive Link Formats

All these formats are automatically converted:
- `https://drive.google.com/file/d/FILE_ID/view`
- `https://drive.google.com/open?id=FILE_ID`
- `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`

Converted to: `https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000`

### Important Notes

1. **Drive Sharing**: Images must be shared with "Anyone with the link can view"
2. **File Types**: Supports `.xlsx`, `.xls`, and `.csv` files
3. **Case Insensitive**: All headers are case-insensitive
4. **Flexible Matching**: Column names can contain the keywords anywhere (e.g., "Product Image URL" matches "image")

---

## Tips & Best Practices

### Menu Transformer
1. Use consistent header names from the mapping above
2. Include both English and Arabic for GCC markets
3. Specify currency in price column (AED, SAR, etc.)
4. Keep modifier groups hierarchical

### Image Scraper
1. Ensure Drive links are publicly accessible
2. Use descriptive item names for better organization
3. Include item IDs if you plan to match with existing data
4. Test with a small batch first (5-10 items)

---

## Troubleshooting

### "No data found in Excel file"
- Check that your file has at least one row of data (beyond headers)
- Ensure headers are in the first row

### "No image URLs found in Excel file" (Image Scraper)
- Column header must contain one of the image-related keywords
- Check that cells contain actual URLs, not empty values

### Arabic translations not merging
- Ensure translation rows have `[ar-ae]:` prefix in the name/description
- Translation row should immediately follow the main item row
- Leave the ID column empty for translation rows

### Images not displaying (Image Scraper)
- Verify Drive link sharing is set to "Anyone with the link"
- Check that the link format is correct
- Try opening the link in an incognito browser window

---

## Common Format Examples

### Your Format → What It Becomes

The transformer intelligently handles various real-world formats:

| Your Headers | Detected As | Output Columns |
|-------------|-------------|----------------|
| `NAME (EN)`, `NAME (AR)` | Name with languages | `Menu Item Name`, `Menu Item Name[ar-ae]` |
| `Description [EN]`, `Description [AR]` | Description with languages | `Description`, `Description[ar-ae]` |
| `CATEGORY (EN)`, `CATEGORY (AR)` | Category (mapped to Tag) | `Tag`, `Tag[ar-ae]` |
| `Barcode`, `Active`, `Price`, `Images` | Standard fields | `Barcode`, `Active`, `Price[AED]`, `Image URL` |
| `Images` with Drive links | Auto-converted | `Image URL` (with thumbnail URLs) |
| `Item Name`, `Item ID`, `Cost` | Common variations | `Menu Item Name`, `Menu Item Id`, `Price[AED]` |
| `product`, `sku`, `amount` | Alternative names | `Menu Item Name`, `Menu Item Id`, `Price[AED]` |

**Mix and match:** You can use ANY combination of these formats in a single file!

---

**Need help?** Check the [README.md](./README.md) for more information or the [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment instructions.

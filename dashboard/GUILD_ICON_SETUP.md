# Discord Guild Icon Setup

Use your Discord guild's icon as the browser favicon for your dashboard.

## Quick Setup

### Step 1: Enable Discord Server Widget

1. Open Discord → Your Server
2. **Server Settings** → **Widget**
3. Enable **"Enable Server Widget"**
4. Click **Save Changes**

### Step 2: Fetch Your Guild Icon

Run this command:

```bash
npm run fetch-icon
```

This will:
- Download your guild icon from Discord
- Save it as `public/favicon.ico`
- Save a PNG copy as `public/icon.png`

### Step 3: Restart Dev Server

```bash
# Stop your dev server (Ctrl+C)
npm run dev
```

Your guild icon should now appear in the browser tab! 🎉

## Troubleshooting

**Error: "Could not fetch guild data"**
- Make sure **Server Widget** is enabled (see Step 1)
- Verify `DISCORD_GUILD_ID` in `.env.local` is correct
- Check that your guild has an icon set

**Icon not showing?**
- Hard refresh browser: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Clear browser cache
- Check that `public/favicon.ico` exists

**Want to use a custom icon instead?**
- Place your icon file in `public/favicon.ico` (ICO, PNG, or SVG format)
- The dashboard will automatically use it

## For Production (Vercel)

The icon files are automatically deployed with your app:
1. Run `npm run fetch-icon` locally
2. Commit the generated files:
   ```bash
   git add public/favicon.ico public/icon.png
   git commit -m "Add guild icon as favicon"
   git push
   ```
3. Vercel will deploy with your guild icon

## Manual Setup (Alternative)

If the automatic script doesn't work:

1. **Get your guild icon URL:**
   - Go to Discord → Your Server → Server Settings
   - Right-click server icon → Copy Image Address

2. **Download the icon:**
   - Open the URL in browser
   - Save image as `public/favicon.ico`

3. **Restart dev server**

## Icon Specifications

- **Format**: PNG, ICO, or SVG
- **Recommended size**: 256x256 pixels
- **Location**: `public/favicon.ico` (main favicon)
- **Also saves**: `public/icon.png` (for high-res displays)

## What Gets Used Where

- **Browser tab**: `favicon.ico`
- **Bookmarks**: `favicon.ico`
- **Mobile home screen**: `icon.png` (Apple devices)
- **PWA**: `icon.png` (if you add PWA support later)

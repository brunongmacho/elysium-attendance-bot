# Theme Customization Guide

Make the dashboard match your guild's unique style and branding!

## Quick Start - Choose a Preset

Open `lib/theme.ts` and uncomment one of the preset themes:

### 1. Dark Purple (Epic/Mythic Vibe) 💜
```typescript
// Uncomment lines for this theme in lib/theme.ts
primary: { 500: '#8b5cf6' } // Purple
accent: { 500: '#ec4899' }  // Pink
```
**Best for:** Mythic/Epic guilds, magic-themed

### 2. Golden Royal (Prestige Vibe) 👑
```typescript
primary: { 500: '#f59e0b' } // Gold
accent: { 500: '#fbbf24' }  // Bright gold
```
**Best for:** Elite guilds, luxury aesthetic

### 3. Crimson Blood (War/PvP Vibe) ⚔️
```typescript
primary: { 500: '#dc2626' } // Red
accent: { 500: '#f97316' }  // Orange-red
```
**Best for:** PvP guilds, aggressive playstyle

### 4. Emerald Nature (Life/Growth Vibe) 🌿
```typescript
primary: { 500: '#10b981' } // Green
accent: { 500: '#14b8a6' }  // Teal
```
**Best for:** PvE guilds, community-focused

### 5. Cyber Neon (Tech/Futuristic Vibe) 🤖
```typescript
primary: { 500: '#06b6d4' } // Cyan
accent: { 500: '#a855f7' }  // Purple
```
**Best for:** Modern aesthetic, tech-savvy guilds

## Custom Colors

### Step 1: Find Your Guild Colors

Got specific colors? Use these tools:
- [Coolors.co](https://coolors.co/) - Generate color palettes
- [ColorSpace](https://mycolor.space/) - Find matching colors
- Discord server settings - Copy your role colors!

### Step 2: Update `lib/theme.ts`

```typescript
export const guildTheme = {
  colors: {
    primary: {
      500: '#YOUR_PRIMARY_COLOR',  // Main brand color
      600: '#DARKER_SHADE',         // Hover states
      700: '#EVEN_DARKER',          // Active states
    },
    accent: {
      500: '#YOUR_ACCENT_COLOR',   // Highlights
    },
  },
};
```

### Step 3: Update CSS Variables (Optional)

For more control, edit `app/globals.css`:

```css
:root {
  --color-primary: #YOUR_COLOR;
  --color-accent: #YOUR_COLOR;
  /* ... etc */
}
```

## Customizing Specific Elements

### Guild Header

Edit `components/GuildHeader.tsx`:

```typescript
// Change guild name
name: 'YOUR_GUILD_NAME'

// Change tagline
tagline: 'Your Custom Tagline'

// Adjust header size
<h1 className="text-6xl"> {/* Make bigger */}
```

### Background Animation

Edit `app/globals.css` - `.animated-gradient` section:

```css
/* Slower animation */
animation: gradient-shift 30s ease infinite;

/* Different colors */
background: linear-gradient(
  -45deg,
  #your_color_1,
  #your_color_2,
  #your_color_3,
  #your_color_4
);
```

### Glow Effects

Adjust glow intensity in `globals.css`:

```css
.glow-primary {
  box-shadow: 0 0 40px rgba(59, 130, 246, 0.6); /* Stronger glow */
}
```

### Scrollbar

Match scrollbar to your theme in `globals.css`:

```css
::-webkit-scrollbar-thumb:hover {
  background: var(--color-accent); /* Use accent color */
}
```

## Advanced Customization

### Add Custom Fonts

1. **Download font** from [Google Fonts](https://fonts.google.com/)

2. **Add to `app/layout.tsx`:**
```typescript
import { Inter, Orbitron } from 'next/font/google'

const heading = Orbitron({ subsets: ['latin'] })
const body = Inter({ subsets: ['latin'] })
```

3. **Apply in components:**
```typescript
<h1 className={heading.className}>Title</h1>
```

### Custom Logo/Icon

Replace guild icon:
```bash
# Put your custom icon in public folder
public/
  icon.png        # Your custom icon (256x256)
  favicon.ico     # Browser tab icon
```

### Add Guild Motto/Banner

Edit `components/GuildHeader.tsx`:

```typescript
{/* Add below tagline */}
<p className="text-sm text-gray-400 italic mt-2">
  "Your guild motto here"
</p>
```

### Boss Card Colors

Want different boss card colors? Edit `components/BossCard.tsx`:

```typescript
const borderColor = {
  spawned: "border-red-500",    // Change to border-accent
  soon: "border-yellow-500",    // Change to border-warning
  ready: "border-green-500",    // Change to border-success
};
```

## Testing Your Changes

```bash
# Restart dev server to see changes
npm run dev

# Open in browser
http://localhost:3000

# Test in different browsers
# - Chrome
# - Firefox
# - Safari (Mac)
# - Mobile browsers
```

## Troubleshooting

**Colors not changing?**
- Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Check for typos in hex colors (#ffffff format)
- Make sure CSS variables are in `:root {}`

**Build errors?**
```bash
npm run build
# Fix any TypeScript errors shown
```

**Animations laggy?**
- Reduce animation duration (15s → 30s)
- Disable animations for low-end devices
- Test on target hardware

## Recommended Color Schemes

### Gaming Guilds
- **Primary:** #8b5cf6 (Purple) or #dc2626 (Red)
- **Accent:** #f59e0b (Gold) or #ec4899 (Pink)

### Competitive/PvP
- **Primary:** #dc2626 (Red) or #f97316 (Orange)
- **Accent:** #fbbf24 (Gold)

### Community/Casual
- **Primary:** #3b82f6 (Blue) or #10b981 (Green)
- **Accent:** #14b8a6 (Teal)

### Elite/Prestige
- **Primary:** #f59e0b (Gold) or #8b5cf6 (Purple)
- **Accent:** #fbbf24 (Bright Gold) or #ec4899 (Pink)

## Examples

### Example 1: Purple & Pink Gaming Theme
```typescript
// lib/theme.ts
primary: { 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
accent: { 500: '#ec4899', 600: '#db2777', 700: '#be185d' },
```

### Example 2: Gold & Red Prestige Theme
```typescript
// lib/theme.ts
primary: { 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
accent: { 500: '#dc2626', 600: '#b91c1c', 700: '#991b1b' },
```

### Example 3: Cyan & Purple Cyber Theme
```typescript
// lib/theme.ts
primary: { 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490' },
accent: { 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce' },
```

## Need Help?

1. Check browser console for errors (F12)
2. Validate colors: [Color Hex](https://www.color-hex.com/)
3. Test accessibility: [Contrast Checker](https://webaim.org/resources/contrastchecker/)
4. Ask in guild Discord!

Happy customizing! 🎨

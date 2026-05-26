# Elysium Dashboard - Project Structure

## 📁 Folder Organization

### **Root Structure**
```
elysium-dashboard/
├── app/                    # Next.js 14 App Router
├── components/             # React components
├── lib/                    # Utilities and helpers
├── types/                  # TypeScript type definitions
├── contexts/               # React contexts
├── hooks/                  # Custom React hooks
├── public/                 # Static assets
└── styles/                 # Global styles (if any)
```

---

## 🧩 Components Architecture

### **Component Organization**
```
components/
├── layout/                 # Layout primitives
│   ├── Container.tsx       # Max-width containers
│   ├── Stack.tsx           # Vertical/horizontal stacks
│   ├── Grid.tsx            # Responsive grid system
│   ├── Section.tsx         # Page sections with headers
│   ├── Box.tsx             # Polymorphic base component
│   └── index.ts            # Barrel exports
│
├── ui/                     # Shared UI primitives
│   ├── Button.tsx          # Button component
│   ├── Card.tsx            # Card components
│   ├── Input.tsx           # Form inputs
│   ├── Typography.tsx      # Text components
│   ├── Autocomplete.tsx    # Autocomplete search
│   ├── FilterChip.tsx      # Removable filter tags
│   ├── StatusIndicator.tsx # Status badges
│   ├── ConfirmationModal.tsx # Confirmation dialogs
│   ├── SkipLink.tsx        # Accessibility skip link
│   ├── EmptyState.tsx      # Empty state messaging
│   └── index.ts            # Barrel exports
│
├── BossCard.tsx            # Boss timer card
├── BossTimerGrid.tsx       # Boss grid with filters
├── LeaderboardPodium.tsx   # Top 3 podium display
├── Navbar.tsx              # Main navigation
├── Footer.tsx              # Page footer
├── GuildHeader.tsx         # Guild banner
├── BackToTop.tsx           # Scroll to top button
├── Providers.tsx           # App-wide providers
└── ... (other feature components)
```

### **Recommended Future Organization** (Atomic Design)
```
components/
├── atoms/                  # Basic building blocks
│   ├── Badge.tsx
│   ├── Icon.tsx
│   ├── Spinner.tsx
│   └── Typography.tsx
│
├── molecules/              # Simple combinations
│   ├── BossStatusBadge.tsx
│   ├── SearchInput.tsx
│   └── TimerDisplay.tsx
│
├── organisms/              # Complex components
│   ├── BossCard.tsx
│   ├── LeaderboardTable.tsx
│   └── Navbar.tsx
│
├── templates/              # Page layouts
│   ├── DashboardLayout.tsx
│   └── PageLayout.tsx
│
└── ui/                     # Shared primitives
```

---

## 🎨 Design System

### **Design Tokens**
```
lib/design-tokens/
├── colors.ts               # Color palette and semantic tokens
├── spacing.ts              # Spacing scale (4px base)
├── typography.ts           # Font sizes, weights, families
├── transitions.ts          # Animation timings and easing
├── z-index.ts              # Layering scale
└── index.ts                # Unified exports
```

**Usage Example:**
```typescript
import { tokens, zIndex } from '@/lib/design-tokens';

// Access design tokens
const primaryColor = tokens.colors.semantic.interactive.primary;
const spacing = tokens.spacing.named.md;

// Use z-index
style={{ zIndex: zIndex.modal }}
```

---

## 📐 Layout System

### **Layout Components**

#### **Container**
Max-width container with responsive padding
```tsx
<Container size="default">  {/* sm | default | lg | full */}
  <YourContent />
</Container>
```

#### **Stack**
Vertical or horizontal layout with consistent spacing
```tsx
<Stack gap="lg" direction="vertical" align="center">
  <Item1 />
  <Item2 />
  <Item3 />
</Stack>
```

#### **Grid**
Responsive grid system
```tsx
<Grid
  columns={{ xs: 1, sm: 2, md: 3, lg: 4 }}
  gap="md"
>
  {items.map(item => <Card key={item.id} />)}
</Grid>
```

#### **Section**
Page section with optional title, description, and action
```tsx
<Section
  title="Boss Timers"
  description="Track spawn times for all guild bosses"
  action={<Button>Add Boss</Button>}
  spacing="relaxed"
>
  <BossTimerGrid />
</Section>
```

#### **Box**
Polymorphic component for flexible element rendering
```tsx
<Box>Default div</Box>
<Box as="section">Semantic section</Box>
<Box as={Link} href="/timers">Styled link</Box>
```

---

## 🔤 Typography System

### **Typography Component**
```tsx
import { Typography } from '@/components/ui';

<Typography variant="h1">Heading 1</Typography>
<Typography variant="h2">Heading 2</Typography>
<Typography variant="body">Body text</Typography>
<Typography variant="caption">Caption text</Typography>
```

**Variants:**
- `display` - Hero text (fluid-4xl, bold, decorative)
- `h1` - Main heading (fluid-3xl, bold, decorative)
- `h2` - Section heading (fluid-2xl, semibold, decorative)
- `h3` - Subsection (fluid-xl, semibold)
- `h4` - Minor heading (fluid-lg, medium)
- `body` - Paragraph text (fluid-base)
- `small` - Small text (fluid-sm)
- `caption` - Caption/metadata (fluid-xs, muted)

---

## 🎯 App Router Structure

```
app/
├── (routes)/
│   ├── page.tsx            # Homepage (/)
│   ├── timers/
│   │   └── page.tsx        # Boss timers (/timers)
│   ├── leaderboard/
│   │   └── page.tsx        # Leaderboards (/leaderboard)
│   └── profile/
│       └── [id]/
│           └── page.tsx    # Member profile (/profile/:id)
│
├── api/                    # API routes
│   ├── bosses/
│   │   └── route.ts        # Boss timers API
│   ├── members/
│   │   └── route.ts        # Leaderboard API
│   └── auth/
│       └── [...nextauth]/
│           └── route.ts    # NextAuth handlers
│
├── layout.tsx              # Root layout
├── globals.css             # Global styles
└── error.tsx               # Error boundary
```

---

## 🔧 Lib Structure

```
lib/
├── design-tokens/          # Design system tokens
├── boss-config.ts          # Boss configuration
├── boss-glow.ts            # Boss glow calculations
├── constants.ts            # App constants
├── fetch-utils.ts          # Fetch utilities
├── mongodb.ts              # Database connection
├── timezone.ts             # Timezone helpers
└── utils.ts                # General utilities
```

---

## 🎨 Styling Approach

### **Utility-First with Tailwind**
- Use Tailwind classes for most styling
- Custom utilities in `globals.css` for reusable patterns
- Component-specific styles inline or in CSS modules

### **Design Token Integration**
- CSS variables for theme colors
- Tailwind extended with design tokens
- Consistent spacing, typography, and colors

### **CSS Utility Classes**
```css
.tap-target          /* Touch-friendly 44x44px minimum */
.glass              /* Glass morphism effect */
.surface-raised     /* Elevated surface */
.interactive        /* Hover/active states */
.truncate-2         /* Multi-line truncation */
```

---

## 📦 Type Definitions

```
types/
├── api.ts                  # API response types
├── database.ts             # Database model types
└── next-auth.d.ts          # NextAuth type extensions
```

---

## 🪝 Hooks Structure

```
hooks/
├── useRipple.ts            # Ripple effect hook
├── useDebounce.ts          # Debounce values
└── useMediaQuery.ts        # Responsive queries (if needed)
```

---

## 🌐 Contexts

```
contexts/
├── TimerContext.tsx        # Shared timer for performance
└── ThemeContext.tsx        # Theme provider (future)
```

---

## 📱 Responsive Design Breakpoints

```typescript
// Tailwind breakpoints
sm: 640px   // Mobile landscape
md: 768px   // Tablet
lg: 1024px  // Laptop
xl: 1280px  // Desktop
2xl: 1536px // Large desktop
```

---

## 🎨 Color System

### **Semantic Colors**
- `--color-primary` - Brand color (Crimson)
- `--color-accent` - Accent color (Orange)
- `--color-success` - Success states (Green)
- `--color-warning` - Warning states (Yellow)
- `--color-danger` - Error/danger states (Red)
- `--color-info` - Informational (Blue)

### **Background Layers**
- `--color-bg-primary` - Base background
- `--color-bg-secondary` - Raised surfaces
- `--color-bg-tertiary` - Elevated elements

---

## 🚀 Best Practices

### **Component Composition**
✅ Use layout components (`Container`, `Stack`, `Grid`, `Section`)
✅ Compose complex UIs from simple primitives
✅ Leverage polymorphic `Box` for flexibility

### **Styling**
✅ Use design tokens for consistency
✅ Follow mobile-first responsive design
✅ Ensure 44x44px minimum touch targets
✅ Use fluid typography for scalability

### **Performance**
✅ Memoize expensive components
✅ Use Next.js Image optimization
✅ Lazy load heavy components
✅ Leverage SWR for data fetching

### **Accessibility**
✅ Use semantic HTML elements
✅ Include ARIA labels where needed
✅ Ensure keyboard navigation
✅ Test with screen readers

---

## 📚 Import Aliases

```typescript
// Configured in tsconfig.json
import Component from '@/components/...'
import { utility } from '@/lib/...'
import type { Type } from '@/types/...'
```

---

This structure provides a scalable, maintainable foundation for the Elysium Dashboard with clear separation of concerns and consistent design patterns.

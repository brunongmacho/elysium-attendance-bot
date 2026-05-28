# ⚔️ Elysium Dashboard

> A modern, feature-rich web dashboard for the Elysium Discord bot - Real-time boss tracking, member management, and guild analytics.

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green)](https://www.mongodb.com/)

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Screenshots](#-screenshots)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Development](#-development)
- [Deployment](#-deployment)
- [Project Structure](#-project-structure)
- [API Routes](#-api-routes)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [License](#-license)

## 🌟 Overview

The **Elysium Dashboard** is a comprehensive web application that provides guild members with real-time access to boss timers, performance leaderboards, event schedules, and detailed member statistics. Built with Next.js 14 and MongoDB, it seamlessly integrates with the Elysium Discord bot to deliver a premium guild management experience.

**Key Highlights:**
- 🕐 **Real-time Boss Timers** with live countdown and predictive spawn tracking
- 🏆 **Interactive Leaderboards** for attendance and bidding points
- 📊 **Member Analytics** with detailed statistics and performance charts
- 📅 **Event Scheduling** for daily and weekly guild activities
- 🔐 **Discord OAuth** authentication with role-based permissions
- 🎨 **Modern UI** with glass morphism, animations, and responsive design
- ⚡ **Performance Optimized** with server-side rendering and edge caching

## 🎯 Features

### Boss Timer Dashboard
- **Live Countdown Timers** - Real-time tracking with second-by-second updates
- **Predictive Spawn Times** - ML-enhanced predictions based on historical data
- **Visual Status Indicators** - Color-coded cards (spawning soon, ready, overdue)
- **Boss Information** - Points, intervals, and spawn patterns
- **Advanced Filtering** - Search, filter by type, and sort by spawn time
- **Mark as Killed** - Admin feature with attendance tracking integration
- **Mobile Optimized** - Touch-friendly interface with swipe gestures

### Event Schedule
- **Daily Events** - World Boss, Guild Dungeon, Arena battles
- **Weekly Events** - Guild Boss, GvG, special activities
- **Time Conversions** - Automatic timezone adjustments (supports Manila time)
- **Visual Calendar** - Color-coded event cards with icons
- **Countdown Timers** - Time until next occurrence

### Member Leaderboards
- **Attendance Rankings** - Total kills, points earned, attendance rate, streaks
- **Bidding Points** - Available points, earned, spent, consumption rate
- **Top 3 Podium** - Animated podium display with medals
- **Interactive Tables** - Sortable columns, search, pagination
- **Profile Links** - Click to view detailed member profiles
- **Role Badges** - Leader, Vice Leader, Core member indicators

### Member Profiles
- **Statistics Overview** - Points, attendance, streaks, join date
- **Boss Breakdown** - Interactive charts showing kills per boss
- **Attendance History** - Calendar heatmap with activity tracking
- **Auction Wins** - Items won and points spent
- **Recent Activity** - Latest boss kills and participation
- **Member Lore** - Custom titles, specialties, and achievements

### Authentication & Security
- **Discord OAuth2** - Secure login via Discord
- **Guild Verification** - Automatic membership validation
- **Role-Based Access** - Admin, Leader, Core, Member permissions
- **Session Management** - Secure session handling with NextAuth.js
- **Remember Me** - Persistent login option
- **Auto Logout** - Inactivity timeout protection

### UI/UX Excellence
- **Glass Morphism** - Modern, elegant design with backdrop blur effects
- **Smooth Animations** - Framer Motion for delightful interactions
- **Responsive Design** - Mobile-first approach, works on all devices
- **Dark Theme** - Eye-friendly dark mode with customizable accents
- **Accessibility** - WCAG AA compliant, keyboard navigation, screen reader support
- **Loading States** - Skeleton loaders for smooth user experience
- **Error Handling** - Graceful error messages with retry options

## 🚀 Tech Stack

### Frontend
- **[Next.js 14](https://nextjs.org/)** - React framework with App Router
- **[React 18](https://react.dev/)** - UI library with server components
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Framer Motion](https://www.framer.com/motion/)** - Animation library
- **[Recharts](https://recharts.org/)** - Data visualization
- **[date-fns](https://date-fns.org/)** - Date manipulation and formatting
- **[SWR](https://swr.vercel.app/)** - Data fetching with stale-while-revalidate strategy

### Backend
- **[Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)** - Serverless API endpoints
- **[MongoDB](https://www.mongodb.com/)** - NoSQL database (Atlas)
- **[NextAuth.js](https://next-auth.js.org/)** - Authentication framework
- **[Zod](https://zod.dev/)** - Schema validation

### Development & Deployment
- **[Koyeb](https://koyeb.com/)** - Hosting and deployment
- **[ESLint](https://eslint.org/)** - Code linting
- **[Git](https://git-scm.com/)** - Version control

## 📸 Screenshots

*Coming soon - The dashboard features a modern glass morphism design with real-time boss timers, interactive leaderboards, and detailed member analytics.*

## 🏁 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** and **npm** - [Download](https://nodejs.org/)
- **MongoDB Atlas Account** - [Sign up](https://www.mongodb.com/cloud/atlas)
- **Discord Application** - For OAuth2 ([Create here](https://discord.com/developers/applications))
- **Git** - [Download](https://git-scm.com/)

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/brunongmacho/elysium-dashboard.git
cd elysium-dashboard
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration (see [Environment Variables](#-environment-variables) section).

4. **Verify MongoDB connection**

```bash
npm run dev
```

Visit `http://localhost:3000/api/health` to check the database connection.

5. **Open the application**

Navigate to `http://localhost:3000` in your browser.

## 🔐 Environment Variables

Create a `.env.local` file in the root directory with the following variables:

### MongoDB Configuration

```env
# Your MongoDB Atlas connection string
# Database should be "elysium-bot" (same as Discord bot)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/elysium-bot?retryWrites=true&w=majority
MONGODB_DB_NAME=elysium-bot
```

**Setup Instructions:**
1. Create a MongoDB Atlas cluster (free tier available)
2. Add your IP to the whitelist (or use `0.0.0.0/0` for cloud deployments)
3. Create a database user with read/write permissions
4. Copy the connection string and replace `<username>` and `<password>`

### Discord OAuth2 Configuration

```env
# Create at: https://discord.com/developers/applications
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# Your guild (server) ID
# Enable Developer Mode in Discord → Right-click server → Copy ID
DISCORD_GUILD_ID=your_guild_id

# Role IDs for permissions
# Right-click role → Copy ID
DISCORD_ELYSIUM_ROLE_ID=your_elysium_role_id       # Required for "Mark as Killed"
DISCORD_ADMIN_ROLE_ID=your_admin_role_id            # Admin permissions
DISCORD_LEADER_ROLE_ID=your_leader_role_id          # Leader badge
DISCORD_VICE_LEADER_ROLE_ID=your_vice_leader_role_id
DISCORD_CORE_ROLE_ID=your_core_role_id
```

**Discord OAuth Setup:**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to OAuth2 → General
4. Add redirect URLs:
   - Development: `http://localhost:3000/api/auth/callback/discord`
   - Production: `https://your-domain.com/api/auth/callback/discord`
5. Copy Client ID and Client Secret

See [DISCORD_OAUTH_SETUP.md](./DISCORD_OAUTH_SETUP.md) for detailed instructions.

### NextAuth Configuration

```env
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=your_random_secret_key_here

# Application URL
# Development: http://localhost:3000
# Production: https://your-domain.com
NEXTAUTH_URL=http://localhost:3000
```

### Application Settings

```env
# Default timezone (GMT+8 for Manila)
NEXT_PUBLIC_TIMEZONE=Asia/Manila

# Enable debug logging
NEXT_PUBLIC_DEBUG=false
```

## 💻 Development

### Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint code
npm run lint

# Fetch guild icon from Discord
npm run fetch-icon
```

### Development Workflow

1. **Start the dev server**
   ```bash
   npm run dev
   ```
   Opens at `http://localhost:3000`

2. **Make changes**
   - Edit files in `app/`, `components/`, or `lib/`
   - Hot reload automatically updates the browser

3. **Test your changes**
   - Check the browser for visual changes
   - Test API endpoints via `/api/*` routes
   - Verify MongoDB queries in the console

4. **Commit your work**
   ```bash
   git add .
   git commit -m "feat: Add new feature"
   git push
   ```

### Adding New Features

**Example: Adding a new page**

1. Create page file:
   ```typescript
   // app/new-page/page.tsx
   export default function NewPage() {
     return <div>New Page Content</div>;
   }
   ```

2. Add navigation link:
   ```typescript
   // components/Navbar.tsx
   <Link href="/new-page">New Page</Link>
   ```

3. Create API route (if needed):
   ```typescript
   // app/api/new-endpoint/route.ts
   export async function GET() {
     return Response.json({ data: [] });
   }
   ```

See [STRUCTURE.md](./STRUCTURE.md) for detailed project architecture.

## 🚢 Deployment

### Deploy to Koyeb (Current Platform)

The dashboard is currently deployed on Koyeb. For deployment:

1. **Build for production**
   ```bash
   npm run build
   ```

2. **Configure environment variables**
   - Set all variables from `.env.example` in your hosting platform
   - **Important:** Update `NEXTAUTH_URL` to your production URL

3. **Deploy**
   - Follow your hosting platform's deployment instructions
   - Ensure Node.js 18+ is supported

#### Post-Deployment Checklist

- [ ] Update `NEXTAUTH_URL` in production environment variables
- [ ] Add production callback URL to Discord OAuth settings
- [ ] Configure MongoDB Atlas IP whitelist (`0.0.0.0/0` for cloud deployments)
- [ ] Test authentication flow
- [ ] Verify MongoDB connection
- [ ] Check all features work correctly

### Deployment Options

| Platform | Difficulty | Cost | Features |
|----------|-----------|------|----------|
| **Koyeb** ✅ | Easy | Free tier available | Automatic deployments, global edge network |
| **Netlify** | Easy | Free tier available | Automatic deployments, edge functions |
| **Railway** | Medium | Pay-as-you-go | Database hosting included |
| **AWS Amplify** | Medium | Pay-as-you-go | AWS ecosystem integration |
| **Self-hosted** | Hard | Variable | Full control |

## 📁 Project Structure

```
elysium-dashboard/
├── app/                          # Next.js 14 App Router
│   ├── api/                      # API routes
│   │   ├── auth/                 # NextAuth endpoints
│   │   ├── bosses/               # Boss timer APIs
│   │   ├── members/              # Member & leaderboard APIs
│   │   └── health/               # Health check
│   ├── events/                   # Event schedule page
│   ├── leaderboard/              # Leaderboard page
│   ├── profile/[memberId]/       # Member profile pages
│   ├── timers/                   # Boss timers page
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Homepage (guild info)
│   └── globals.css               # Global styles
│
├── components/                   # React components
│   ├── layout/                   # Layout primitives
│   │   ├── Container.tsx         # Max-width containers
│   │   ├── Grid.tsx              # Responsive grid system
│   │   ├── Stack.tsx             # Flex layouts
│   │   └── Section.tsx           # Page sections
│   ├── ui/                       # UI primitives
│   │   ├── Button.tsx            # Button component
│   │   ├── Card.tsx              # Card components
│   │   ├── Typography.tsx        # Text components
│   │   ├── Badge.tsx             # Badges & tags
│   │   └── ...                   # Other UI components
│   ├── BossCard.tsx              # Boss timer card
│   ├── BossTimerGrid.tsx         # Boss grid with filters
│   ├── Countdown.tsx             # Live countdown timer
│   ├── EventScheduleCard.tsx     # Event display card
│   ├── LeaderboardPodium.tsx     # Top 3 podium
│   ├── Navbar.tsx                # Main navigation
│   ├── Footer.tsx                # Page footer
│   ├── GuildHeader.tsx           # Guild banner
│   └── ...                       # Other components
│
├── lib/                          # Utilities & helpers
│   ├── mongodb.ts                # MongoDB connection
│   ├── boss-config.ts            # Boss configuration utilities
│   ├── boss-glow.ts              # Boss glow color logic
│   ├── timezone.ts               # Timezone conversions
│   ├── fetch-utils.ts            # Fetch helpers
│   ├── env-validation.ts         # Environment validation
│   └── theme.ts                  # Theme utilities
│
├── types/                        # TypeScript definitions
│   ├── database.ts               # MongoDB schema types
│   ├── api.ts                    # API response types
│   └── next-auth.d.ts            # NextAuth type extensions
│
├── contexts/                     # React contexts
│   └── TimerContext.tsx          # Shared timer for countdowns
│
├── public/                       # Static assets
│   ├── bosses/                   # Boss images
│   └── ...                       # Other assets
│
├── scripts/                      # Utility scripts
│   └── fetch-guild-icon.js       # Fetch Discord guild icon
│
├── boss_spawn_config.json        # Boss spawn configuration
├── boss_points.json              # Boss point values
├── member-lore.json              # Member titles & lore
├── guild-stats.json              # Guild statistics
│
├── .env.example                  # Environment template
├── .env.local                    # Your environment (gitignored)
├── next.config.js                # Next.js configuration
├── tailwind.config.ts            # Tailwind CSS config
├── tsconfig.json                 # TypeScript config
└── package.json                  # Dependencies
```

### Key Directories

- **`app/`** - Next.js 14 App Router (pages and API routes)
- **`components/`** - Reusable React components
- **`lib/`** - Business logic, utilities, and database connections
- **`types/`** - TypeScript type definitions
- **`public/`** - Static assets served directly

## 🔌 API Routes

### Boss Timers

```typescript
GET /api/bosses
// Returns all boss timers with next spawn predictions

GET /api/bosses/[name]
// Returns specific boss timer data

POST /api/bosses/[name]
// Mark boss as killed (requires authentication & permissions)
// Body: { killedBy: string, timestamp: string }
```

### Members & Leaderboards

```typescript
GET /api/members?type=attendance&limit=50
// Returns attendance leaderboard

GET /api/members?type=points&limit=50
// Returns bidding points leaderboard

GET /api/members/[memberId]
// Returns detailed member profile with stats
```

### Authentication

```typescript
GET /api/auth/session
// Returns current user session

POST /api/auth/signin
// Initiates Discord OAuth flow

POST /api/auth/signout
// Logs out the user
```

### Health Check

```typescript
GET /api/health
// Returns database connection status and system health
```

## 📚 Documentation

Comprehensive documentation is available:

- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** - Full development roadmap and architecture
- **[DISCORD_OAUTH_SETUP.md](./DISCORD_OAUTH_SETUP.md)** - Discord OAuth2 configuration guide
- **[STRUCTURE.md](./STRUCTURE.md)** - Detailed project structure and design system
- **[MONGODB_INDEXES.md](./MONGODB_INDEXES.md)** - Database indexes for performance
- **[GUILD_ICON_SETUP.md](./GUILD_ICON_SETUP.md)** - Guild icon configuration
- **[THEME_CUSTOMIZATION.md](./THEME_CUSTOMIZATION.md)** - Theme customization guide
- **[BOT_EXPLORATION_SUMMARY.md](./BOT_EXPLORATION_SUMMARY.md)** - Bot architecture analysis

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/brunongmacho/elysium-dashboard/issues)
2. Create a new issue with:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots (if applicable)
   - Environment details (browser, OS, etc.)

### Suggesting Features

1. Check [existing feature requests](https://github.com/brunongmacho/elysium-dashboard/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement)
2. Create a new issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Mockups or examples (if applicable)

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit with clear messages (`git commit -m 'feat: Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- **Code Style:** Follow the existing code style (ESLint config)
- **TypeScript:** Maintain type safety, avoid `any`
- **Components:** Use functional components with hooks
- **Commits:** Follow [Conventional Commits](https://www.conventionalcommits.org/)
- **Testing:** Test your changes on desktop and mobile
- **Documentation:** Update relevant docs if needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Elysium Guild** - For being an awesome community
- **Discord Bot** - [elysium-attendance-bot](https://github.com/brunongmacho/elysium-attendance-bot)
- **Next.js Team** - For the amazing framework
- **Koyeb** - For reliable hosting and deployment
- **MongoDB Atlas** - For database hosting

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/brunongmacho/elysium-dashboard/issues)
- **Discord:** [Join Elysium Guild](https://discord.gg/GD3pKqpnF)
- **Documentation:** Check the `/docs` folder

## 🔮 Roadmap

### Completed ✅
- [x] Boss timer dashboard with live countdowns
- [x] Member leaderboards (attendance & points)
- [x] Discord OAuth authentication
- [x] Member profile pages with analytics
- [x] Event schedule page
- [x] Mark as killed feature
- [x] Mobile responsive design
- [x] Glass morphism UI with animations

### In Progress 🚧
- [ ] PWA support with offline mode
- [ ] Push notifications for boss spawns
- [ ] Advanced analytics dashboard

### Planned 📋
- [ ] WebSocket for real-time updates
- [ ] Auction bidding interface
- [ ] Guild alliance rotation view
- [ ] Export data to CSV
- [ ] Admin panel for boss management
- [ ] Mobile app (React Native)
- [ ] Multi-language support
- [ ] Custom theme builder

---

<div align="center">

**Made with ❤️ for the Elysium Guild**

⚔️ Where Chaos Becomes Strategy ⚔️

[Discord](https://discord.gg/GD3pKqpnF) • [Report Bug](https://github.com/brunongmacho/elysium-dashboard/issues) • [Request Feature](https://github.com/brunongmacho/elysium-dashboard/issues)

</div>

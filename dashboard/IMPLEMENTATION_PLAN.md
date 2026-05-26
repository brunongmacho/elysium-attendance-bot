# Elysium Dashboard - Implementation Plan

## 📋 Executive Summary

Creating a Next.js web dashboard for the Elysium Discord bot that displays real-time boss timers, member leaderboards, auction data, and member profiles. The dashboard will connect to the existing MongoDB Atlas database (Singapore region) used by the bot.

---

## 🔍 Bot Architecture Analysis

### Current MongoDB Schema (7 Collections)

Based on analysis of the bot repository:

#### 1. **members** Collection (~50 documents, 100KB)
```javascript
{
  _id: "discord_user_id",
  username: "PlayerName",
  pointsAvailable: 150,
  pointsEarned: 200,
  pointsSpent: 50,
  attendance: {
    total: 87,
    thisWeek: 5,
    thisMonth: 18,
    byBoss: { "Venatus": 25, "Viorent": 22, ... },
    streak: { current: 12, longest: 45 }
  },
  joinedAt: ISODate("2024-01-15"),
  lastActive: ISODate("2025-11-28")
}
```

#### 2. **attendance** Collection (~400K documents, 80MB)
```javascript
{
  _id: ObjectId("..."),
  memberId: "discord_user_id",
  memberName: "PlayerName",
  bossName: "Venatus",
  bossPoints: 1,
  timestamp: ISODate("2025-11-28T14:30:00Z"),
  weekStartDate: ISODate("2025-11-24"),
  weekLabel: "ELYSIUM_WEEK_11_24",
  verified: true,
  threadId: "discord_thread_id"
}
```

#### 3. **bossTimers** Collection (from mongodb-helpers.js)
```javascript
{
  bossName: "Venatus",
  lastKillTime: ISODate("2025-11-28T14:00:00Z"),
  nextSpawnTime: ISODate("2025-11-29T00:00:00Z"),
  killedBy: "PlayerName",
  serverDown: false,
  updatedAt: ISODate("2025-11-28T14:00:00Z")
}
```

#### 4. **auctionItems** Collection (~500/year, 250KB)
```javascript
{
  _id: ObjectId("..."),
  itemName: "Evil Glove [1]",
  startPrice: 40,
  duration: 30,
  boss: "Venatus",
  status: "sold", // pending, active, sold, cancelled
  winner: "PlayerName",
  winnerId: "discord_user_id",
  winningBid: 45,
  soldAt: ISODate("2025-11-28")
}
```

#### 5. **auctionSessions** Collection (~52/year, 520KB)
```javascript
{
  _id: ObjectId("..."),
  sessionNumber: 1,
  sessionDate: "11/23/24 12:00",
  items: [...],
  memberSpending: [...],
  totalItemsSold: 5,
  totalPointsSpent: 200
}
```

#### 6. **bossRotation** Collection (~30 documents, 30KB)
```javascript
{
  bossName: "Venatus",
  guilds: [
    { name: "ELYSIUM", index: 0 },
    { name: "AllyGuild1", index: 1 }
  ],
  currentTurnIndex: 0,
  currentGuild: "ELYSIUM"
}
```

#### 7. **botState** Collection (3 documents, 10KB)
- Stores crash recovery state for attendance, auction, and boss timers

### Boss Configuration

**Timer-Based Bosses (22):** Spawn at kill time + interval
- 10h interval: Venatus, Viorent
- 21h interval: Ego
- 24h interval: Livera, Araneo, Undomiel
- 18-62h intervals: Various others

**Schedule-Based Bosses (14):** Spawn at fixed weekly times
- Clemantis: Mon 11:30, Thu 19:00
- Saphirus: Sun 17:00, Tue 11:30
- Guild Boss: Mon 21:00
- etc.

**Points System:**
- 1 pt: Basic bosses (Venatus, Viorent, etc.)
- 2 pts: Mid-tier (Milavy, Wannitas, etc.)
- 3 pts: High-tier (Catena, Auraq, etc.)
- 4 pts: Elite (Icaruthia, Motti, Nevaeh)
- 5 pts: GvG
- 15 pts: Guild Boss

---

## 🎯 Dashboard Requirements

### 1. Boss Timer Dashboard (Priority 1)
**Real-time boss spawn tracking with player cards showing:**
- Player name (killedBy from bossTimers)
- Boss name
- Last kill timestamp
- Next spawn time with live countdown
- Spawn interval (10h, 24h, etc.)
- Status indicator (spawning soon, ready, etc.)
- "Mark as Killed" button (admin only)

**Data Source:**
- Primary: `bossTimers` collection
- Fallback: Calculate from `attendance` collection using `getLastBossSpawn()`
- Config: `boss_spawn_config.json` for intervals/schedules

**Features:**
- Live countdown timers (update every second)
- Color coding (red = spawned, yellow = <30min, green = >30min)
- Filter by boss type (timer/schedule based)
- Search bosses
- Sort by spawn time

### 2. Member Leaderboards (Priority 2)
**Two leaderboards:**

**Attendance Leaderboard:**
- Rank, Username, Total Kills, Points Earned, Attendance Rate, Current Streak
- Data from: `members.attendance` aggregated fields

**Bidding Points Leaderboard:**
- Rank, Username, Points Available, Points Earned, Points Spent, Consumption Rate
- Data from: `members.pointsAvailable`, `pointsEarned`, `pointsSpent`

**Features:**
- Top 10/25/50/All toggle
- Search members
- Click member → view profile

### 3. Auction History (Priority 3)
**Recent auction sessions with:**
- Session number, date, items sold, total points spent
- Expandable item list showing: item name, winner, winning bid
- Data from: `auctionSessions` and `auctionItems`

**Current auction status:**
- Active item (if any) from `botState.auction_state`
- Pending queue from `auctionItems` where status='pending'

### 4. Member Profile Page (Priority 4)
**Detailed member view:**
- Username, Discord ID, Join Date, Last Active
- Points summary (available, earned, spent)
- Attendance breakdown by boss (chart)
- Recent boss kills (last 10)
- Auction wins history
- Attendance streak calendar heatmap
- Data from: `members`, `attendance`, `auctionItems`

### 5. Discord OAuth2 Authentication
**Guild-only access:**
- Discord OAuth2 login
- Verify user is member of ELYSIUM guild
- Admin role detection for "Mark as Killed" feature
- Session management with NextAuth.js

---

## 🏗️ Technical Architecture

### Tech Stack
```
Frontend:
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Framer Motion (animations)
- Chart.js / Recharts (analytics)
- date-fns (date handling)

Backend:
- Next.js API Routes
- MongoDB Node.js Driver
- NextAuth.js (Discord provider)

Deployment:
- Vercel (free tier)
- MongoDB Atlas (existing Singapore cluster)
```

### Project Structure
```
elysium-dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Boss timers dashboard
│   │   ├── leaderboard/
│   │   │   └── page.tsx            # Leaderboards
│   │   ├── auctions/
│   │   │   └── page.tsx            # Auction history
│   │   ├── member/
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Member profile
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/
│   │   │   │       └── route.ts   # NextAuth config
│   │   │   ├── bosses/
│   │   │   │   ├── route.ts       # GET all boss timers
│   │   │   │   └── [name]/
│   │   │   │       └── route.ts   # POST mark as killed
│   │   │   ├── members/
│   │   │   │   ├── route.ts       # GET leaderboards
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts   # GET member details
│   │   │   ├── auctions/
│   │   │   │   └── route.ts       # GET auction data
│   │   │   └── attendance/
│   │   │       └── route.ts       # GET attendance records
│   │   └── layout.tsx              # Root layout
│   ├── components/
│   │   ├── BossCard.tsx            # Boss timer card
│   │   ├── BossTimerGrid.tsx       # Grid of boss cards
│   │   ├── Leaderboard.tsx         # Leaderboard table
│   │   ├── MemberProfile.tsx       # Member profile view
│   │   ├── AuctionHistory.tsx      # Auction list
│   │   ├── Countdown.tsx           # Live countdown timer
│   │   ├── Navbar.tsx              # Navigation
│   │   └── AuthButton.tsx          # Login/logout
│   ├── lib/
│   │   ├── mongodb.ts              # MongoDB connection
│   │   ├── auth.ts                 # NextAuth config
│   │   ├── boss-config.ts          # Boss spawn config
│   │   └── utils.ts                # Utilities
│   └── types/
│       ├── boss.ts                 # Boss types
│       ├── member.ts               # Member types
│       └── auction.ts              # Auction types
├── public/
│   └── boss-images/                # Boss images (if any)
├── boss_spawn_config.json          # Copied from bot repo
├── boss_points.json                # Copied from bot repo
├── .env.local                      # Environment variables
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### Environment Variables (.env.local)
```bash
# MongoDB Atlas
MONGODB_URI=mongodb+srv://...          # Your MongoDB connection string

# Discord OAuth2
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_GUILD_ID=your_guild_id        # ELYSIUM guild ID
DISCORD_ADMIN_ROLE_ID=admin_role_id   # For "Mark as Killed" permission

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=random_secret_key
```

---

## 📊 Database Queries (Optimized)

### Boss Timers (Homepage)
```javascript
// API route: /api/bosses
const bossTimers = await db.collection('bossTimers').find({}).toArray();

// For bosses without timers, fallback to attendance
const lastSpawn = await db.collection('attendance')
  .find({ bossName: 'Venatus' })
  .sort({ timestamp: -1 })
  .limit(1)
  .toArray();

// Calculate next spawn using boss_spawn_config.json
```

### Leaderboards
```javascript
// Attendance leaderboard
const attendanceLeaders = await db.collection('members')
  .find({ isActive: true })
  .project({ username: 1, attendance: 1, pointsEarned: 1 })
  .sort({ 'attendance.total': -1 })
  .limit(50)
  .toArray();

// Points leaderboard
const pointsLeaders = await db.collection('members')
  .find({ isActive: true })
  .project({ username: 1, pointsAvailable: 1, pointsEarned: 1, pointsSpent: 1 })
  .sort({ pointsAvailable: -1 })
  .limit(50)
  .toArray();
```

### Member Profile
```javascript
const member = await db.collection('members').findOne({ _id: userId });

const recentAttendance = await db.collection('attendance')
  .find({ memberId: userId })
  .sort({ timestamp: -1 })
  .limit(20)
  .toArray();

const auctionWins = await db.collection('auctionItems')
  .find({ winnerId: userId, status: 'sold' })
  .sort({ soldAt: -1 })
  .limit(10)
  .toArray();
```

### Auction History
```javascript
const sessions = await db.collection('auctionSessions')
  .find({})
  .sort({ sessionNumber: -1 })
  .limit(20)
  .toArray();

const pendingItems = await db.collection('auctionItems')
  .find({ status: 'pending' })
  .sort({ addedAt: 1 })
  .toArray();
```

---

## 🎨 UI/UX Design

### Boss Timer Card (Main Dashboard)
```
┌────────────────────────────────────┐
│ VENATUS                      [1 pt]│
│                                     │
│ 👤 PlayerName                      │
│ 🕐 Last Kill: 11/28 14:00         │
│ ⏰ Next Spawn: 11/29 00:00        │
│                                     │
│    ⏱️ 05h 23m 15s                  │
│                                     │
│ Interval: 10 hours                 │
│                                     │
│ [Mark as Killed] ← Admin only      │
└────────────────────────────────────┘
```

**Color States:**
- 🟢 Green: >30 minutes away
- 🟡 Yellow: <30 minutes away
- 🔴 Red: Spawn time passed
- ⚪ Gray: No timer data (schedule-based)

### Leaderboard Table
```
┌──────────────────────────────────────────────────────────┐
│  Rank │ Player         │ Kills │ Points │ Rate │ Streak  │
├──────────────────────────────────────────────────────────┤
│  🥇 1  │ TopPlayer      │  287  │  350   │ 89%  │  45     │
│  🥈 2  │ SecondPlace    │  265  │  320   │ 82%  │  23     │
│  🥉 3  │ ThirdPlace     │  241  │  295   │ 75%  │  12     │
│    4   │ FourthPlace    │  198  │  240   │ 62%  │   8     │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 Implementation Phases

### Phase 1: Project Setup & MongoDB Connection
**Tasks:**
1. Initialize Next.js 14 with TypeScript & Tailwind
2. Set up MongoDB connection utility
3. Create environment variables
4. Copy boss_spawn_config.json and boss_points.json
5. Create TypeScript types for all data models
6. Test MongoDB connection with simple query

**Deliverables:**
- Working Next.js app
- MongoDB connection established
- Type definitions created

**Testing:**
- Verify can read from MongoDB Atlas
- Check all 7 collections are accessible

---

### Phase 2: Boss Timer Dashboard
**Tasks:**
1. Create BossCard component with countdown timer
2. Fetch boss timers from MongoDB
3. Calculate next spawn times using config
4. Implement fallback to attendance records
5. Add live countdown (updates every second)
6. Implement color coding based on time remaining
7. Add filter/search functionality
8. Grid layout with responsive design

**Deliverables:**
- Homepage with all boss timers
- Real-time countdown
- Responsive grid layout

**Testing:**
- Verify countdown accuracy
- Test fallback mechanism
- Check mobile responsiveness

---

### Phase 3: Discord OAuth2 Authentication
**Tasks:**
1. Set up NextAuth.js with Discord provider
2. Configure Discord OAuth2 application
3. Implement guild membership verification
4. Add admin role detection
5. Create login/logout UI
6. Protect API routes

**Deliverables:**
- Working Discord login
- Guild-only access
- Admin permissions

**Testing:**
- Test login flow
- Verify guild membership check
- Test admin vs non-admin access

---

### Phase 4: Mark as Killed Feature
**Tasks:**
1. Create POST /api/bosses/[name] endpoint
2. Update bossTimers collection
3. Add attendance record
4. Update member stats
5. Implement optimistic UI updates
6. Add confirmation dialog

**Deliverables:**
- Admin can mark bosses as killed
- Database updates correctly
- UI reflects changes immediately

**Testing:**
- Test timer recalculation
- Verify attendance record creation
- Check points awarded

---

### Phase 5: Leaderboards
**Tasks:**
1. Create Leaderboard component
2. Fetch attendance leaderboard data
3. Fetch points leaderboard data
4. Add sorting/filtering
5. Add pagination
6. Link to member profiles

**Deliverables:**
- Attendance leaderboard page
- Points leaderboard page
- Interactive tables

**Testing:**
- Verify ranking accuracy
- Test sorting/filtering
- Check pagination

---

### Phase 6: Auction History
**Tasks:**
1. Create AuctionHistory component
2. Fetch auction sessions
3. Display pending queue
4. Add expandable item details
5. Add search/filter

**Deliverables:**
- Auction history page
- Current auction status
- Pending items queue

**Testing:**
- Verify session data
- Check item details

---

### Phase 7: Member Profile
**Tasks:**
1. Create MemberProfile component
2. Fetch member data
3. Display attendance stats
4. Create boss breakdown chart
5. Show recent kills
6. Display auction wins
7. Add attendance heatmap

**Deliverables:**
- Member profile page
- Interactive charts
- Attendance history

**Testing:**
- Verify data accuracy
- Test chart rendering
- Check mobile layout

---

### Phase 8: Polish & Optimization
**Tasks:**
1. Add loading states
2. Error handling
3. Toast notifications
4. Animations (Framer Motion)
5. Performance optimization
6. SEO metadata
7. Dark mode support

**Deliverables:**
- Polished UI
- Smooth animations
- Fast load times

**Testing:**
- Lighthouse audit
- Cross-browser testing
- Mobile testing

---

### Phase 9: Deployment to Vercel
**Tasks:**
1. Create Vercel project
2. Configure environment variables
3. Set up MongoDB Atlas IP whitelist (0.0.0.0/0 for Vercel)
4. Deploy to production
5. Configure custom domain (optional)
6. Set up Discord OAuth redirect URLs

**Deliverables:**
- Live dashboard on Vercel
- Production environment configured

**Testing:**
- End-to-end testing on production
- Performance monitoring

---

## 🔒 Security Considerations

1. **MongoDB Access:**
   - Read-only credentials for dashboard (prevent accidental writes)
   - IP whitelist for Vercel (0.0.0.0/0)
   - Connection string in environment variables

2. **Discord OAuth:**
   - Verify guild membership on every request
   - Admin role check for destructive operations
   - CSRF protection with NextAuth

3. **API Routes:**
   - Rate limiting (Vercel Edge Config)
   - Input validation
   - Authentication middleware

4. **Data Exposure:**
   - Don't expose Discord IDs publicly
   - Sanitize user input
   - Use server components for sensitive data

---

## 📈 Performance Optimization

1. **MongoDB Queries:**
   - Use projections to fetch only needed fields
   - Create indexes on frequently queried fields
   - Implement caching with SWR/React Query

2. **Next.js:**
   - Use Server Components for data fetching
   - Implement ISR for static pages
   - Code splitting with dynamic imports

3. **Real-time Updates:**
   - Client-side countdown timers (no polling)
   - SWR for stale-while-revalidate pattern
   - WebSocket consideration for future

4. **Images:**
   - Next.js Image optimization
   - Boss images served from CDN

---

## 🧪 Testing Strategy

1. **Unit Tests:**
   - Countdown timer logic
   - Spawn time calculations
   - Data transformations

2. **Integration Tests:**
   - API route responses
   - MongoDB queries
   - Auth flow

3. **E2E Tests:**
   - Boss timer page
   - Login flow
   - Mark as killed feature

---

## 📱 Mobile Responsiveness

- Tailwind breakpoints: sm, md, lg, xl
- Grid layout: 1 col (mobile) → 2 col (tablet) → 3-4 col (desktop)
- Touch-friendly buttons
- Collapsible navigation

---

## 🎯 Success Metrics

1. **Performance:**
   - Initial load: <2s
   - API response: <500ms
   - Lighthouse score: >90

2. **User Experience:**
   - Countdown accuracy: ±1s
   - Mobile responsive: all breakpoints
   - Accessible: WCAG AA compliant

3. **Reliability:**
   - Uptime: >99%
   - Error rate: <1%
   - Data accuracy: 100%

---

## 🔮 Future Enhancements

**Phase 10+:**
- WebSocket for real-time updates
- Push notifications (PWA)
- Boss spawn alerts
- Analytics dashboard
- Export data to CSV
- Admin panel for managing bosses
- Activity heatmap (calendar view)
- Guild alliance rotation view
- Mobile app (React Native)

---

## 📚 References

- Bot Repository: https://github.com/brunongmacho/elysium-attendance-bot
- MongoDB Schema: `/docs/MONGODB_SCHEMA.md`
- Boss Config: `/boss_spawn_config.json`
- Boss Points: `/boss_points.json`
- MongoDB Helpers: `/utils/mongodb-helpers.js`

---

## ✅ Pre-Implementation Checklist

- [ ] MongoDB connection string obtained
- [ ] Discord OAuth2 app created
- [ ] Vercel account ready
- [ ] Boss config files reviewed
- [ ] Database schema understood
- [ ] UI mockups approved
- [ ] Technical stack confirmed
- [ ] Timeline agreed upon

---

**Estimated Timeline:** 3-4 weeks (40-60 hours)
**Tech Complexity:** Medium-High
**Deployment Complexity:** Low (Vercel makes it easy)

This plan provides a complete roadmap from exploration to deployment. We'll build this incrementally, testing each phase before moving forward.

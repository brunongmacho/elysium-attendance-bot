# /nextspawn Live Countdown Example

## What You'll See in Discord

When you type `/nextspawn` or `!nextspawn`, Discord's **native relative timestamps** automatically update the countdown in real-time:

### Initial Display (t=0s)
```
┌─────────────────────────────────────────────────────────┐
│ 🕒 Boss Spawns in Next 24 Hours                        │
│ ─────────────────────────────────────────────────────── │
│                                                          │
│ **Upcoming Spawns**                                     │
│                                                          │
│ **BENJI (SCHEDULED)**                                   │
│ 9:00 PM - in 5 hrs 32 mins                              │
│                                                          │
│ **VENATUS**                                             │
│ 11:45 PM - in 8 hrs 17 mins                             │
│                                                          │
│ **Tomorrow, AKMA (SCHEDULED)**                          │
│ Tomorrow, 1:00 AM - in 10 hrs 32 mins                   │
│                                                          │
│ **VIORENT**                                             │
│ Tomorrow, 3:30 AM - in 13 hrs 2 mins                    │
│                                                          │
│ ─────────────────────────────────────────────────────── │
│ Total: 4 bosses • Auto-deletes in 300s                  │
│ Dec 22, 2025 3:28 PM                                     │
└─────────────────────────────────────────────────────────┘
```

### After 10 Seconds (t=10s)
```
┌─────────────────────────────────────────────────────────┐
│ 🕒 Boss Spawns in Next 24 Hours                        │
│ ─────────────────────────────────────────────────────── │
│                                                          │
│ **Upcoming Spawns**                                     │
│                                                          │
│ **BENJI (SCHEDULED)**                                   │
│ 9:00 PM - in 5 hrs 31 mins            ← UPDATED!       │
│                                                          │
│ **VENATUS**                                             │
│ 11:45 PM - in 8 hrs 16 mins           ← UPDATED!       │
│                                                          │
│ **Tomorrow, AKMA (SCHEDULED)**                          │
│ Tomorrow, 1:00 AM - in 10 hrs 31 mins ← UPDATED!       │
│                                                          │
│ **VIORENT**                                             │
│ Tomorrow, 3:30 AM - in 13 hrs 1 min   ← UPDATED!       │
│                                                          │
│ ─────────────────────────────────────────────────────── │
│ Total: 4 bosses • Auto-deletes in 290s ← UPDATED!      │
│ Dec 22, 2025 3:28 PM                                     │
└─────────────────────────────────────────────────────────┘
```

### After 60 Seconds (t=60s)
```
┌─────────────────────────────────────────────────────────┐
│ 🕒 Boss Spawns in Next 24 Hours                        │
│ ─────────────────────────────────────────────────────── │
│                                                          │
│ **Upcoming Spawns**                                     │
│                                                          │
│ **BENJI (SCHEDULED)**                                   │
│ 9:00 PM - in 5 hrs 31 mins            ← LIVE!          │
│                                                          │
│ **VENATUS**                                             │
│ 11:45 PM - in 8 hrs 16 mins           ← LIVE!          │
│                                                          │
│ **Tomorrow, AKMA (SCHEDULED)**                          │
│ Tomorrow, 1:00 AM - in 10 hrs 31 mins ← LIVE!          │
│                                                          │
│ **VIORENT**                                             │
│ Tomorrow, 3:30 AM - in 13 hrs 0 mins  ← LIVE!          │
│                                                          │
│ ─────────────────────────────────────────────────────── │
│ Total: 4 bosses • Auto-deletes in 240s ← COUNTDOWN!    │
│ Dec 22, 2025 3:28 PM                                     │
└─────────────────────────────────────────────────────────┘
```

### After 5 Minutes (t=300s)
**💥 Message auto-deletes!** (Both user command and bot response)

## Key Features

✅ **Live Countdown** - Updates every 10 seconds
✅ **Both Commands Work** - `/nextspawn` and `!nextspawn`
✅ **Auto-Delete** - Removes clutter after 5 minutes
✅ **Real-Time** - Countdowns tick down live as you watch
✅ **Footer Timer** - Shows time until auto-delete

## Update Frequency

- **Boss spawn countdowns**: Update every 10 seconds
  - "in 5 hrs 32 mins" → "in 5 hrs 31 mins" → "in 5 hrs 31 mins" (rounds to nearest minute)

- **Auto-delete countdown**: Updates every 10 seconds
  - "300s" → "290s" → "280s" → ... → "0s" → **DELETE**

## Comparison to Old Behavior

### OLD (Static)
```
/nextspawn
→ Shows spawn times
→ Countdown is frozen (e.g., "in 5 hrs 32 mins")
→ Never updates
→ Message stays forever
```

### NEW (Dynamic)
```
/nextspawn
→ Shows spawn times
→ Countdown UPDATES every 10 seconds ← LIVE!
→ Footer shows auto-delete countdown
→ Message auto-deletes after 5 minutes
```

Just like the `/stats` command, but for boss spawn predictions!

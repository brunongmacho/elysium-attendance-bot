# ELYSIUM Guild Bot - Slash Commands Implementation Plan

**Version:** 1.0
**Date:** 2025-12-10
**Status:** Planning Phase

---

## Table of Contents

- [Overview](#overview)
- [Strategy](#strategy)
- [Implementation Phases](#implementation-phases)
- [Command Specifications](#command-specifications)
- [Technical Architecture](#technical-architecture)
- [Autocomplete Implementation](#autocomplete-implementation)
- [Migration Strategy](#migration-strategy)
- [Testing Plan](#testing-plan)
- [Rollback Plan](#rollback-plan)

---

## Overview

### Goals

Implement Discord slash commands alongside existing `!` prefix commands to provide:
- **Autocomplete** for boss names, items, and users
- **Better mobile UX** for admins managing the guild on-the-go
- **Type validation** to prevent invalid inputs
- **Modern Discord interface** while maintaining backward compatibility

### Key Principles

1. **Dual Support** - All `!` commands continue working during and after transition
2. **No Breaking Changes** - Existing workflows remain functional
3. **Gradual Adoption** - Users choose when to switch
4. **Autocomplete First** - Leverage autocomplete where it provides most value
5. **Shared Handlers** - Single business logic for both command types

### Scope

- **~50 slash commands** across 6 major systems
- **Full autocomplete** for boss names (22 bosses), items, and users
- **Subcommand grouping** for related operations
- **Permission parity** with existing `!` commands

---

## Strategy

### Why Dual Support?

**Primary Users:**
- Veterans/admins comfortable with `!` commands
- Mobile users who prefer slash commands
- New members discovering commands through autocomplete

**Primary Use Cases:**
- High-frequency admin commands (boss kills, attendance verification, auction management)
- Member stat checks and leaderboards
- Emergency operations

### Transition Approach

**Phase-based rollout:**
1. Implement highest-priority systems first
2. Gather admin feedback
3. Iterate on UX
4. Expand to remaining systems
5. Monitor adoption metrics
6. Maintain `!` commands indefinitely (no forced migration)

---

## Implementation Phases

### **Phase 1: Critical Admin Systems** (HIGHEST PRIORITY)

**Systems:**
- Attendance System
- Boss Timer System
- Boss Rotation System

**Why first:**
- Most-used admin commands daily
- Mobile management critical during boss fights
- Autocomplete has highest impact (22 boss names, multi-word names like "Lady Dalia")
- Proves value to veteran admins immediately

**Estimated effort:** 4-5 days

---

### **Phase 2: Auction System**

**Commands:**
- Bidding commands
- Auction management
- Queue management

**Why second:**
- High-frequency system
- Autocomplete for items/queue valuable
- Clean subcommand structure
- Members + admins both use

**Estimated effort:** 2-3 days

---

### **Phase 3: Stats & Leaderboards**

**Commands:**
- Stats queries
- Leaderboards
- Reports
- Activity heatmaps

**Why third:**
- Member-facing commands
- Simple queries (good for testing user adoption)
- Autocomplete for user selection

**Estimated effort:** 2 days

---

### **Phase 4: Emergency/Admin Tools**

**Commands:**
- Emergency bulk operations
- Point manipulation
- System resets
- Bootstrap/learning commands

**Why last:**
- Less frequent usage
- Admins already know these
- Can evaluate if migration needed based on Phase 1-3 feedback

**Estimated effort:** 1-2 days

---

## Command Specifications

### Phase 1A: Attendance System

#### `/verify <member>`
- **Description:** Verify a member's attendance submission
- **Options:**
  - `member` (STRING, required, autocomplete) - Member to verify
- **Autocomplete:** List of members with pending attendance
- **Permissions:** Admin only
- **Channel:** Admin Logs or attendance threads
- **Equivalent:** `!verify <member>`

#### `/deny <member> [reason]`
- **Description:** Deny a member's attendance submission
- **Options:**
  - `member` (STRING, required, autocomplete) - Member to deny
  - `reason` (STRING, optional) - Reason for denial
- **Autocomplete:** List of members with pending attendance
- **Permissions:** Admin only
- **Channel:** Admin Logs or attendance threads
- **Equivalent:** `!deny <member> [reason]`

#### `/verifyall`
- **Description:** Verify all pending attendance submissions
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!verifyall`

#### `/denyall`
- **Description:** Deny all pending attendance submissions
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!denyall`

#### `/close [thread]`
- **Description:** Close an attendance thread
- **Options:**
  - `thread` (CHANNEL, optional, autocomplete) - Thread to close (defaults to current)
- **Autocomplete:** List of open attendance threads
- **Permissions:** Admin only
- **Channel:** Admin Logs or attendance threads
- **Equivalent:** `!close [thread]`

#### `/closeall`
- **Description:** Close all open attendance threads
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!closeall`

#### `/resetpending`
- **Description:** Clear the pending attendance queue
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!resetpending`

---

### Phase 1B: Boss Timer System

#### `/killed <boss> [timestamp]`
- **Description:** Mark a boss as killed
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name
  - `timestamp` (STRING, optional) - Time killed (HH:MM format or "now")
- **Autocomplete:** All 22 boss names with fuzzy matching
- **Permissions:** Anyone
- **Channel:** Boss Timer channel
- **Equivalent:** `!killed <boss> [timestamp]`
- **Notes:** Supports multi-word boss names like "Lady Dalia", "General Aquleus"

#### `/spawned <boss>`
- **Description:** Mark a boss as spawned
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name
- **Autocomplete:** All 22 boss names with fuzzy matching
- **Permissions:** Anyone
- **Channel:** Boss Timer channel
- **Equivalent:** `!spawned <boss>`

#### `/nextspawn`
- **Description:** Check the next boss spawn time
- **Options:** None
- **Permissions:** Anyone
- **Channel:** Boss Timer channel
- **Equivalent:** `!nextspawn`

#### `/unkill <boss>`
- **Description:** Undo a boss kill record
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name
- **Autocomplete:** Recently killed bosses
- **Permissions:** Admin only
- **Channel:** Boss Timer channel
- **Equivalent:** `!unkill <boss>`

#### `/setboss <boss> <status>`
- **Description:** Set a boss status manually
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name
  - `status` (STRING, required, autocomplete) - Status (alive, killed, spawned, etc.)
- **Autocomplete:**
  - boss: All 22 boss names
  - status: Predefined status options
- **Permissions:** Admin only
- **Channel:** Boss Timer channel
- **Equivalent:** `!setboss <boss> <status>`

#### `/nospawn <boss>`
- **Description:** Mark a boss as not spawning
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name
- **Autocomplete:** All 22 boss names
- **Permissions:** Anyone
- **Channel:** Boss Timer channel
- **Equivalent:** `!nospawn <boss>`

#### `/maintenance`
- **Description:** Spawn all 22 bosses (after server maintenance)
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Boss Timer channel
- **Equivalent:** `!maintenance`
- **Notes:** Resets all boss timers for server maintenance window

#### `/serverdown`
- **Description:** Handle server downtime
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Boss Timer channel
- **Equivalent:** `!serverdown`

#### `/clearkills`
- **Description:** Clear all boss kill records
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Boss Timer channel
- **Equivalent:** `!clearkills`

---

### Phase 1C: Boss Rotation System

#### `/rotation status`
- **Description:** View current rotation for all bosses
- **Options:** None
- **Permissions:** Anyone
- **Channel:** Any
- **Equivalent:** `!rotation status`

#### `/rotation set <boss> <position>`
- **Description:** Set rotation index for a boss
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name (Amentis, General Aquleus, Baron Braudmore)
  - `position` (INTEGER, required) - Guild position (1-5)
- **Autocomplete:** 3 rotation bosses
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!rotation set <boss> <position>`
- **Validation:** Position must be 1-5

#### `/rotation increment <boss>`
- **Description:** Advance rotation to next guild
- **Options:**
  - `boss` (STRING, required, autocomplete) - Boss name (Amentis, General Aquleus, Baron Braudmore)
- **Autocomplete:** 3 rotation bosses
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!rotation increment <boss>`

#### `/rotation refresh`
- **Description:** Reload rotation data from Google Sheets
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!rotation refresh`

---

### Phase 2: Auction System

#### `/bid <amount>`
- **Description:** Place a bid on the current auction item
- **Options:**
  - `amount` (INTEGER, required) - Bid amount in points
- **Permissions:** ELYSIUM members only
- **Channel:** Auction threads
- **Equivalent:** `!bid <amount>`
- **Validation:** Integer type prevents "five hundred" typos

#### `/auction start`
- **Description:** Start an auction session manually
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!auction`

#### `/auction pause`
- **Description:** Pause the current auction
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!pauseauction`

#### `/auction resume`
- **Description:** Resume a paused auction
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!resumeauction`

#### `/auction extend <minutes>`
- **Description:** Add time to current auction item
- **Options:**
  - `minutes` (INTEGER, required) - Minutes to add
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!extend <minutes>`

#### `/auction skip`
- **Description:** Skip current item with point refund
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!skip`

#### `/auction cancel`
- **Description:** Cancel current item with point refund
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!cancel`

#### `/auction forceend`
- **Description:** Emergency auction termination
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!forceend`

#### `/queue add <item> [min_bid]`
- **Description:** Add item to auction queue
- **Options:**
  - `item` (STRING, required) - Item name
  - `min_bid` (INTEGER, optional) - Minimum starting bid
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!additem <item> [min_bid]`

#### `/queue remove <item>`
- **Description:** Remove item from auction queue
- **Options:**
  - `item` (STRING, required, autocomplete) - Item name
- **Autocomplete:** Items currently in queue
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!removeitem <item>`

#### `/queue list`
- **Description:** Show current auction queue
- **Options:** None
- **Permissions:** Anyone
- **Channel:** Bidding channel
- **Equivalent:** `!queue`

#### `/queue clear`
- **Description:** Clear entire auction queue
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!clearqueue`

#### `/bidstatus`
- **Description:** Show current auction status
- **Options:** None
- **Permissions:** Anyone
- **Channel:** Bidding channel
- **Equivalent:** `!bidstatus`

---

### Phase 3: Stats & Leaderboards

#### `/stats [user]`
- **Description:** View attendance and bidding statistics
- **Options:**
  - `user` (USER, optional, autocomplete) - User to check (defaults to self)
- **Autocomplete:** Guild members
- **Permissions:** Anyone
- **Channel:** Any
- **Equivalent:** `!stats [user]`, `!profile [user]`, `!mystats`
- **Response:** Shows attendance points + bidding points + statistics

#### `/leaderboard [type]`
- **Description:** View leaderboard rankings
- **Options:**
  - `type` (STRING, optional, autocomplete) - Type (attendance, bidding, both)
- **Autocomplete:** ["attendance", "bidding", "both"]
- **Permissions:** Anyone
- **Channel:** Any
- **Equivalent:** `!leaderboard`, `!leaderboardattendance`, `!leaderboardbidding`

#### `/activity [week]`
- **Description:** Guild activity heatmap
- **Options:**
  - `week` (INTEGER, optional) - Week offset (0=current, 1=last week, etc.)
- **Permissions:** Anyone
- **Channel:** Any
- **Equivalent:** `!activity [week]`

#### `/weeklyreport`
- **Description:** Force weekly report generation
- **Options:** None
- **Permissions:** Anyone
- **Channel:** Any
- **Equivalent:** `!weeklyreport`

#### `/monthlyreport`
- **Description:** Force monthly report generation
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!monthlyreport`

---

### Phase 4: Emergency/Admin Tools

#### `/emergency closeall`
- **Description:** Close all attendance threads
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!emergency closeall`

#### `/emergency verifyall`
- **Description:** Verify all pending attendance
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!emergency verifyall`

#### `/emergency denyall`
- **Description:** Deny all pending attendance
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!emergency denyall`

#### `/emergency resetpending`
- **Description:** Clear pending attendance queue
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Admin Logs
- **Equivalent:** `!emergency resetpending`

#### `/points add <member> <amount>`
- **Description:** Add points to a member
- **Options:**
  - `member` (USER, required, autocomplete) - Member
  - `amount` (INTEGER, required) - Points to add
- **Autocomplete:** Guild members
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!addpoints <member> <amount>`

#### `/points remove <member> <amount>`
- **Description:** Remove points from a member
- **Options:**
  - `member` (USER, required, autocomplete) - Member
  - `amount` (INTEGER, required) - Points to remove
- **Autocomplete:** Guild members
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!removepoints <member> <amount>`

#### `/points set <member> <amount>`
- **Description:** Set member points to exact value
- **Options:**
  - `member` (USER, required, autocomplete) - Member
  - `amount` (INTEGER, required) - New point total
- **Autocomplete:** Guild members
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!setpoints <member> <amount>`

#### `/resetauction`
- **Description:** Reset auction system
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Bidding channel
- **Equivalent:** `!resetauction`
- **Confirmation:** Requires confirmation (dangerous operation)

#### `/bootstraplearning`
- **Description:** Re-analyze historical auction data
- **Options:** None
- **Permissions:** Admin only
- **Channel:** Any
- **Equivalent:** `!bootstraplearning`

---

## Technical Architecture

### Shared Handler Pattern

**Goal:** Single source of truth for business logic, used by both slash and prefix commands.

**Implementation:**

```javascript
// handlers/attendance.js
async function handleVerify(context, member) {
  // context = { user, channel, isAdmin, reply: (msg) => {} }
  // Business logic here
  // Works for both slash and prefix commands
}

module.exports = { handleVerify };
```

```javascript
// index2.js - Slash command handler
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'verify') {
    await handleVerify({
      user: interaction.user,
      channel: interaction.channel,
      isAdmin: checkAdmin(interaction.member),
      reply: (msg) => interaction.reply(msg)
    }, interaction.options.getString('member'));
  }
});

// index2.js - Prefix command handler (existing)
if (content.startsWith('!verify')) {
  const member = args[0];
  await handleVerify({
    user: message.author,
    channel: message.channel,
    isAdmin: isAdmin(member),
    reply: (msg) => message.reply(msg)
  }, member);
}
```

**Benefits:**
- DRY (Don't Repeat Yourself)
- Single code path to test
- Easy to maintain
- Can deprecate prefix later without rewriting logic

---

### File Structure

**Proposed structure:**

```
/commands
  /slash
    attendance.js       # Slash command definitions
    bosstimer.js
    rotation.js
    auction.js
    stats.js
    emergency.js
  /handlers
    attendance.js       # Shared business logic
    bosstimer.js
    rotation.js
    auction.js
    stats.js
    emergency.js
  register.js           # Command registration utility
```

**Alternative (simpler):**
- Keep handlers in existing modules (`attendance.js`, `bidding.js`, etc.)
- Add `/commands` directory only for slash command definitions
- Register commands in `index2.js` or separate `register-commands.js`

---

### Command Registration

**Guild vs Global:**
- **Guild commands** - Instant updates, testing phase
- **Global commands** - 1-hour cache, production phase

**Registration timing:**
- On bot startup (`client.on('ready')`)
- Separate script for manual registration
- Environment-based (dev = guild, prod = global)

**Example:**

```javascript
// commands/register.js
const { REST, Routes } = require('discord.js');

async function registerCommands(client, commands, guildId = null) {
  const rest = new REST({ version: '10' }).setToken(client.token);

  try {
    if (guildId) {
      // Guild-specific (instant updates)
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
      console.log(`✅ Registered ${commands.length} guild commands`);
    } else {
      // Global (1-hour cache)
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      console.log(`✅ Registered ${commands.length} global commands`);
    }
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
}

module.exports = { registerCommands };
```

---

### Context Abstraction

**Unified interface for both command types:**

```javascript
class CommandContext {
  constructor(source, type = 'prefix') {
    this.type = type; // 'prefix' or 'slash'
    this.source = source; // Message or Interaction
    this.user = source.author || source.user;
    this.channel = source.channel;
    this.guild = source.guild;
  }

  async reply(content) {
    if (this.type === 'slash') {
      return await this.source.reply(content);
    } else {
      return await this.source.reply(content);
    }
  }

  async replyEphemeral(content) {
    if (this.type === 'slash') {
      return await this.source.reply({ ...content, ephemeral: true });
    } else {
      // Prefix can't be ephemeral, just reply normally
      return await this.source.reply(content);
    }
  }

  async deferReply() {
    if (this.type === 'slash') {
      return await this.source.deferReply();
    }
    // Prefix doesn't need defer
  }

  async editReply(content) {
    if (this.type === 'slash') {
      return await this.source.editReply(content);
    } else {
      // For prefix, we'd need to track the reply message
      // Simplified for now
    }
  }
}
```

**Usage:**

```javascript
async function handleVerify(ctx, member) {
  if (!ctx.isAdmin) {
    return await ctx.reply('❌ Admin only command');
  }

  // Business logic...
  await ctx.reply(`✅ Verified ${member}`);
}

// Slash command
client.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'verify') {
    const ctx = new CommandContext(interaction, 'slash');
    ctx.isAdmin = checkAdmin(interaction.member);
    await handleVerify(ctx, interaction.options.getString('member'));
  }
});

// Prefix command
if (content.startsWith('!verify')) {
  const ctx = new CommandContext(message, 'prefix');
  ctx.isAdmin = isAdmin(member);
  await handleVerify(ctx, args[0]);
}
```

---

## Autocomplete Implementation

### Boss Name Autocomplete

**Boss list source:**
- From `boss_spawn_config.json` or similar
- 22 bosses total
- Multi-word names supported ("Lady Dalia", "General Aquleus")

**Implementation:**

```javascript
client.on('interactionCreate', async interaction => {
  if (!interaction.isAutocomplete()) return;

  if (interaction.commandName === 'killed' ||
      interaction.commandName === 'spawned' ||
      interaction.commandName === 'nospawn') {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    // Load boss list (cache this!)
    const allBosses = await getBossList(); // ['Lady Dalia', 'Amentis', ...]

    // Filter with fuzzy matching
    const filtered = allBosses
      .filter(boss => {
        const lowerBoss = boss.toLowerCase();
        // Direct substring match OR fuzzy match (Levenshtein)
        return lowerBoss.includes(focusedValue) ||
               levenshtein.get(lowerBoss, focusedValue) <= 3;
      })
      .sort((a, b) => {
        // Sort by relevance (exact matches first)
        const aIncludes = a.toLowerCase().includes(focusedValue);
        const bIncludes = b.toLowerCase().includes(focusedValue);
        if (aIncludes && !bIncludes) return -1;
        if (!aIncludes && bIncludes) return 1;

        // Then by Levenshtein distance
        const aDist = levenshtein.get(a.toLowerCase(), focusedValue);
        const bDist = levenshtein.get(b.toLowerCase(), focusedValue);
        return aDist - bDist;
      })
      .slice(0, 25); // Discord limit

    await interaction.respond(
      filtered.map(boss => ({
        name: boss,   // Display name
        value: boss   // Value sent to command
      }))
    );
  }
});
```

**Performance optimization:**
- Cache boss list (don't reload on every autocomplete)
- Precompute normalized names for faster matching
- Limit fuzzy matching to short inputs (< 3 chars = exact match only)

---

### Pending Member Autocomplete

**For `/verify` and `/deny`:**

```javascript
if (interaction.commandName === 'verify' || interaction.commandName === 'deny') {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  // Get pending attendance submissions
  const pendingMembers = await getPendingAttendance(); // Returns array of usernames

  const filtered = pendingMembers
    .filter(member => member.toLowerCase().includes(focusedValue))
    .slice(0, 25);

  await interaction.respond(
    filtered.map(member => ({
      name: member,
      value: member
    }))
  );
}
```

---

### Queue Item Autocomplete

**For `/queue remove`:**

```javascript
if (interaction.commandName === 'queue' &&
    interaction.options.getSubcommand() === 'remove') {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  // Get current auction queue
  const queueItems = await getAuctionQueue(); // Returns array of item names

  const filtered = queueItems
    .filter(item => item.toLowerCase().includes(focusedValue))
    .slice(0, 25);

  await interaction.respond(
    filtered.map(item => ({
      name: item,
      value: item
    }))
  );
}
```

---

### User Autocomplete

**For `/stats`, `/points` commands:**

```javascript
if (interaction.commandName === 'stats' ||
    interaction.commandName === 'points') {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  // Get guild members (use cache!)
  const members = await interaction.guild.members.fetch();

  const filtered = members
    .filter(member =>
      !member.user.bot && // Exclude bots
      (member.user.username.toLowerCase().includes(focusedValue) ||
       member.displayName.toLowerCase().includes(focusedValue))
    )
    .map(member => ({
      name: member.displayName,
      value: member.id // Use ID as value for USER type
    }))
    .slice(0, 25);

  await interaction.respond(filtered);
}
```

**Note:** For USER type options, Discord provides built-in autocomplete. Custom autocomplete only needed for STRING type.

---

### Status/Type Autocomplete

**For predefined choices:**

```javascript
// Define in command options
{
  name: 'type',
  type: ApplicationCommandOptionType.String,
  description: 'Leaderboard type',
  required: false,
  choices: [
    { name: 'Attendance', value: 'attendance' },
    { name: 'Bidding', value: 'bidding' },
    { name: 'Both', value: 'both' }
  ]
}
```

**No autocomplete handler needed - Discord handles this automatically!**

---

## Migration Strategy

### Phase 1: Silent Launch

**Week 1:**
- Deploy slash commands to production
- No announcement yet
- Monitor for errors/bugs
- Admin testing only

**Success criteria:**
- No critical bugs
- Autocomplete works for all boss names
- Permission checks work correctly
- Channel restrictions enforced

---

### Phase 2: Soft Announcement

**Week 2:**
- Announce in admin channel: "Slash commands available for testing"
- Post examples: `/killed`, `/verify`, `/rotation status`
- Gather feedback from admins
- No changes to `!` commands

**Success criteria:**
- At least 3 admins try slash commands
- Positive feedback on autocomplete
- No major UX issues

---

### Phase 3: Public Announcement

**Week 3:**
- Announce in guild chat: "New slash commands available!"
- Post helpful examples with screenshots
- Highlight autocomplete features
- Emphasize `!` commands still work

**Announcement example:**

```
🎉 **New Feature: Slash Commands!**

We now support modern Discord slash commands! Try:

✅ `/killed Lady Dalia` - Autocomplete boss names!
✅ `/verify <member>` - Autocomplete pending members!
✅ `/rotation status` - Check boss rotations!
✅ `/stats` - Check your points!

**All existing `!` commands still work** - use whichever you prefer!

💡 **Mobile users:** Slash commands are much easier on mobile!
```

---

### Phase 4: Gentle Nudges (Optional)

**Week 4+:**
- When user uses `!killed`, bot replies: "✅ Boss marked killed. 💡 Tip: Try `/killed` for boss name autocomplete!"
- Make nudges opt-out: Use `!disabletips` to disable
- Track adoption metrics
- Never force migration

---

### Phase 5: Long-term Maintenance

**Ongoing:**
- Maintain both slash and prefix indefinitely
- New features added to both command types
- Monitor which commands are used more
- Consider deprecating only if adoption is >90% for specific commands

---

## Testing Plan

### Unit Tests

**Test shared handlers:**
```javascript
// __tests__/handlers/attendance.test.js
const { handleVerify } = require('../../handlers/attendance');

describe('handleVerify', () => {
  it('should verify pending member', async () => {
    const ctx = mockContext({ isAdmin: true });
    await handleVerify(ctx, 'TestMember');
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('✅'));
  });

  it('should reject non-admin', async () => {
    const ctx = mockContext({ isAdmin: false });
    await handleVerify(ctx, 'TestMember');
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('❌'));
  });
});
```

---

### Integration Tests

**Test command flow:**
```javascript
// __tests__/commands/slash/attendance.test.js
const { executeCommand } = require('../../commands/slash/attendance');

describe('Slash /verify command', () => {
  it('should verify member via slash command', async () => {
    const interaction = mockSlashInteraction('verify', { member: 'TestMember' });
    await executeCommand(interaction);
    expect(interaction.reply).toHaveBeenCalled();
  });
});
```

---

### Manual Testing Checklist

**Phase 1 commands:**

**Attendance:**
- [ ] `/verify <member>` - autocomplete shows pending members
- [ ] `/deny <member>` - autocomplete shows pending members
- [ ] `/verifyall` - bulk verifies all
- [ ] `/denyall` - bulk denies all
- [ ] `/close` - closes current thread
- [ ] `/closeall` - closes all threads
- [ ] `/resetpending` - clears queue
- [ ] All commands respect admin permissions
- [ ] All commands work in correct channels

**Boss Timer:**
- [ ] `/killed Lady Dalia` - autocomplete shows "Lady Dalia"
- [ ] `/killed gen` - autocomplete shows "General Aquleus"
- [ ] `/killed amen` - autocomplete shows "Amentis"
- [ ] `/killed barron` - fuzzy match shows "Baron Braudmore"
- [ ] `/spawned <boss>` - works for all 22 bosses
- [ ] `/nextspawn` - shows correct next spawn
- [ ] `/unkill <boss>` - removes kill record
- [ ] `/maintenance` - spawns all 22 bosses
- [ ] `/serverdown` - handles downtime
- [ ] `/clearkills` - clears all kills (admin only)
- [ ] Channel restrictions enforced

**Boss Rotation:**
- [ ] `/rotation status` - shows all 3 boss rotations
- [ ] `/rotation set amentis 3` - sets position
- [ ] `/rotation increment aquleus` - advances rotation
- [ ] `/rotation refresh` - reloads from Sheets
- [ ] Position validation (1-5 only)
- [ ] Admin permissions enforced

**Cross-cutting:**
- [ ] All `!` commands still work
- [ ] Both slash and prefix produce identical results
- [ ] Mobile experience is smooth
- [ ] Autocomplete is fast (<500ms)
- [ ] Error messages are helpful
- [ ] Permissions are consistent

---

### Load Testing

**Boss timer autocomplete:**
- Simulate 10 concurrent autocomplete requests
- Measure response time
- Ensure no rate limiting issues

**Audit system:**
- Test with 50 pending members (autocomplete limit)
- Verify performance doesn't degrade

---

## Rollback Plan

### Scenario 1: Critical Bug in Slash Commands

**Symptoms:**
- Slash commands crash bot
- Data corruption
- Permission bypass

**Response:**
1. Disable slash command registration (comment out registration code)
2. Restart bot (slash commands disappear from Discord)
3. `!` commands continue working
4. Fix bug in dev environment
5. Re-deploy when fixed

**Impact:** Minimal (slash commands removed, prefix still works)

---

### Scenario 2: Autocomplete Performance Issues

**Symptoms:**
- Autocomplete takes >2 seconds
- Rate limiting from Discord
- Memory leaks

**Response:**
1. Disable autocomplete (set `autocomplete: false` in options)
2. Keep slash commands active (manual entry)
3. Optimize autocomplete in dev
4. Re-enable when fixed

**Impact:** Moderate (slash commands work but no autocomplete)

---

### Scenario 3: User Confusion

**Symptoms:**
- Users don't know which to use
- Support requests increase
- Negative feedback

**Response:**
1. Post clarification announcement
2. Update help system with clear guidance
3. Consider temporarily disabling nudges
4. Gather specific feedback
5. Iterate on UX

**Impact:** Low (no technical issues, just communication)

---

### Scenario 4: Complete Rollback

**Worst case - need to remove all slash commands:**

1. **Backup current code:**
   ```bash
   git branch slash-commands-backup
   git checkout main
   ```

2. **Remove slash command registration:**
   ```javascript
   // Comment out in index2.js
   // await registerCommands(client, commands, config.main_guild_id);
   ```

3. **Remove slash command handlers:**
   ```javascript
   // Comment out interactionCreate listeners
   // client.on('interactionCreate', async interaction => { ... });
   ```

4. **Restart bot** - slash commands disappear from Discord after restart

5. **Verify `!` commands work** - should be unaffected

6. **Announce rollback:**
   ```
   ⚠️ Slash commands temporarily disabled due to technical issues.
   All `!` commands continue working normally.
   We'll announce when slash commands return. Thanks for your patience!
   ```

**Recovery time:** <10 minutes
**Data loss:** None (shared handlers prevent this)

---

## Success Metrics

### Adoption Metrics

**Track for 4 weeks post-launch:**
- Slash command usage vs prefix command usage (by command)
- Unique users trying slash commands
- Commands most frequently used via slash
- Commands still primarily used via prefix

**Tools:**
- Log both command types with identifiers
- Weekly aggregation report
- Compare week-over-week growth

---

### Performance Metrics

**Monitor:**
- Autocomplete response time (target: <500ms)
- Command execution time (should match prefix)
- Error rates (slash vs prefix)
- Bot memory usage (ensure no leaks)

**Alerting:**
- Autocomplete >1s → investigate caching
- Error rate >5% → investigate bugs
- Memory increase >20% → investigate leaks

---

### User Satisfaction

**Gather feedback:**
- Admin feedback sessions (week 2, week 4)
- Anonymous survey (optional, week 4)
- Monitor guild chat for complaints/praise
- Track support questions

**Questions:**
- Do you prefer slash or prefix commands?
- Is autocomplete helpful?
- Any commands missing from slash?
- Any UX issues?

---

## Open Questions

1. **Command naming:** Keep exact names (`/bid`) or use longer (`/placebid`)?
2. **Subcommand grouping:** `/auction start` vs `/auctionstart`?
3. **Ephemeral responses:** Should `/stats` be private or public?
4. **Registration:** Guild commands (instant) or global (1-hour cache)?
5. **Help system:** Adapt existing `!help` or create new `/help`?
6. **Error handling:** Match existing error message style?
7. **Confirmation prompts:** Keep for dangerous operations (`/resetauction`)?
8. **Boss timer help:** `/help` in boss timer channel shows slash or prefix syntax?

---

## Next Steps

**Before implementation:**
1. ✅ Review this plan with stakeholders
2. ⬜ Answer open questions above
3. ⬜ Decide on guild vs global registration
4. ⬜ Confirm file structure approach
5. ⬜ Set up development environment for testing

**Implementation:**
1. ⬜ Create command definitions for Phase 1A (Attendance)
2. ⬜ Create command definitions for Phase 1B (Boss Timer)
3. ⬜ Create command definitions for Phase 1C (Rotation)
4. ⬜ Implement shared handlers (or adapt existing)
5. ⬜ Implement autocomplete for boss names
6. ⬜ Implement autocomplete for pending members
7. ⬜ Register commands
8. ⬜ Test in development
9. ⬜ Deploy to production (silent launch)
10. ⬜ Gather feedback and iterate

---

## Appendix

### Discord Slash Command Limits

- **Max commands per bot:** 100 global + 100 per guild
- **Max options per command:** 25
- **Max subcommands per group:** 25
- **Max subcommand groups per command:** 25
- **Autocomplete results:** 25 max
- **Command name:** 1-32 characters, lowercase
- **Option name:** 1-32 characters, lowercase
- **Description:** 1-100 characters

**Our usage:**
- Estimated 50 commands total (well within limits)
- Most commands have 1-3 options (within limits)
- Subcommands used for auction, rotation, points, emergency (within limits)

---

### Useful Resources

- [Discord.js Guide - Slash Commands](https://discordjs.guide/interactions/slash-commands.html)
- [Discord.js Guide - Autocomplete](https://discordjs.guide/interactions/autocomplete.html)
- [Discord API - Application Commands](https://discord.com/developers/docs/interactions/application-commands)
- [Discord API - Slash Command Permissions](https://discord.com/developers/docs/interactions/application-commands#permissions)

---

**Document Version:** 1.0
**Last Updated:** 2025-12-10
**Status:** Awaiting approval to proceed with implementation

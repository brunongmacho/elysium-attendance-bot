# Documentation Index

## 📚 MongoDB Migration Documentation

This folder contains comprehensive documentation for the MongoDB migration project.

---

## 📖 Documents

### 1. [MONGODB_MIGRATION.md](./MONGODB_MIGRATION.md)
**Main Migration Guide**

Complete overview of the MongoDB migration project including:
- Migration timeline and phases
- Benefits and performance improvements
- Data flow architecture
- Sync strategies
- Testing plan
- Rollback procedures

**Start here** if you're resuming the migration or need the big picture.

---

### 2. [MONGODB_SCHEMA.md](./MONGODB_SCHEMA.md)
**Database Schema Documentation**

Detailed schema for all 7 MongoDB collections:
- `attendance` - All attendance records
- `members` - Member points + stats
- `auctionItems` - Auction queue + history
- `auctionSessions` - Session audit trail
- `botState` - Crash recovery state
- `bossRotation` - Alliance rotation
- `eventReminders` - Event reminders

Includes:
- Document structures
- Indexes
- Example queries
- Storage estimates

**Use this** when implementing database queries or understanding data structure.

---

### 3. [MIGRATION_PROGRESS.md](./MIGRATION_PROGRESS.md)
**Progress Tracker**

Real-time tracking of migration progress:
- Phase-by-phase checklist
- Completed tasks ✅
- Pending tasks ⏳
- Next steps
- Session recovery instructions

**Check this** to see current status and continue from where you left off.

---

## 🚀 Quick Start

### If You're Resuming After Session Lag:

1. **Pull latest changes**:
   ```bash
   git pull origin claude/recover-previous-tasks-011EAz2ViYuonGvTBDJAyvZY
   ```

2. **Check progress**:
   - Open [MIGRATION_PROGRESS.md](./MIGRATION_PROGRESS.md)
   - Find current phase
   - Review checklist

3. **Read relevant docs**:
   - [MONGODB_MIGRATION.md](./MONGODB_MIGRATION.md) - Overall plan
   - [MONGODB_SCHEMA.md](./MONGODB_SCHEMA.md) - Database structure

4. **Continue implementation**:
   - Follow checklist in MIGRATION_PROGRESS.md
   - Update checklist as you complete tasks

---

## 📊 Current Status

**Phase**: Phase 2 In Progress (60% complete) 🔄
**Next**: Test MongoDB in production, then Phase 3 - Data Migration
**Overall Progress**: 25%
**Last Commit**: ea3a0dd - MongoDB database API added

See [MIGRATION_PROGRESS.md](./MIGRATION_PROGRESS.md) for details.

---

## 🔗 Related Documentation

- [Main Architecture](../ARCHITECTURE.md) - Overall bot architecture
- [Contributing Guide](../CONTRIBUTING.md) - Development guidelines

---

## 💡 Tips

- Always update MIGRATION_PROGRESS.md when completing tasks
- Commit documentation changes frequently
- Test after each phase before moving to next
- Keep Koyeb logs open during deployment

---

**Last Updated**: Nov 28, 2025

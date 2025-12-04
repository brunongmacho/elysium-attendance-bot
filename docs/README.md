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

### 4. [PHASE5_ROADMAP.md](./PHASE5_ROADMAP.md)
**Phase 5+ Implementation Plan**

Documents Phase 5+ features including:
- Phase 5.1: Background MongoDB → Sheets sync
- Phase 6: Weekly & monthly reports
- Phase 7: Parallel dual-write implementation
- Optional future enhancements

**Check this** for recent feature implementations and roadmap.

---

### 5. [PHASE7_PARALLEL_DUAL_WRITE.md](./PHASE7_PARALLEL_DUAL_WRITE.md)
**Parallel Dual-Write Implementation**

Complete documentation of Phase 7 parallel dual-write refactor:
- Changed bidding from queued sync to parallel writes
- Changed boss rotation from fire-and-forget to guaranteed writes
- All MongoDB writes now have parallel/guaranteed Sheets writes
- Code changes, patterns, and testing checklist

**Read this** to understand the dual-write implementation.

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

**Phase**: Phase 7 Complete (Parallel Dual-Write) ✅
**Next**: Production deployment and monitoring
**Overall Progress**: 100% (All phases complete)
**Last Commit**: Phase 7 parallel dual-write implementation complete
**Branch**: `claude/mongodb-phase-4-migration-01TxBYbFtty8okkgjRi5ikHW`

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

**Last Updated**: Dec 4, 2025

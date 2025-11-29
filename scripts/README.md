# Scripts Directory

This directory contains utility scripts for the Elysium Guild Bot.

---

## 📁 Available Scripts

### 1. migrate-to-mongodb.js

**Purpose**: Migrate data from Google Sheets to MongoDB

**Usage**:
```bash
# Test migration (dry-run)
node scripts/migrate-to-mongodb.js --dry-run

# Run specific phase
node scripts/migrate-to-mongodb.js --phase=1    # Members
node scripts/migrate-to-mongodb.js --phase=2    # Auction Items

# Run all phases
node scripts/migrate-to-mongodb.js

# Verbose mode (show sample data)
node scripts/migrate-to-mongodb.js --dry-run --verbose
```

**Requirements**:
- `MONGODB_URI` environment variable (set in Koyeb)
- `config.json` with `sheet_webhook_url`

**Documentation**: See `docs/MIGRATION_PHASE3_INSTRUCTIONS.md`

---

### 2. verify-migration.js

**Purpose**: Verify data integrity after migration

**Usage**:
```bash
# Verify all collections
node scripts/verify-migration.js

# Verify specific collection
node scripts/verify-migration.js --collection=members
node scripts/verify-migration.js --collection=auctionItems

# Show detailed sample data
node scripts/verify-migration.js --detailed
```

**Checks**:
- ✅ Document counts match expectations
- ✅ Required fields present
- ✅ Data types correct
- ✅ Indexes exist
- ✅ Comparison with Google Sheets

**Example Output**:
```
═══════════════════════════════════════════════════════════════
🔍 ELYSIUM GUILD BOT - MIGRATION VERIFICATION
═══════════════════════════════════════════════════════════════

📊 DATABASE OVERVIEW
─────────────────────────────────────────────────────────────
📝 Database: elysium-bot
📝 Collections: 6
📝 Data Size: 345.23 KB
📝 Total Documents: 550

📊 VERIFYING MEMBERS COLLECTION
─────────────────────────────────────────────────────────────
📝 Total members: 50
📝 Sheet members: 50
✅ Count matches Google Sheets!
✅ All required fields present
✅ All field types correct
```

---

### 3. fix-empty-catches.js

**Purpose**: Fix empty catch blocks in codebase (legacy script)

**Usage**:
```bash
node scripts/fix-empty-catches.js
```

---

### 4. fix-silent-errors.js

**Purpose**: Fix silent error handling in codebase (legacy script)

**Usage**:
```bash
node scripts/fix-silent-errors.js
```

---

## 🔐 Environment Variables

Required environment variables for migration scripts:

| Variable | Description | Set In |
|----------|-------------|--------|
| `MONGODB_URI` | MongoDB Atlas connection string | Koyeb |
| `sheet_webhook_url` | Google Sheets webhook URL | config.json |

---

## 📚 Documentation

- **Migration Guide**: `docs/MIGRATION_PHASE3_INSTRUCTIONS.md`
- **Schema Documentation**: `docs/MONGODB_SCHEMA.md`
- **Progress Tracker**: `docs/MIGRATION_PROGRESS.md`

---

## 🚀 Quick Start

### Running Migration in Production

1. **SSH into Koyeb** (if needed) or use Koyeb CLI:
   ```bash
   koyeb exec <service-id> --cmd "node scripts/migrate-to-mongodb.js --dry-run --phase=1"
   ```

2. **Or run locally** with environment variables:
   ```bash
   export MONGODB_URI="mongodb+srv://..."
   node scripts/migrate-to-mongodb.js --dry-run
   ```

3. **Verify data**:
   ```bash
   node scripts/verify-migration.js --detailed
   ```

---

## 🐛 Troubleshooting

### "MONGODB_URI not found"
- **Cause**: Environment variable not set
- **Solution**: Run in Koyeb or export locally

### "config.json not found"
- **Cause**: Script run from wrong directory
- **Solution**: Run from project root: `node scripts/migrate-to-mongodb.js`

### "Failed to fetch from sheets"
- **Cause**: Google Sheets API rate limit
- **Solution**: Wait 60 seconds and retry

---

## 📝 Notes

- All scripts are designed to run from project root directory
- Migration script includes automatic retry logic
- Verification script is read-only (safe to run anytime)
- Use `--dry-run` for testing before actual migration

---

**Last Updated**: Nov 29, 2025

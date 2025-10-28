# 🚀 Auto-Deploy Code.js to Google Apps Script using CLASP

## ✅ Current Status

Your setup is **ALREADY CONFIGURED** and ready to use! Here's what you have:

- ✅ GitHub Actions workflow (`.github/workflows/deploy.yml`)
- ✅ `.clasp.json` configuration
- ✅ `.claspignore` file
- ✅ Workflow triggers on push to main

**You just need to set up the GitHub secret (CLASPRC_JSON)** and it will work automatically!

---

## 🎯 How It Works

### Automatic Deploy Flow

```
You push to main
    ↓
Code.js or appsscript.json changed?
    ↓ YES
GitHub Actions triggers
    ↓
Installs clasp
    ↓
Authenticates with Google
    ↓
Pushes Code.js to Google Apps Script
    ↓
✅ Done! (2-3 minutes)
```

---

## 📋 One-Time Setup: Get CLASPRC_JSON Secret

### Step 1: Install CLASP Locally (If Not Already Installed)

```bash
# Install clasp globally
npm install -g @google/clasp

# Verify installation
clasp --version
```

**Expected:** `2.4.2` or higher

---

### Step 2: Login to Google Apps Script

```bash
# Login to your Google account
clasp login
```

**What happens:**
1. Browser opens
2. Select your Google account (the one with access to your Apps Script)
3. Click "Allow"
4. You'll see: "✅ Authorization successful. You can close this page."

---

### Step 3: Get Your .clasprc.json

```bash
# View your credentials
cat ~/.clasprc.json
```

**Output will look like:**
```json
{
  "token": {
    "access_token": "ya29.a0AfB_xxx...",
    "refresh_token": "1//0xxx...",
    "scope": "https://www.googleapis.com/auth/script.deployments ...",
    "token_type": "Bearer",
    "expiry_date": 1234567890123
  },
  "oauth2ClientSettings": {
    "clientId": "xxx.apps.googleusercontent.com",
    "clientSecret": "GOCSPX-xxx",
    "redirectUri": "http://localhost:8080"
  },
  "isLocalCreds": false
}
```

**IMPORTANT:** Copy the **ENTIRE** content (everything including the outer `{}`)

---

### Step 4: Add Secret to GitHub

1. **Go to your GitHub repository:**
   - https://github.com/brunongmacho/elysium-attendance-bot

2. **Navigate to Settings:**
   - Click "Settings" tab (top right)

3. **Go to Secrets:**
   - Left sidebar → "Secrets and variables" → "Actions"

4. **Create New Secret:**
   - Click "New repository secret"
   - **Name:** `CLASPRC_JSON`
   - **Value:** Paste the ENTIRE `.clasprc.json` content
   - Click "Add secret"

**Screenshot of what it should look like:**
```
Repository secrets
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name                   Updated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLASPRC_JSON          Just now       ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🔍 Verify Your Configuration

### Check 1: .clasp.json
```bash
cat .clasp.json
```

**Should show:**
```json
{
  "scriptId": "16YAifAwB6cT-K1mLfXpW9-hBvB9KIOotnERWp8i9t4EbU7BlEABh4tTB",
  "rootDir": "./",
  ...
}
```

✅ **Script ID is correct** - This is your Google Apps Script project ID

---

### Check 2: .claspignore
```bash
cat .claspignore
```

**Should show:**
```
**/*
!appsscript.json
!Code.js
```

✅ **This tells clasp to ONLY push Code.js and appsscript.json** (not your entire repo)

---

### Check 3: GitHub Workflow
```bash
cat .github/workflows/deploy.yml
```

**Key parts:**
```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'Code.js'
      - 'appsscript.json'
```

✅ **Only triggers when Code.js or appsscript.json changes**

---

## 🧪 Test the Auto-Deploy

### Option 1: Make a Small Change to Code.js

```bash
# Add a comment to Code.js
echo "//test v3" >> Code.js

# Commit and push
git add Code.js
git commit -m "Test clasp auto-deploy"
git push origin main
```

---

### Option 2: Use Our Merge (Recommended)

When you merge the feature branch to main (which includes Code.js changes), the workflow will trigger automatically!

```bash
# After you merge
git checkout main
git merge --ff-only claude/code-review-011CUYsqkkkrV6iYJpbvtaos
git push origin main

# GitHub Actions will automatically deploy Code.js!
```

---

## 📊 Monitor the Deployment

### Step 1: Check GitHub Actions

1. **Go to Actions tab:**
   - https://github.com/brunongmacho/elysium-attendance-bot/actions

2. **Look for workflow run:**
   - Name: "Deploy to Google Apps Script"
   - Status: 🟡 Running → ✅ Success (or ❌ Failed)

3. **Click on the workflow to see details**

---

### Step 2: Expected Output (Success)

```
Run npm install -g @google/clasp
✅ added 147 packages in 8s

Run clasp status
✅ Script ID: 16YAifAwB6cT-K1mLfXpW9-hBvB9KIOotnERWp8i9t4EbU7BlEABh4tTB

Run clasp push
✅ Pushed 2 files.
   - Code.js
   - appsscript.json
```

---

### Step 3: Verify in Google Apps Script

1. **Open Apps Script Editor:**
   - https://script.google.com
   - Find your ELYSIUM project

2. **Check Code.js:**
   - Should see your latest changes
   - Check for new functions: `getAttendanceState`, `saveAttendanceState`

3. **Check version/timestamp:**
   - File → Project History
   - Should see new version with timestamp matching GitHub push

---

## 🐛 Troubleshooting

### Issue 1: Workflow Doesn't Trigger

**Symptoms:**
- Push to main, but no workflow runs
- Actions tab shows nothing

**Causes:**
- Code.js or appsscript.json not changed
- Workflow file has syntax error

**Solutions:**
```bash
# Check if workflow file is valid
cat .github/workflows/deploy.yml

# Force trigger by changing Code.js
echo "//test" >> Code.js
git add Code.js
git commit -m "Trigger workflow"
git push origin main
```

---

### Issue 2: Authentication Failed

**Symptoms:**
```
Error: Could not read API credentials.
Are you logged in globally?
```

**Causes:**
- CLASPRC_JSON secret not set
- Secret has wrong format
- Expired credentials

**Solutions:**

**A. Verify secret exists:**
- GitHub → Settings → Secrets → Actions
- Should see `CLASPRC_JSON`

**B. Regenerate credentials:**
```bash
# Logout and login again
clasp logout
clasp login

# Get new credentials
cat ~/.clasprc.json

# Update GitHub secret with new content
```

**C. Check secret format:**
- Must be VALID JSON
- Must include ALL fields (token, oauth2ClientSettings, etc.)
- No extra characters

---

### Issue 3: Wrong Script ID

**Symptoms:**
```
Error: Script not found.
```

**Cause:**
- `.clasp.json` has wrong scriptId

**Solution:**
```bash
# Get correct script ID from Google Apps Script:
# 1. Open your script: https://script.google.com
# 2. Project Settings (gear icon)
# 3. Copy "Script ID"

# Update .clasp.json
{
  "scriptId": "YOUR_CORRECT_SCRIPT_ID_HERE",
  ...
}

# Commit and push
git add .clasp.json
git commit -m "Fix script ID"
git push origin main
```

---

### Issue 4: Permission Denied

**Symptoms:**
```
Error: User does not have permission to access script.
```

**Cause:**
- The Google account in CLASPRC_JSON doesn't own the script
- Script is owned by different account

**Solution:**
```bash
# Login with the CORRECT account (that owns the script)
clasp logout
clasp login  # Choose correct account

# Get new credentials
cat ~/.clasprc.json

# Update GitHub secret
```

---

### Issue 5: Files Not Pushing

**Symptoms:**
- Workflow succeeds
- But Code.js not updated in Apps Script

**Causes:**
- .claspignore blocking files
- Wrong rootDir in .clasp.json

**Solutions:**

**A. Check .claspignore:**
```bash
cat .claspignore

# Should be:
**/*
!appsscript.json
!Code.js
```

**B. Verify files are in root:**
```bash
ls -la | grep -E "Code.js|appsscript.json"

# Should show:
-rw-r--r--  1 user  staff   Code.js
-rw-r--r--  1 user  staff   appsscript.json
```

**C. Test locally:**
```bash
# Try pushing manually
clasp push

# Should see:
✅ Pushed 2 files.
```

---

## 🔐 Security Best Practices

### DO ✅
- ✅ Store CLASPRC_JSON as GitHub secret (never commit it)
- ✅ Use personal Google account or service account
- ✅ Limit workflow to main branch only
- ✅ Only push Code.js and appsscript.json (use .claspignore)
- ✅ Monitor GitHub Actions for suspicious activity

### DON'T ❌
- ❌ Commit .clasprc.json to repo
- ❌ Share CLASPRC_JSON secret publicly
- ❌ Use workflow on public forks without review
- ❌ Push entire repo to Apps Script
- ❌ Use someone else's Google account

---

## 🎯 Quick Reference

### Common Commands

```bash
# Install clasp
npm install -g @google/clasp

# Login to Google
clasp login

# View credentials
cat ~/.clasprc.json

# Test push manually
clasp push

# Check script info
clasp status

# Pull from Apps Script
clasp pull

# Logout
clasp logout
```

---

### Workflow Triggers

The workflow runs when:
- ✅ You push to `main` branch
- ✅ AND Code.js or appsscript.json changed

The workflow does NOT run when:
- ❌ You push to other branches
- ❌ Only JavaScript files changed (attendance.js, bidding.js, etc.)
- ❌ Only documentation changed

---

## 📈 Advanced Configuration

### Deploy to Multiple Scripts

If you have staging and production scripts:

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches:
      - main  # Production
      - staging  # Staging

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install clasp
        run: npm install -g @google/clasp

      - name: Configure clasp
        run: echo '${{ secrets.CLASPRC_JSON }}' > ~/.clasprc.json

      - name: Deploy to Production
        if: github.ref == 'refs/heads/main'
        run: |
          echo '{"scriptId": "PRODUCTION_SCRIPT_ID"}' > .clasp.json
          clasp push

      - name: Deploy to Staging
        if: github.ref == 'refs/heads/staging'
        run: |
          echo '{"scriptId": "STAGING_SCRIPT_ID"}' > .clasp.json
          clasp push
```

---

### Add Notifications

Get notified when deploy succeeds/fails:

```yaml
# Add after clasp push step
- name: Notify on Success
  if: success()
  run: echo "✅ Deploy succeeded!"
  # Add Discord webhook, Slack, etc.

- name: Notify on Failure
  if: failure()
  run: echo "❌ Deploy failed!"
  # Send alert
```

---

## ✅ Verification Checklist

Before merging to main, ensure:

- [ ] `.clasp.json` has correct scriptId
- [ ] `.claspignore` only allows Code.js and appsscript.json
- [ ] GitHub Actions workflow file exists (`.github/workflows/deploy.yml`)
- [ ] CLASPRC_JSON secret is set in GitHub
- [ ] You can login with `clasp login` locally
- [ ] Test push works: `clasp push`
- [ ] Workflow file syntax is valid
- [ ] You own the Google Apps Script project
- [ ] Script is not in a shared drive (must be in "My Drive")

---

## 🎉 Success!

Once setup is complete:

1. **Make changes to Code.js**
2. **Commit and push to main**
3. **GitHub Actions automatically deploys**
4. **Code.js updated in Google Apps Script**
5. **Your webhook gets new functions immediately**

**Total time:** 2-3 minutes from push to deployed! 🚀

---

## 📞 Need Help?

### Documentation
- **CLASP:** https://github.com/google/clasp
- **GitHub Actions:** https://docs.github.com/en/actions

### Common Issues
- Check GitHub Actions logs first
- Verify CLASPRC_JSON is valid JSON
- Make sure scriptId is correct
- Test `clasp push` locally first

### Create Issue
If you still have problems:
- https://github.com/brunongmacho/elysium-attendance-bot/issues
- Include GitHub Actions logs
- Include error messages
- What you tried to fix it

---

**Your setup is ready! Just add the CLASPRC_JSON secret and it will work automatically.** ✅

---

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Status:** ✅ Production Ready

# Deploying ELYSIUM Dashboard to Vercel

This guide will walk you through deploying your ELYSIUM Dashboard to Vercel.

## Prerequisites

- Git repository pushed to GitHub, GitLab, or Bitbucket
- Vercel account (free tier works fine)
- All environment variables from `.env.example` configured

## Step 1: Prepare Your Repository

Ensure all changes are committed and pushed:

```bash
git status
git add .
git commit -m "Prepare for Vercel deployment"
git push
```

## Step 2: Connect to Vercel

### Option A: Vercel CLI (Recommended)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. Follow the prompts:
   - Set up and deploy: **Y**
   - Which scope: Choose your account
   - Link to existing project: **N**
   - Project name: `elysium-dashboard` (or your preferred name)
   - Directory: `./` (press Enter)
   - Override settings: **N**

### Option B: Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Import your Git repository
4. Configure project:
   - Framework Preset: **Next.js** (auto-detected)
   - Root Directory: `./`
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)

## Step 3: Configure Environment Variables

In Vercel Dashboard (Project Settings → Environment Variables), add all variables from `.env.example`:

### Required Variables

```env
# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/elysium-bot
MONGODB_DB_NAME=elysium-bot

# Discord OAuth2
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_GUILD_ID=your_guild_id
DISCORD_ELYSIUM_ROLE_ID=your_elysium_role_id

# NextAuth
NEXTAUTH_SECRET=your_generated_secret
NEXTAUTH_URL=https://your-project.vercel.app

# Optional but recommended
DISCORD_ADMIN_ROLE_ID=your_admin_role_id
DISCORD_LEADER_ROLE_ID=your_leader_role_id
DISCORD_VICE_LEADER_ROLE_ID=your_vice_leader_role_id
DISCORD_CORE_ROLE_ID=your_core_role_id

# Public variables
NEXT_PUBLIC_TIMEZONE=Asia/Manila
NEXT_PUBLIC_DEBUG=false
```

### Important Notes:

1. **NEXTAUTH_URL**: Must be your production Vercel URL
   - Example: `https://elysium-dashboard.vercel.app`
   - **DO NOT** use `localhost` in production

2. **NEXTAUTH_SECRET**: Generate a new one for production:
   ```bash
   openssl rand -base64 32
   ```

3. **Discord OAuth2 Redirect URL**: Add production callback to Discord app:
   - Go to: https://discord.com/developers/applications
   - Select your application
   - OAuth2 → Redirects
   - Add: `https://your-project.vercel.app/api/auth/callback/discord`

## Step 4: Deploy

### Using Vercel CLI:
```bash
vercel --prod
```

### Using Vercel Dashboard:
- Push to your main branch
- Vercel will auto-deploy

## Step 5: Verify Deployment

1. Visit your deployed URL
2. Test authentication:
   - Click "Sign in with Discord"
   - Authorize the app
   - Verify you're redirected back
3. Test features:
   - Boss timers loading
   - Leaderboard data
   - Member profiles
   - Mark as Killed (if you have permissions)

## Troubleshooting

### MongoDB Connection Issues

If you see "Failed to load boss timers":
1. Check MongoDB Atlas IP whitelist:
   - Atlas Dashboard → Network Access
   - Add `0.0.0.0/0` to allow all IPs (Vercel uses dynamic IPs)
2. Verify `MONGODB_URI` is correct in Vercel env vars

### Discord OAuth Issues

If authentication fails:
1. Verify Discord OAuth redirect URLs include production URL
2. Check `NEXTAUTH_URL` matches your Vercel deployment URL
3. Ensure `NEXTAUTH_SECRET` is set in Vercel

### Build Failures

If build fails:
1. Check build logs in Vercel dashboard
2. Ensure all dependencies are in `package.json`
3. Run `npm run build` locally to test

## Environment-Specific Deployments

### Preview Deployments (PR/Branch)
- Automatically created for each push
- Use same env vars as production
- Great for testing before merge

### Production Deployment
- Triggered by pushes to main branch
- Uses production environment variables
- Custom domain can be added in Vercel settings

## Custom Domain (Optional)

1. Vercel Dashboard → Project → Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions
4. Update `NEXTAUTH_URL` to your custom domain
5. Add custom domain to Discord OAuth redirects

## Post-Deployment

1. **Update Discord Bot** (if applicable):
   - Point bot webhooks to production URLs
   - Update any hardcoded dashboard links

2. **Monitor Performance**:
   - Vercel Analytics (free tier included)
   - Check function logs for errors

3. **Set up Alerts** (optional):
   - Vercel → Project → Settings → Notifications
   - Get notified of deployment failures

## Continuous Deployment

Vercel automatically deploys when you push to your repository:

```bash
# Make changes
git add .
git commit -m "Update feature"
git push

# Vercel automatically deploys!
```

## Rollback

If something goes wrong:
1. Vercel Dashboard → Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"

## Performance Tips

1. **Enable Edge Caching** (already configured in `dynamic = "force-dynamic"`)
2. **Use SWR** for client-side data (already implemented)
3. **Monitor Function Execution Time** in Vercel dashboard
4. **Optimize Images** using Next.js Image component (already done)

## Support

- Vercel Docs: https://vercel.com/docs
- Next.js Deployment: https://nextjs.org/docs/deployment
- MongoDB Atlas: https://www.mongodb.com/docs/atlas

## Estimated Costs

**Free Tier Limits:**
- 100GB bandwidth/month
- 100 deployments/day
- Unlimited API requests
- 1,000 GB-hours serverless function execution

This should be sufficient for most guild dashboards!

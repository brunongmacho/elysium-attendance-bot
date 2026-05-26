# Discord OAuth2 Setup Guide

This guide will help you set up Discord OAuth2 authentication for your Elysium Dashboard.

## Prerequisites
- Discord account with admin access to your ELYSIUM server
- Discord Developer Mode enabled

## Step 1: Enable Discord Developer Mode

1. Open Discord
2. Click the **⚙️ Settings** icon (bottom left)
3. Go to **Advanced** (under App Settings)
4. Enable **Developer Mode**
5. Click **Done** or **ESC**

## Step 2: Create Discord OAuth2 Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Enter name: `Elysium Dashboard` (or any name you prefer)
4. Accept the Terms of Service
5. Click **Create**

## Step 3: Get Your Client ID and Secret

### Client ID:
1. In your application page, you'll see **APPLICATION ID**
2. Copy this ID
3. Save it for later - this is your `DISCORD_CLIENT_ID`

### Client Secret:
1. Go to the **OAuth2** tab (left sidebar)
2. Under **Client information**, click **Reset Secret**
3. Click **Yes, do it!**
4. Copy the secret that appears
5. **⚠️ IMPORTANT:** Save this immediately - you won't be able to see it again!
6. This is your `DISCORD_CLIENT_SECRET`

## Step 4: Configure OAuth2 Redirects

1. Still in the **OAuth2** tab
2. Scroll down to **Redirects**
3. Click **Add Redirect**
4. Add these URLs:
   - For local development: `http://localhost:3000/api/auth/callback/discord`
   - For production (Vercel): `https://your-domain.vercel.app/api/auth/callback/discord`
5. Click **Save Changes**

## Step 5: Get Your Discord Server (Guild) ID

1. Open Discord
2. Go to your ELYSIUM server
3. Right-click on the server icon (or server name)
4. Click **Copy Server ID** (if you don't see this, make sure Developer Mode is enabled)
5. Save this as your `DISCORD_GUILD_ID`

## Step 6: Get Role IDs

### ELYSIUM Role ID:
1. Open Discord
2. Go to your ELYSIUM server
3. Click **Server Settings** → **Roles**
4. Find the **ELYSIUM** role
5. Right-click the role name
6. Click **Copy Role ID**
7. Save this as your `DISCORD_ELYSIUM_ROLE_ID`

### Elysium Rank Role IDs (Optional):
1. In Server Settings → Roles
2. For each rank role, right-click and **Copy Role ID**:
   - **Elysium Leader** role → Save as `DISCORD_LEADER_ROLE_ID`
   - **Elysium Vice Leader** role → Save as `DISCORD_VICE_LEADER_ROLE_ID`
   - **Elysium Core** role → Save as `DISCORD_CORE_ROLE_ID`

### Admin Role IDs (Optional):
1. In Server Settings → Roles
2. Find your admin/moderator roles that should have full permissions
3. For each role:
   - Right-click the role name
   - Click **Copy Role ID**
4. Save the role IDs as comma-separated values for `DISCORD_ADMIN_ROLE_ID`
   - Example: If you have "Guild Leader" and "Elite" roles with admin permissions, copy both IDs

## Step 7: Generate NextAuth Secret

Run this command in your terminal:
```bash
openssl rand -base64 32
```

Copy the output - this is your `NEXTAUTH_SECRET`

## Step 8: Update .env.local

Open your `.env.local` file and add these variables:

```env
# Discord OAuth
DISCORD_CLIENT_ID=your-client-id-from-step-3
DISCORD_CLIENT_SECRET=your-client-secret-from-step-3
DISCORD_GUILD_ID=your-guild-id-from-step-5

# Discord Roles
DISCORD_ELYSIUM_ROLE_ID=your-elysium-role-id-from-step-6

# Elysium Rank Roles (Optional - for role badges)
DISCORD_LEADER_ROLE_ID=your-leader-role-id
DISCORD_VICE_LEADER_ROLE_ID=your-vice-leader-role-id
DISCORD_CORE_ROLE_ID=your-core-role-id

# Admin Roles (Optional - comma-separated for multiple admin roles)
DISCORD_ADMIN_ROLE_ID=guild-leader-role-id,elite-role-id

# NextAuth
NEXTAUTH_SECRET=your-generated-secret-from-step-7
NEXTAUTH_URL=http://localhost:3000
```

## Step 9: Test the Setup

1. Save your `.env.local` file
2. Restart your development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000`
4. Click **Sign in with Discord**
5. You should be redirected to Discord to authorize the application
6. After authorizing, you should be redirected back to the dashboard
7. You should see your Discord profile in the navbar

## Troubleshooting

### "Invalid OAuth2 redirect_uri"
- Make sure you added the correct redirect URL in Step 4
- Check that your `NEXTAUTH_URL` matches the redirect URL
- Restart your dev server after changing `.env.local`

### "You must be a member of the ELYSIUM guild"
- Make sure the `DISCORD_GUILD_ID` is correct
- Verify you're actually a member of the server

### "You don't have permission to mark bosses as killed"
- Make sure the `DISCORD_ELYSIUM_ROLE_ID` is correct
- Verify you have the ELYSIUM role in Discord
- Alternatively, set up `DISCORD_ADMIN_ROLE_ID` and make sure you have that role

### Button doesn't appear after signing in
- Check browser console for errors
- Make sure you have the ELYSIUM role or admin role
- Try signing out and signing back in

## Production Deployment (Vercel)

When deploying to Vercel:

1. Add all environment variables in Vercel dashboard:
   - Go to your project → Settings → Environment Variables
   - Add all the variables from your `.env.local`

2. Update `NEXTAUTH_URL` to your production URL:
   ```env
   NEXTAUTH_URL=https://your-app.vercel.app
   ```

3. Add production redirect URL in Discord Developer Portal:
   ```
   https://your-app.vercel.app/api/auth/callback/discord
   ```

4. Redeploy your application

## Security Notes

- **Never commit `.env.local` to git** - it contains secrets!
- Keep your `DISCORD_CLIENT_SECRET` private
- Regenerate secrets if they're ever exposed
- Only share role IDs, guild IDs, and client ID (not the secret!)

## Need Help?

If you encounter any issues, check:
1. Discord Developer Portal logs
2. Browser console for errors
3. Server logs for authentication errors
4. Verify all IDs are copied correctly (no extra spaces)

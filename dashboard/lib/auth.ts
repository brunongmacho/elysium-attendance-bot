/**
 * NextAuth Configuration
 * Handles Discord OAuth2 authentication with guild verification
 */

import { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import type { DiscordProfile, DiscordGuild, DiscordMember } from "@/types/api";
import { AUTH } from "@/lib/constants";
import path from "path";
import fs from "fs";

// Discord OAuth scopes needed for guild membership and roles
const DISCORD_SCOPES = ["identify", "guilds", "guilds.members.read"].join(" ");

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: DISCORD_SCOPES,
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account, profile, trigger }) {
      // Store Discord access token and user data for API calls
      if (account && profile) {
        const discordProfile = profile as DiscordProfile;
        token.accessToken = account.access_token;
        token.discordId = discordProfile.id;
        // Store display name (global_name) or fallback to username
        token.displayName = discordProfile.global_name || discordProfile.username || profile.name;
        // Reset cache on new login
        token.lastFetched = 0;
      }

      // Check if we need to refresh Discord data
      const now = Date.now();
      const lastFetched = token.lastFetched || 0;
      const shouldRefresh = (now - lastFetched) > AUTH.CACHE_AGE;

      if (shouldRefresh && token.accessToken) {
        try {
          // Fetch and cache Discord guild/member data
          // Read guild ID from bot's config.json (co-located in parent directory), fallback to env var
          let guildId = process.env.DISCORD_GUILD_ID || "";
          if (!guildId) {
            try {
              const configPath = path.resolve(process.cwd(), "../config.json");
              const botConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
              guildId = botConfig.main_guild_id;
              console.log(`[auth] Read guild ID from config.json: ${guildId}`);
            } catch (err) {
              console.warn("[auth] Could not read config.json, DISCORD_GUILD_ID env var not set");
              // Guild ID will be empty — API routes will handle gracefully
            }
          }

          const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds", {
            headers: { Authorization: `Bearer ${token.accessToken}` },
          });

          if (guildsResponse.ok) {
            const guilds = await guildsResponse.json() as DiscordGuild[];
            const isInGuild = guilds.some((g: DiscordGuild) => g.id === guildId);
            token.cachedIsInGuild = isInGuild;

            if (isInGuild) {
              const memberResponse = await fetch(
                `https://discord.com/api/users/@me/guilds/${guildId}/member`,
                { headers: { Authorization: `Bearer ${token.accessToken}` } }
              );

              if (memberResponse.ok) {
                const member = await memberResponse.json() as DiscordMember;
                token.cachedRoles = member.roles || [];
                token.cachedNickname = member.nick || token.displayName;

                // Calculate role badge
                const tenchuRoleId = process.env.DISCORD_TENCHU_ROLE_ID;
                const adminRoleIds = process.env.DISCORD_ADMIN_ROLE_ID;
                const leaderRoleId = process.env.DISCORD_LEADER_ROLE_ID;
                const viceLeaderRoleId = process.env.DISCORD_VICE_LEADER_ROLE_ID;
                const coreRoleId = process.env.DISCORD_CORE_ROLE_ID;

                const hasTenchuRole = tenchuRoleId && member.roles.includes(tenchuRoleId);
                const hasAdminRole = adminRoleIds
                  ? adminRoleIds.split(',').some((id: string) => member.roles.includes(id.trim()))
                  : false;

                // Check if can access boss timers (Tenchu, Core, Neto, Elite, Leader, XXX, or admin)
                const eliteRoleId = process.env.DISCORD_ELITE_ROLE_ID;
                const specialAdminRoleId = process.env.DISCORD_SPECIAL_ADMIN_ROLE_ID;
                const netoRoleId = process.env.DISCORD_NETO_ROLE_ID;
                
                const visitorRoleId = '1415320794141032448';
                const isVisitorOnly = member.roles.length === 1 && member.roles.includes(visitorRoleId);
                
                const hasCoreRole = coreRoleId && member.roles.includes(coreRoleId);
                const hasNetoRole = netoRoleId && member.roles.includes(netoRoleId);
                const hasEliteRole = eliteRoleId && member.roles.includes(eliteRoleId);
                const hasLeaderRole = leaderRoleId && member.roles.includes(leaderRoleId);
                const hasSpecialAdminRole = specialAdminRoleId && member.roles.includes(specialAdminRoleId);
                
                const canAccessBossTimers = !isVisitorOnly && (
                  hasTenchuRole || hasCoreRole || hasNetoRole || hasEliteRole || 
                  hasLeaderRole || hasSpecialAdminRole || hasAdminRole
                );

                token.cachedCanMarkAsKilled = hasTenchuRole || hasAdminRole;
                token.cachedIsAdmin = hasAdminRole;
                token.cachedCanAccessBossTimers = canAccessBossTimers;

                if (leaderRoleId && member.roles.includes(leaderRoleId)) {
                  token.cachedRoleBadge = "Tenchu Leader";
                } else if (viceLeaderRoleId && member.roles.includes(viceLeaderRoleId)) {
                  token.cachedRoleBadge = "Tenchu Vice Leader";
                } else if (coreRoleId && member.roles.includes(coreRoleId)) {
                  token.cachedRoleBadge = "Tenchu Core";
                } else if (hasTenchuRole) {
                  token.cachedRoleBadge = "Tenchu Member";
                }

                token.lastFetched = now;
              }
            } else {
              token.cachedCanMarkAsKilled = false;
              token.cachedIsAdmin = false;
              token.lastFetched = now;
            }
          }
        } catch (error) {
          console.error("[JWT Cache] Error refreshing Discord data:", error);
          // Don't update lastFetched on error, will retry next time
        }
      }

      return token;
    },

    async session({ session, token }) {
      // Add Discord data to session from JWT token
      if (session.user) {
        session.user.id = token.discordId as string;
        session.user.name = token.cachedNickname as string || token.displayName as string;
        session.user.roles = token.cachedRoles || [];
        session.accessToken = token.accessToken as string;
      }

      // Use cached data from JWT token (refreshed every 5 minutes in JWT callback)
      session.isInGuild = token.cachedIsInGuild || false;
      session.canMarkAsKilled = token.cachedCanMarkAsKilled || false;
      session.isAdmin = token.cachedIsAdmin || false;
      session.roleBadge = token.cachedRoleBadge;
      session.canAccessBossTimers = token.cachedCanAccessBossTimers ?? false;

      return session;
    },
  },

  session: {
    strategy: "jwt",
    maxAge: AUTH.REMEMBER_ME_MAX_AGE / 1000, // Convert to seconds - 7 days max session (remember me)
  },
};

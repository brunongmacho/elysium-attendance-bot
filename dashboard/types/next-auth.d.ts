/**
 * NextAuth Type Extensions
 * Extends default NextAuth types with custom session properties
 */

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      roles?: string[];
    };
    accessToken?: string;
    isInGuild: boolean;
    canMarkAsKilled: boolean;
    isAdmin: boolean;
    roleBadge?: string;
    canAccessBossTimers?: boolean;
  }

  interface User {
    id: string;
    roles?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    discordId?: string;
    displayName?: string;
    // Cached Discord data to avoid rate limiting
    cachedIsInGuild?: boolean;
    cachedRoles?: string[];
    cachedNickname?: string;
    cachedRoleBadge?: string;
    cachedCanMarkAsKilled?: boolean;
    cachedIsAdmin?: boolean;
    cachedCanAccessBossTimers?: boolean;
    lastFetched?: number; // Timestamp of last Discord API fetch
  }
}

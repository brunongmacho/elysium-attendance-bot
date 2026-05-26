/**
 * Environment Variable Validation
 * Validates that all required environment variables are present
 */

interface EnvConfig {
  // Required server-side variables
  MONGODB_URI: string;
  NEXTAUTH_SECRET: string;
  NEXTAUTH_URL: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_GUILD_ID: string;

  // Optional public variables
  NEXT_PUBLIC_TIMEZONE?: string;
}

/**
 * Validates required environment variables
 * @throws Error if any required variable is missing
 */
export function validateEnv(): EnvConfig {
  const required = [
    'MONGODB_URI',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_BOT_TOKEN',
    'DISCORD_GUILD_ID',
  ] as const;

  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\n` +
      `Please check your .env.local file and ensure all required variables are set.`
    );
  }

  return {
    MONGODB_URI: process.env.MONGODB_URI!,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL!,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID!,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET!,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN!,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID!,
    NEXT_PUBLIC_TIMEZONE: process.env.NEXT_PUBLIC_TIMEZONE,
  };
}

/**
 * Get validated environment config
 * Use this instead of process.env for type safety
 */
export const env = validateEnv();

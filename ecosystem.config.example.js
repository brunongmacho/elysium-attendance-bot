/**
 * PM2 Ecosystem Configuration
 *
 * Copy this file to ecosystem.config.js and fill in your secrets.
 * ecosystem.config.js is git-ignored to prevent accidental secret exposure.
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
module.exports = {
  apps: [
    {
      name: 'tenchu-bot',
      script: 'index2.js',

      // Node.js flags for memory optimization (512MB RAM target)
      node_args: '--expose-gc --max-old-space-size=360 --max-semi-space-size=40',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        LOG_LEVEL: 'info',

        // REQUIRED: Discord Bot Token (from Discord Developer Portal)
        DISCORD_TOKEN: 'your_discord_token_here',

        // REQUIRED: MongoDB connection string
        MONGODB_URI: 'your_mongodb_uri_here',

        // Feature flags — set to 'true' to enable MongoDB features
        USE_MONGODB_BIDDING: 'true',
        USE_MONGODB_ATTENDANCE: 'true',

        // Skip sync on startup for faster boot (set to 'true' to enable)
        SKIP_BACKGROUND_SYNC: 'false',
      },

      // Log configuration
      error_file: 'logs/error.log',
      out_file: 'logs/output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Process behavior
      max_memory_restart: '400M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: 'tenchu-dashboard',
      cwd: './dashboard',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        MONGODB_URI: 'your_mongodb_uri_here',
        DISCORD_CLIENT_ID: 'your_discord_client_id',
        DISCORD_CLIENT_SECRET: 'your_discord_client_secret',
        NEXTAUTH_SECRET: 'your_nextauth_secret',
        NEXTAUTH_URL: 'http://localhost:3001',
        NEXT_PUBLIC_GUILD_ID: 'your_guild_id',
      },
      error_file: 'logs/dashboard-error.log',
      out_file: 'logs/dashboard-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};

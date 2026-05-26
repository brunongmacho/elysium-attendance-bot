/**
 * Next.js Instrumentation
 * Runs once when the server starts
 */

export async function register() {
  // Only validate in runtime, not during build
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    // Validate environment variables on server startup
    const { validateEnv } = await import('./lib/env-validation');
    try {
      validateEnv();
      console.log('✅ Environment variables validated successfully');
    } catch (error) {
      console.error('❌ Environment validation failed:');
      console.error(error);
      // Log warning but don't crash - allow server to start with missing vars
      // The actual API routes will fail gracefully if needed
    }
  }
}

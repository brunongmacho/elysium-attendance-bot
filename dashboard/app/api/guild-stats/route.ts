/**
 * Guild Stats API Route
 * GET /api/guild-stats - Fetch guild statistics data
 * Moved from direct JSON import to reduce bundle size
 */

import { NextResponse } from 'next/server';
import guildStatsData from '@/guild-stats.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(guildStatsData, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('[API] Failed to fetch guild stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guild stats' },
      { status: 500 }
    );
  }
}

/**
 * Member Lore API Route
 * GET /api/lore - Fetch member lore data
 * Moved from direct JSON import to reduce bundle size (83K saved)
 */

import { NextResponse } from 'next/server';
import memberLoreData from '@/member-lore.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(memberLoreData, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('[API] Failed to fetch member lore:', error);
    return NextResponse.json(
      { error: 'Failed to fetch member lore' },
      { status: 500 }
    );
  }
}

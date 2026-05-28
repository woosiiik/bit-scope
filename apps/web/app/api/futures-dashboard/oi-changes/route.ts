import { type NextRequest, NextResponse } from 'next/server';
import { buildCacheKey, getGlobalCache } from '../../exchange/_lib/cache';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3000';
const CACHE_TTL = 60_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const period = request.nextUrl.searchParams.get('period') ?? '1d';

  const cache = getGlobalCache();
  const cacheKey = buildCacheKey('fd', 'oi-changes', { period });

  const cached = cache.getWithStale(cacheKey);
  if (cached.hit && cached.isFresh) {
    return NextResponse.json({ ...(cached.data as object), cached: true });
  }

  try {
    const url = `${API_BASE}/phase2/oi-changes?period=${period}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    cache.set(cacheKey, data, CACHE_TTL);
    return NextResponse.json({ ...data, cached: false });
  } catch (error) {
    if (cached.hit && cached.data) {
      return NextResponse.json({ ...(cached.data as object), cached: true, stale: true });
    }
    return NextResponse.json(
      { success: false, error: { message: error instanceof Error ? error.message : String(error) } },
      { status: 502 },
    );
  }
}

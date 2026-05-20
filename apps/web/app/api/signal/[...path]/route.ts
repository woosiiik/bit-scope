/**
 * 시그널 API 프록시 Route Handler
 *
 * 프론트엔드 요청을 NestJS 백엔드로 프록시하여
 * 백엔드 URL이 브라우저에 노출되지 않도록 한다.
 */

import { type NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000'
  );
}

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

async function proxyRequest(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { path } = await context.params;
  const backendPath = `/signal/${path.join('/')}`;
  const backendUrl = `${getBackendUrl()}${backendPath}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 시그널 토큰 헤더 전달
  const signalToken = request.headers.get('x-signal-token');
  if (signalToken) {
    headers['x-signal-token'] = signalToken;
  }

  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      signal: AbortSignal.timeout(10_000),
    };

    if (request.method === 'POST') {
      fetchOptions.body = await request.text();
    }

    const res = await fetch(backendUrl, fetchOptions);
    const data = await res.json();

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `시그널 API 프록시 오류: ${error instanceof Error ? error.message : String(error)}`,
          code: 'PROXY_ERROR',
        },
      },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest, context: RouteParams) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteParams) {
  return proxyRequest(request, context);
}

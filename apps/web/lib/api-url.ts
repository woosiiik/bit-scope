/**
 * NestJS 백엔드 API / WebSocket URL 유틸리티
 *
 * 프론트엔드에서 NestJS 백엔드에 접근할 때 사용하는 URL을 중앙에서 관리한다.
 *
 * Docker 배포 환경에서는 nginx 리버스 프록시를 경유하므로
 * NEXT_PUBLIC_API_URL(예: http://localhost/api/backend)을 사용해야 한다.
 * 직접 NestJS port(4000)로 접근하면 nginx를 우회하여 CORS, 라우팅 문제가 발생한다.
 *
 * 우선순위:
 * 1. NEXT_PUBLIC_API_BASE_URL (명시적 API 전용 URL)
 * 2. NEXT_PUBLIC_API_URL (nginx 프록시 경유 URL)
 * 3. 폴백: 현재 호스트의 /api/backend (브라우저) 또는 http://localhost:4000 (서버)
 *
 * @see infra/nginx/default.conf (/api/backend/* -> NestJS 프록시 규칙)
 */

/**
 * NestJS 백엔드 API 기본 URL을 반환한다.
 *
 * 브라우저 환경에서는 nginx 프록시 경로(/api/backend)를 기본값으로 사용하여
 * Docker 컨테이너 간 직접 통신 문제를 방지한다.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return (
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      `${window.location.origin}/api/backend`
    );
  }
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000'
  );
}

/**
 * WebSocket 서버 URL을 반환한다.
 *
 * Socket.IO 연결에 사용된다. nginx가 /socket.io/ 경로를 NestJS로 프록시하므로
 * 브라우저에서는 현재 호스트(origin)를 기본값으로 사용한다.
 */
export function getWsBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return (
      process.env.NEXT_PUBLIC_WS_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      window.location.origin
    );
  }
  return process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';
}

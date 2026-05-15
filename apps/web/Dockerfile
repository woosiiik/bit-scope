# =============================================================================
# BitScope Next.js 프론트엔드 Dockerfile
#
# Next.js standalone 빌드를 사용하여 최소한의 파일만 포함하는 프로덕션 이미지를 생성한다.
# 모노레포(pnpm workspace) 환경에서 빌드하며, OCI ARM VM 배포를 지원한다.
#
# 빌드: docker build -f apps/web/Dockerfile -t bitscope-web .
# (프로젝트 루트에서 실행)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: base - Node.js 베이스 이미지 및 pnpm 설치
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate

# 보안을 위한 작업 디렉토리 설정
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: deps - 의존성 설치
# -----------------------------------------------------------------------------
FROM base AS deps

# 모노레포 루트 설정 파일 복사
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY turbo.json tsconfig.base.json ./

# 각 패키지의 package.json만 먼저 복사 (캐시 최적화)
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# 의존성 설치 (--frozen-lockfile으로 lock 파일 일관성 보장)
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 3: builder - 공유 패키지 빌드 및 Next.js 빌드
# -----------------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
# 전체 소스 복사
COPY . .

# public 디렉토리 보장
RUN mkdir -p ./apps/web/public

# 공유 패키지(shared) 빌드
RUN pnpm --filter @bitscope/shared build

# Next.js standalone 빌드
# NEXT_PUBLIC_ 환경변수는 빌드 시점에 주입해야 한다
ARG NEXT_PUBLIC_API_URL=http://localhost/api/backend
ARG NEXT_PUBLIC_WS_URL=http://localhost
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=placeholder
ARG NEXT_PUBLIC_API_BASE_URL

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

# 빌드 버전: 빌드 시간 자동 생성 (캐시 무효화 + 배포 확인용)
# Next.js는 프로젝트 디렉토리(apps/web/)의 .env.local을 읽으므로
# 반드시 apps/web/.env.local에 작성해야 한다. (루트 .env.local이 아님)
RUN echo "NEXT_PUBLIC_BUILD_VERSION=$(date +%Y%m%d-%H%M%S)" >> ./apps/web/.env.local

# 빌드 시에도 server-preload.js를 주입하여 indexedDB 등 브라우저 API stub을 등록
# Next.js가 서버 컴포넌트를 컴파일할 때 MetaMask SDK가 indexedDB를 참조하는 것을 방지
ENV NODE_OPTIONS="--require /app/apps/web/server-preload.js"
# VPN/프록시 환경에서 Google Fonts 다운로드 시 self-signed cert 오류 방지 (빌드 단계에서만 사용)
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
RUN pnpm --filter @bitscope/web build

# -----------------------------------------------------------------------------
# Stage 4: runner - 프로덕션 실행 이미지 (최소 크기)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# 프로덕션 환경 설정
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 보안: 비루트 사용자 생성
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone 출력물 복사
# standalone 디렉토리에는 최소한의 node_modules와 서버 파일만 포함
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# 서버 preload 스크립트 (indexedDB 등 브라우저 API stub)
# builder 단계에서 복사하여 소스와 일관성을 보장한다.
COPY --from=builder /app/apps/web/server-preload.js ./apps/web/server-preload.js

# 파일 소유권을 비루트 사용자로 변경
RUN chown -R nextjs:nodejs /app

# 비루트 사용자로 전환
USER nextjs

EXPOSE 3000

# Next.js standalone 서버 실행
# --require로 preload 스크립트를 주입하여 indexedDB 등 브라우저 API stub을 등록
# 경로는 WORKDIR(/app) 기준 절대경로를 사용하여 모호함을 방지
CMD ["node", "--require", "/app/apps/web/server-preload.js", "apps/web/server.js"]

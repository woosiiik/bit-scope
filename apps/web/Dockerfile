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
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# 전체 소스 복사
COPY . .

# 공유 패키지(shared) 빌드 (Next.js가 의존)
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

# 파일 소유권을 비루트 사용자로 변경
RUN chown -R nextjs:nodejs /app

# 비루트 사용자로 전환
USER nextjs

EXPOSE 3000

# Next.js standalone 서버 실행
# standalone 빌드 시 모노레포 구조가 반영되어 apps/web/server.js로 생성됨
CMD ["node", "apps/web/server.js"]

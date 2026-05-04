# =============================================================================
# BitScope NestJS 백엔드 Dockerfile
#
# NestJS 백그라운드 서비스를 프로덕션용으로 빌드한다.
# WebSocket 시세 수신, DB 저장, 알림 모니터링, cron 스케줄러를 담당한다.
#
# 빌드: docker build -f apps/api/Dockerfile -t bitscope-api .
# (프로젝트 루트에서 실행)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: base - Node.js 베이스 이미지 및 pnpm 설치
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate

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
# Stage 3: builder - 공유 패키지 빌드 및 NestJS 빌드
# -----------------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
# 전체 소스 복사
COPY . .

# 디버그: node_modules 상태 확인
RUN ls -la /app/node_modules/.bin/tsup 2>/dev/null || echo "tsup NOT in root .bin"

# 공유 패키지(shared) 빌드
RUN /app/node_modules/.bin/tsup --config /app/packages/shared/tsup.config.ts

# NestJS 빌드 (TypeScript -> JavaScript 컴파일)
RUN pnpm --filter @bitscope/api build

# -----------------------------------------------------------------------------
# Stage 4: production-deps - 프로덕션 의존성만 설치
# -----------------------------------------------------------------------------
FROM base AS production-deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY turbo.json tsconfig.base.json ./

COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# 프로덕션 의존성만 설치 (devDependencies 제외)
RUN pnpm install --frozen-lockfile --prod

# -----------------------------------------------------------------------------
# Stage 5: runner - 프로덕션 실행 이미지 (최소 크기)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# 프로덕션 환경 설정
ENV NODE_ENV=production
ENV PORT=4000

# 보안: 비루트 사용자 생성
RUN addgroup --system --gid 1001 nestjs && \
    adduser --system --uid 1001 nestjs

# 프로덕션 의존성 복사
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps/api/node_modules ./apps/api/node_modules
# shared는 프로덕션 의존성이 없어 node_modules가 존재하지 않으므로 복사하지 않는다.
# 대신 workspace 심볼릭 링크 해소를 위해 shared의 package.json과 dist만 복사한다.

# 빌드된 공유 패키지 복사
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

# 빌드된 NestJS 앱 복사
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

# pnpm workspace의 @bitscope/shared 심볼릭 링크가 production-deps에서 깨질 수 있으므로
# node_modules 내부에 shared 패키지를 직접 연결한다.
RUN mkdir -p ./node_modules/@bitscope && \
    ln -sf /app/packages/shared ./node_modules/@bitscope/shared

# 파일 소유권을 비루트 사용자로 변경
RUN chown -R nestjs:nestjs /app

# 비루트 사용자로 전환
USER nestjs

EXPOSE 4000

# NestJS 서버 실행
CMD ["node", "apps/api/dist/main.js"]

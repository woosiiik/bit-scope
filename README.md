# BitScope

> 암호화폐 거래소 포트폴리오 통합 조회 서비스

**Live Demo:** http://bitscope.duckdns.org/

---

## 소개

BitScope는 여러 암호화폐 거래소에 분산된 자산을 하나의 대시보드에서 통합 조회하는 웹 서비스입니다. Web3 지갑(MetaMask)으로 로그인하고, 각 거래소의 API Key를 등록하면 실시간 포트폴리오를 확인할 수 있습니다.

### 핵심 보안 원칙

- API Key는 브라우저에서 안전하게 암호화되어 저장되며, 일체 외부로 전송되지 않습니다
- 클라이언트에서 거래소 API 요청을 서명하고, 서버는 CORS 프록시로 릴레이만 수행합니다
- 서버가 침해되어도 API Key가 유출되지 않는 Zero-Knowledge 구조입니다

---

## 지원 거래소 (9개)

### 국내 거래소 (KRW)
| 거래소 | 인증 방식 |
|--------|-----------|
| 업비트 (Upbit) | JWT (HS256) |
| 빗썸 (Bithumb) | JWT (HS256) |
| 코인원 (Coinone) | HMAC-SHA512 |

### 해외 거래소 (USDT)
| 거래소 | 인증 방식 | 비고 |
|--------|-----------|------|
| 바이낸스 (Binance) | HMAC-SHA256 | Spot + Futures |
| 바이빗 (Bybit) | HMAC-SHA256 | Unified Account |
| OKX | HMAC-SHA256 + Base64 | Passphrase 필요 |
| Gate.io | HMAC-SHA512 | Spot + Futures |
| Bitget | HMAC-SHA256 + Base64 | Passphrase 필요 |

### 탈중앙화 거래소 (DEX)
| 거래소 | 인증 방식 | 비고 |
|--------|-----------|------|
| Hyperliquid | 없음 (지갑 주소만) | API Key 불필요, Perps + Spot |

---

## 주요 기능

### 포트폴리오 대시보드
- 거래소별 자산 통합 조회 (총 평가금액, 투자금액, 손익, 수익률)
- 거래소별 자산현황 카드뷰 (Spot/Futures/Unified 분리 표시)
- 코인별 자산 분포 차트 (도넛 차트)
- 거래소 필터 (전체/국내/해외/DEX + 개별 거래소)
- 해외 거래소 USDT → KRW 자동 환산
- 30초 자동 갱신 + 수동 새로고침

### 김치 프리미엄 분석
- 국내 거래소 vs 바이낸스 실시간 김프 비교
- 비교 기준 국내 거래소 선택 (업비트/빗썸/코인원)
- 24시간/7일/30일 김프 추이 차트
- 1분 간격 김프 이력 DB 저장

### 마켓 시세
- 거래소별 전체 코인 실시간 시세
- 거래량/상승률/하락률 TOP 5 하이라이트
- 코인 상세: 호가 정보, 거래소 간 가격 비교

### 알림
- 가격 알림 (목표가 도달 시)
- 김프 알림 (김프 임계값 초과/미달 시, 음수 지원)
- 브라우저 알림 + 인앱 알림
- 텔레그램 봇 알림 (앱 꺼져도 수신 가능)

### 성과 분석
- 포트폴리오 시계열 추이 차트 (대시보드 접속 시 자동 스냅샷 저장)
- 코인별 수익률 랭킹 (TOP 5 수익/손실)
- 기간별 리포트 (일간/주간/월간)

### 기타
- Web3 지갑 로그인 (MetaMask, WalletConnect)
- 지갑 서명 기반 API Key 암호화 (nonce + AES-256)
- 워치리스트 (관심 코인 시세 추적)
- 다크/라이트 모드
- 한국어/영어 다국어 지원
- 데이터 내보내기 (CSV, JSON, PDF)
- 설정 백업/복원

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 15 (App Router), React 19, TypeScript |
| 상태 관리 | Zustand, TanStack Query |
| UI | Tailwind CSS, shadcn/ui, Recharts |
| Web3 | wagmi v2, viem, RainbowKit |
| 암호화 | crypto-js (AES-256, SHA-256, HMAC) |
| 백엔드 | NestJS 10, TypeORM, Socket.IO |
| 데이터베이스 | MySQL 8.0 |
| 모노레포 | Turborepo, pnpm |
| 인프라 | OCI ARM VM, Docker Compose, nginx |
| CI/CD | GitHub Actions |

---

## 아키텍처

```
                        ┌─────────────────────────┐
                        │   브라우저 (클라이언트)      │
                        │  - MetaMask 지갑 연결      │
                        │  - API Key 암호화/복호화    │
                        │  - 거래소 요청 서명 생성     │
                        └──────────┬──────────────┘
                                   │
                        ┌──────────▼──────────────┐
                        │   nginx (리버스 프록시)     │
                        │   :80 / :443              │
                        └────┬──────────────┬──────┘
                             │              │
                   ┌─────────▼────┐  ┌──────▼──────────┐
                   │  Next.js     │  │  NestJS          │
                   │  :3000       │  │  :4000           │
                   │              │  │                  │
                   │ - SSR/RSC    │  │ - WebSocket 시세  │
                   │ - CORS 프록시 │  │ - 알림 모니터링    │
                   │ - Route      │  │ - 스냅샷 저장     │
                   │   Handler    │  │ - 김프 계산       │
                   └──────────────┘  │ - 텔레그램 봇     │
                                     └───────┬─────────┘
                                             │
                                     ┌───────▼─────────┐
                                     │  MySQL :3306     │
                                     │  - 스냅샷        │
                                     │  - 알림 설정/이력  │
                                     │  - 김프 이력      │
                                     │  - 리포트        │
                                     └─────────────────┘
```

---

## 프로젝트 구조

```
bit-scope/
├── apps/
│   ├── web/                 # Next.js 프론트엔드
│   │   ├── app/             # App Router 페이지
│   │   ├── components/      # UI 컴포넌트
│   │   ├── hooks/           # React 훅
│   │   ├── lib/             # 유틸리티, API 클라이언트, 서명 모듈
│   │   └── store/           # Zustand 상태 저장소
│   └── api/                 # NestJS 백엔드
│       └── src/
│           ├── modules/     # 기능 모듈
│           │   ├── snapshot/ # 포트폴리오 스냅샷
│           │   ├── price/    # 실시간 시세 (WebSocket)
│           │   ├── premium/  # 김치 프리미엄
│           │   ├── alert/    # 알림
│           │   ├── report/   # 리포트
│           │   └── telegram/ # 텔레그램 봇
│           ├── common/      # 공통 필터, 인터셉터
│           └── config/      # DB, 환경 설정
├── packages/
│   └── shared/              # 공유 타입, 상수, 유틸리티
├── infra/
│   ├── nginx/               # nginx 설정
│   └── mysql/               # MySQL 초기화
├── scripts/                 # 배포/프로비저닝 스크립트
├── docs/                    # 문서
│   ├── deployment-guide.md  # 배포 가이드
│   └── database-schema.md   # DB 스키마
├── docker-compose.yml
└── .env.example
```

---

## 로컬 개발

### 사전 준비

- Node.js 20+
- pnpm 10+
- MySQL 8.0+ (로컬 또는 Docker)
- MetaMask 브라우저 확장

### 설치 및 실행

```bash
# 의존성 설치
pnpm install

# shared 패키지 빌드
pnpm --filter @bitscope/shared build

# 환경 변수 설정
cp apps/api/.env.example apps/api/.env     # DB 접속 정보
cp apps/web/.env.example apps/web/.env.local  # API URL, WalletConnect ID

# 개발 서버 시작 (터미널 2개)
cd apps/web && pnpm dev   # http://localhost:3500
cd apps/api && pnpm dev   # http://localhost:4500
```

### 환경 변수

**apps/api/.env**
```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=bitscope
DB_PASSWORD=비밀번호
DB_DATABASE=bitscope
PORT=4500
CORS_ORIGINS=http://localhost:3500
```

**apps/web/.env.local**
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4500
NEXT_PUBLIC_WS_URL=http://localhost:4500
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=WalletConnect_ID
```

---

## 배포

OCI Always Free Tier VM에 Docker Compose로 배포합니다.
상세 절차는 [배포 가이드](docs/deployment-guide.md)를 참조하세요.

```bash
# 서버에서
git clone https://github.com/woosiiik/bit-scope.git
cd bitscope
cp .env.example .env && vi .env
sudo docker compose up -d --build
```

---

## 문서

- [배포 가이드](docs/deployment-guide.md) — OCI 배포 절차서
- [DB 스키마](docs/database-schema.md) — 데이터베이스 테이블 설명

---

## 라이선스

Private Project

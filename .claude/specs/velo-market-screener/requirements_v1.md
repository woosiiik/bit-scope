# Velo Market Screener - 요구사항 문서

## Introduction

BitScope 프로젝트에 **마켓 스크리너** 페이지를 신규 추가한다. [velo.xyz/market](https://velo.xyz/market)과 유사하게, 250개 이상의 선물 코인에 대한 가격, OI(미결제약정), 펀딩비율, 거래량 등의 데이터를 6개 거래소(Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid)에서 집계하여 테이블과 차트로 제공하는 마켓 와이드 스크리너이다.

**Phase 1 범위**: 프론트엔드 중심 구현으로, 서버 사이드 주기적 수집 없이 각 거래소의 벌크 ticker API를 클라이언트(Next.js Route Handler 경유)에서 직접 호출하여 데이터를 표시한다.

**주요 구성 요소**:
1. 스크리너 테이블 - 전 코인 리스트를 다양한 탭으로 필터/정렬
2. Return Buckets - 수익률 분포 히스토그램
3. Market Volume - 거래소별 총 거래량 바 차트
4. Total Open Interest - 거래소별 총 OI 바 차트
5. Sector Performance - 섹터별 성과 비교 차트

**데이터 소스**: 6개 거래소의 벌크 ticker API (인증 불필요, 1회 호출로 전 코인 데이터 취득)

---

## Requirements

### Requirement 1: 사이드바 메뉴 추가

**User Story:** As a BitScope 사용자, I want 사이드바에서 마켓 스크리너 메뉴를 찾아 접근할 수 있기를, so that 기존 메뉴 구조에서 자연스럽게 새 기능을 발견하고 사용할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 사이드바를 확인하면 THEN 시스템은 기존 메뉴 구조에 맞춰 "Market Screener" 메뉴 항목을 SHALL 표시한다.
2. WHEN 사용자가 "Market Screener" 메뉴를 클릭하면 THEN 시스템은 `/market-screener` 경로로 SHALL 이동한다.
3. WHERE 사이드바 메뉴 THEN 시스템은 적절한 아이콘과 함께 메뉴 항목을 SHALL 표시한다.
4. WHEN 사용자가 `/market-screener` 페이지에 있을 때 THEN 시스템은 해당 사이드바 메뉴 항목을 활성 상태로 SHALL 표시한다.

---

### Requirement 2: 멀티 거래소 벌크 Ticker 데이터 수집

**User Story:** As a BitScope 사용자, I want 6개 거래소의 선물 코인 데이터를 통합적으로 조회하기를, so that 개별 거래소를 방문하지 않고도 전체 시장 현황을 파악할 수 있다.

#### Acceptance Criteria

1. WHEN 마켓 스크리너 페이지가 로드되면 THEN 시스템은 다음 6개 거래소의 벌크 ticker API를 Next.js Route Handler를 통해 SHALL 호출한다:
   - Binance: `GET /fapi/v1/ticker/24hr`
   - Bybit: `GET /v5/market/tickers?category=linear`
   - OKX: `GET /api/v5/market/tickers?instType=SWAP`
   - Gate.io: `GET /api/v4/futures/usdt/tickers`
   - Bitget: `GET /api/v2/mix/market/tickers?productType=USDT-FUTURES`
   - Hyperliquid: `POST /info {"type":"metaAndAssetCtxs"}`
2. WHEN 거래소 데이터를 수신하면 THEN 시스템은 각 거래소의 응답을 공통 포맷(코인 심볼, 가격, 24h 변화율, 24h 거래량, OI, 펀딩비율)으로 SHALL 정규화한다.
3. WHEN 동일 코인이 여러 거래소에 존재하면 THEN 시스템은 해당 코인의 데이터를 거래소별로 집계(거래량 합산, OI 합산, 가격은 거래량 가중 평균, 펀딩비율은 OI 가중 평균)하여 SHALL 표시한다.
4. WHEN 데이터를 로딩 중일 때 THEN 시스템은 로딩 스켈레톤 UI를 SHALL 표시한다.
5. IF 특정 거래소 API 호출이 실패하면 THEN 시스템은 나머지 거래소 데이터로 정상 동작을 SHALL 유지하고, 실패한 거래소를 사용자에게 표시한다.
6. WHEN 데이터가 로드된 후 THEN 시스템은 TanStack Query를 사용하여 일정 주기(기본 60초)로 데이터를 자동 갱신 SHALL 한다.
7. WHERE Next.js Route Handler THEN 시스템은 거래소 API 호출 시 CORS 프록시 역할을 SHALL 수행한다.

---

### Requirement 3: 스크리너 테이블

**User Story:** As a 크립토 트레이더, I want 250개 이상의 선물 코인을 다양한 기준으로 필터링하고 정렬하여 테이블로 볼 수 있기를, so that 관심 있는 코인을 빠르게 찾고 시장 동향을 파악할 수 있다.

#### Acceptance Criteria

##### 3.1 테이블 컬럼

1. WHERE 스크리너 테이블 THEN 시스템은 다음 컬럼을 SHALL 표시한다:
   - 코인명 (심볼 + 아이콘)
   - 현재 가격 (USD)
   - 24h 변화율 (%, 양수는 초록/음수는 빨간)
   - 24h 거래량 (USD, 약식 표기 $1.2B)
   - OI (미결제약정, USD, 약식 표기)
   - 펀딩비율 (%, 양수는 초록/음수는 빨간)
2. WHEN 테이블 데이터가 갱신되면 THEN 시스템은 변경된 값에 시각적 피드백(깜빡임 또는 색상 전환)을 SHALL 제공한다.

##### 3.2 정렬 탭

3. WHEN 사용자가 "Top Gainers" 탭을 선택하면 THEN 시스템은 24h 변화율 기준 내림차순으로 코인을 SHALL 정렬한다.
4. WHEN 사용자가 "Top Losers" 탭을 선택하면 THEN 시스템은 24h 변화율 기준 오름차순으로 코인을 SHALL 정렬한다.
5. WHEN 사용자가 "Top Volume" 탭을 선택하면 THEN 시스템은 24h 거래량 기준 내림차순으로 코인을 SHALL 정렬한다.
6. WHEN 사용자가 "New Listings" 탭을 선택하면 THEN 시스템은 최근 상장된 코인을 상단에 SHALL 표시한다.

##### 3.3 시가총액 탭

7. WHEN 사용자가 "Large Cap" 탭을 선택하면 THEN 시스템은 시가총액 $10B 이상으로 분류된 코인만 SHALL 필터링한다.
8. WHEN 사용자가 "Mid Cap" 탭을 선택하면 THEN 시스템은 시가총액 $1B~$10B으로 분류된 코인만 SHALL 필터링한다.
9. WHEN 사용자가 "Small Cap" 탭을 선택하면 THEN 시스템은 시가총액 $1B 미만으로 분류된 코인만 SHALL 필터링한다.
10. WHERE 시가총액 분류 데이터 THEN 시스템은 하드코딩된 정적 매핑 파일을 기반으로 코인의 시가총액 등급을 SHALL 결정한다.

##### 3.4 섹터 탭

11. WHEN 사용자가 "DeFi" 탭을 선택하면 THEN 시스템은 DeFi 섹터(AAVE, UNI, MKR, 1INCH, JUP, CRV, COMP, SNX 등)로 분류된 코인만 SHALL 필터링한다.
12. WHEN 사용자가 "L1" 탭을 선택하면 THEN 시스템은 L1 섹터(BTC, ETH, SOL, AVAX, APT, BNB, SUI, NEAR, ADA 등)로 분류된 코인만 SHALL 필터링한다.
13. WHEN 사용자가 "L2" 탭을 선택하면 THEN 시스템은 L2 섹터(ARB, OP, ZK, POL, STRK, MNT 등)로 분류된 코인만 SHALL 필터링한다.
14. WHEN 사용자가 "Metaverse" 탭을 선택하면 THEN 시스템은 Metaverse 섹터(SAND, MANA, AXS, GALA, ENJ, RONIN 등)로 분류된 코인만 SHALL 필터링한다.
15. WHEN 사용자가 "Meme" 탭을 선택하면 THEN 시스템은 Meme 섹터(DOGE, SHIB, PEPE, BONK, WIF, POPCAT, FLOKI 등)로 분류된 코인만 SHALL 필터링한다.
16. WHEN 사용자가 "Dino" 탭을 선택하면 THEN 시스템은 Dino 섹터(LTC, XRP, XLM, XMR, ZEC, DASH, ETC 등 2017년 이전 출시 코인)로 분류된 코인만 SHALL 필터링한다.
17. WHEN 사용자가 "AI" 탭을 선택하면 THEN 시스템은 AI 섹터(FET, NEAR, RENDER, TAO 등)로 분류된 코인만 SHALL 필터링한다.
18. WHERE 섹터 분류 데이터 THEN 시스템은 하드코딩된 정적 매핑 파일을 기반으로 코인의 섹터를 SHALL 결정한다.

##### 3.5 테이블 인터랙션

19. WHEN 사용자가 테이블의 컬럼 헤더를 클릭하면 THEN 시스템은 해당 컬럼 기준으로 오름차순/내림차순 토글 정렬을 SHALL 수행한다.
20. WHEN 사용자가 테이블의 코인 행을 클릭하면 THEN 시스템은 `/futures-dashboard?coin=XXX` 경로로 SHALL 이동한다.
21. WHEN 코인 수가 많을 때 THEN 시스템은 가상 스크롤(virtualized list) 또는 페이지네이션을 사용하여 렌더링 성능을 SHALL 최적화한다.
22. WHEN 사용자가 검색 입력란에 코인명 또는 심볼을 입력하면 THEN 시스템은 실시간으로 테이블을 필터링하여 일치하는 코인만 SHALL 표시한다.

---

### Requirement 4: Return Buckets (수익률 분포 히스토그램)

**User Story:** As a 크립토 트레이더, I want 전체 시장의 수익률 분포를 히스토그램으로 확인하기를, so that 시장의 전반적인 방향성과 분위기를 한눈에 파악할 수 있다.

#### Acceptance Criteria

1. WHERE Return Buckets 차트 THEN 시스템은 Recharts를 사용하여 수익률 분포 히스토그램을 SHALL 표시한다.
2. WHEN 차트가 표시되면 THEN 시스템은 X축에 수익률 구간(-30%~+30%, 적절한 구간 크기로 분할), Y축에 해당 구간에 속하는 코인 수를 SHALL 표시한다.
3. WHEN 사용자가 기간 선택기에서 기간을 변경하면 THEN 시스템은 해당 기간(1d, 1w, 1m)의 수익률 기준으로 히스토그램을 SHALL 갱신한다.
4. IF 선택 기간이 1d이면 THEN 시스템은 벌크 ticker의 24h 변화율 데이터를 SHALL 사용한다.
5. IF 선택 기간이 1w 또는 1m이면 THEN 시스템은 추가적인 Kline API 호출 또는 사전 계산된 데이터를 통해 해당 기간의 변화율을 SHALL 산출한다.
6. WHEN 사용자가 히스토그램의 막대 위에 마우스를 올리면 THEN 시스템은 해당 수익률 구간에 속하는 코인 목록(심볼 + 수익률)을 툴팁으로 SHALL 표시한다.
7. WHEN 히스토그램이 표시될 때 THEN 시스템은 양수 구간 막대를 초록색, 음수 구간 막대를 빨간색으로 SHALL 색상 구분한다.

---

### Requirement 5: Market Volume (거래소별 총 거래량 바 차트)

**User Story:** As a 크립토 트레이더, I want 각 거래소의 총 선물 거래량을 비교하기를, so that 유동성이 집중된 거래소를 파악하고 거래 판단에 참고할 수 있다.

#### Acceptance Criteria

1. WHERE Market Volume 차트 THEN 시스템은 Recharts를 사용하여 6개 거래소의 24h 총 선물 거래량을 바 차트로 SHALL 표시한다.
2. WHEN 차트가 표시되면 THEN 시스템은 각 거래소(Binance, Bybit, OKX, Gate.io, Bitget, Hyperliquid)별로 해당 거래소 전 코인의 24h 거래량 합계를 SHALL 계산하여 표시한다.
3. WHEN 사용자가 막대 위에 마우스를 올리면 THEN 시스템은 해당 거래소의 정확한 거래량 수치를 툴팁으로 SHALL 표시한다.
4. WHERE Market Volume 바 차트 THEN 시스템은 각 거래소를 구분할 수 있는 고유 색상을 SHALL 사용한다.
5. WHEN 차트가 표시되면 THEN 시스템은 거래량이 큰 거래소 순서로 막대를 SHALL 정렬한다.

---

### Requirement 6: Total Open Interest (거래소별 총 OI 바 차트)

**User Story:** As a 크립토 트레이더, I want 각 거래소의 총 미결제약정(OI)을 비교하기를, so that 포지션이 집중된 거래소를 파악하고 시장 레버리지 수준을 이해할 수 있다.

#### Acceptance Criteria

1. WHERE Total Open Interest 차트 THEN 시스템은 Recharts를 사용하여 6개 거래소의 총 OI를 바 차트로 SHALL 표시한다.
2. WHEN 차트가 표시되면 THEN 시스템은 각 거래소별로 전 코인의 현재 OI 합계(USD)를 SHALL 계산하여 표시한다.
3. WHEN 사용자가 막대 위에 마우스를 올리면 THEN 시스템은 해당 거래소의 정확한 OI 수치를 툴팁으로 SHALL 표시한다.
4. WHERE Total Open Interest 바 차트 THEN 시스템은 각 거래소를 구분할 수 있는 고유 색상(Market Volume 차트와 동일한 색상 스킴)을 SHALL 사용한다.
5. WHEN 차트가 표시되면 THEN 시스템은 OI가 큰 거래소 순서로 막대를 SHALL 정렬한다.
6. IF 특정 거래소의 ticker API에 OI 데이터가 포함되지 않은 경우(예: Binance ticker) THEN 시스템은 해당 거래소의 OI를 별도 API(`/fapi/v1/openInterest` 등)로 수집하거나, 데이터 부재를 명시하여 SHALL 처리한다.

---

### Requirement 7: Sector Performance (섹터별 성과 비교 차트)

**User Story:** As a 크립토 트레이더, I want 크립토 섹터별 성과를 한눈에 비교하기를, so that 어떤 섹터가 강세/약세인지 파악하고 투자 전략에 활용할 수 있다.

#### Acceptance Criteria

1. WHERE Sector Performance 차트 THEN 시스템은 Recharts를 사용하여 6개 섹터(DeFi, L1, L2, Gaming, AI, Meme)의 성과를 비교 차트로 SHALL 표시한다.
2. WHEN 차트가 표시되면 THEN 시스템은 각 섹터에 속하는 코인들의 평균 수익률을 SHALL 계산하여 표시한다.
3. WHEN 사용자가 기간 선택기에서 기간을 변경하면 THEN 시스템은 해당 기간(1d, 1w, 1m)의 평균 수익률 기준으로 차트를 SHALL 갱신한다.
4. IF 선택 기간이 1d이면 THEN 시스템은 벌크 ticker의 24h 변화율을 기반으로 섹터 평균을 SHALL 계산한다.
5. IF 선택 기간이 1w 또는 1m이면 THEN 시스템은 추가적인 Kline API 호출 또는 사전 계산된 데이터를 통해 해당 기간의 변화율을 SHALL 산출한다.
6. WHEN 사용자가 섹터 막대/영역 위에 마우스를 올리면 THEN 시스템은 해당 섹터의 평균 수익률과 구성 코인 목록을 툴팁으로 SHALL 표시한다.
7. WHERE Sector Performance 차트 THEN 시스템은 각 섹터를 구분할 수 있는 고유 색상을 SHALL 사용한다.
8. WHEN 차트가 표시되면 THEN 시스템은 성과가 높은 섹터 순서로 SHALL 정렬한다.

---

### Requirement 8: 정적 매핑 데이터 관리

**User Story:** As a BitScope 개발자, I want 코인의 시가총액 등급과 섹터 분류를 정적 매핑 파일로 관리하기를, so that 외부 API 의존 없이 빠르고 안정적으로 코인을 분류할 수 있다.

#### Acceptance Criteria

1. WHERE 정적 매핑 파일 THEN 시스템은 다음 정보를 포함하는 코인 매핑 데이터를 SHALL 관리한다:
   - 코인 심볼 (예: BTC, ETH, SOL)
   - 시가총액 등급 (Large Cap / Mid Cap / Small Cap)
   - 섹터 분류 (DeFi, L1, L2, Metaverse, Meme, Dino, AI) - 1개 코인이 복수 섹터에 속할 수 있음
2. WHERE 매핑 파일 THEN 시스템은 250개 이상의 주요 선물 거래 코인에 대한 분류를 SHALL 포함한다.
3. IF 매핑에 존재하지 않는 새로운 코인이 거래소에서 발견되면 THEN 시스템은 해당 코인을 "Uncategorized"로 SHALL 분류하고, 테이블에는 정상적으로 표시한다.
4. WHERE 정적 매핑 파일 THEN 시스템은 TypeScript 상수 파일 또는 JSON 파일 형태로 `packages/shared` 또는 앱 내부에 SHALL 관리한다.

---

### Requirement 9: 페이지 레이아웃 및 반응형 디자인

**User Story:** As a BitScope 사용자, I want 마켓 스크리너 페이지가 깔끔하게 구성되고 다양한 화면 크기에서 잘 표시되기를, so that 데스크톱과 모바일에서 모두 편리하게 사용할 수 있다.

#### Acceptance Criteria

1. WHERE 마켓 스크리너 페이지 레이아웃 THEN 시스템은 상단에 스크리너 테이블, 하단에 차트 위젯들(Return Buckets, Market Volume, Total OI, Sector Performance)을 그리드로 SHALL 배치한다.
2. WHEN 화면 너비가 데스크톱(1024px 이상)일 때 THEN 시스템은 하단 차트를 2x2 그리드 레이아웃으로 SHALL 표시한다.
3. WHEN 화면 너비가 태블릿(768px~1023px)일 때 THEN 시스템은 하단 차트를 1열 레이아웃으로 SHALL 전환한다.
4. WHEN 화면 너비가 모바일(767px 이하)일 때 THEN 시스템은 테이블과 차트를 세로 스택 레이아웃으로 SHALL 전환하고, 테이블을 가로 스크롤 가능하게 한다.
5. WHERE 마켓 스크리너 페이지 THEN 시스템은 기존 BitScope 대시보드 페이지들과 일관된 스타일(Tailwind CSS, shadcn/ui)을 SHALL 유지한다.
6. WHERE 페이지 타이틀 THEN 시스템은 "Market Screener" 제목과 마지막 데이터 갱신 시간을 SHALL 표시한다.

---

### Requirement 10: 데이터 갱신 및 캐싱

**User Story:** As a BitScope 사용자, I want 데이터가 실시간에 가까운 주기로 자동 갱신되기를, so that 최신 시장 상황을 지속적으로 모니터링할 수 있다.

#### Acceptance Criteria

1. WHEN 페이지가 포커스 상태일 때 THEN 시스템은 TanStack Query의 `refetchInterval`을 사용하여 60초마다 데이터를 자동 갱신 SHALL 한다.
2. WHEN 페이지가 백그라운드(탭 비활성)일 때 THEN 시스템은 불필요한 API 호출을 방지하기 위해 자동 갱신을 SHALL 일시 중지한다.
3. WHEN 사용자가 수동 새로고침 버튼을 클릭하면 THEN 시스템은 즉시 모든 거래소 데이터를 SHALL 갱신한다.
4. WHERE Next.js Route Handler THEN 시스템은 거래소 API 응답을 적절한 TTL(30초~60초)로 캐싱하여 동일 요청의 중복 외부 API 호출을 SHALL 방지한다.
5. WHEN 데이터 갱신 중 에러가 발생하면 THEN 시스템은 이전 캐시 데이터를 유지하면서 에러 상태를 사용자에게 SHALL 표시한다.
6. WHEN 마지막 갱신 시간이 2분 이상 경과하면 THEN 시스템은 데이터가 오래되었음을 시각적으로(경고 배지 등) SHALL 표시한다.

---

### Requirement 11: 성능 및 최적화 (비기능 요구사항)

**User Story:** As a BitScope 사용자, I want 페이지가 빠르게 로드되고 부드럽게 동작하기를, so that 대량의 코인 데이터를 조회할 때도 쾌적한 사용 경험을 얻을 수 있다.

#### Acceptance Criteria

1. WHEN 페이지 초기 로드 시 THEN 시스템은 3초 이내에 스크리너 테이블의 첫 번째 데이터를 SHALL 표시한다.
2. WHEN 6개 거래소 API를 호출할 때 THEN 시스템은 모든 거래소를 병렬로 호출하여 총 응답 시간을 SHALL 최소화한다.
3. WHERE 스크리너 테이블 THEN 시스템은 250개 이상의 행을 렌더링할 때 가상 스크롤 또는 페이지네이션을 사용하여 DOM 노드 수를 SHALL 최적화한다.
4. WHEN 차트 컴포넌트가 필요할 때 THEN 시스템은 동적 임포트(lazy loading)를 사용하여 초기 번들 크기를 SHALL 최소화한다.
5. WHERE 거래소 API Rate Limit THEN 시스템은 각 거래소의 rate limit을 준수하여 API 차단을 SHALL 방지한다.
6. WHEN 탭/필터를 전환할 때 THEN 시스템은 이미 로드된 데이터를 클라이언트에서 필터링/정렬하여 추가 API 호출 없이 즉시(200ms 이내) SHALL 반영한다.

---

### Requirement 12: 에러 처리 및 안정성 (비기능 요구사항)

**User Story:** As a BitScope 사용자, I want 일부 거래소에 장애가 발생하더라도 나머지 데이터를 정상적으로 확인할 수 있기를, so that 서비스 안정성을 신뢰하고 지속적으로 사용할 수 있다.

#### Acceptance Criteria

1. IF 1개 이상의 거래소 API 호출이 실패하면 THEN 시스템은 성공한 거래소 데이터만으로 테이블과 차트를 SHALL 정상 표시한다.
2. WHEN 거래소 API 호출이 실패하면 THEN 시스템은 페이지 상단에 어떤 거래소 데이터가 누락되었는지 경고 배너를 SHALL 표시한다.
3. IF 모든 거래소 API 호출이 실패하면 THEN 시스템은 전체 에러 화면을 표시하고 재시도 버튼을 SHALL 제공한다.
4. WHEN 거래소 API 호출이 타임아웃(10초)되면 THEN 시스템은 해당 거래소를 실패 처리하고 나머지 데이터로 SHALL 진행한다.
5. WHERE Next.js Route Handler THEN 시스템은 거래소 API 에러 응답(4xx, 5xx)을 적절한 에러 메시지로 변환하여 프론트엔드에 SHALL 전달한다.

---

### Requirement 13: New Listings 감지

**User Story:** As a 크립토 트레이더, I want 최근 거래소에 새로 상장된 선물 코인을 빠르게 확인하기를, so that 신규 상장 코인의 초기 거래 기회를 놓치지 않을 수 있다.

#### Acceptance Criteria

1. WHEN "New Listings" 탭이 선택되면 THEN 시스템은 최근 상장된 코인을 상장일 기준 최신순으로 SHALL 정렬하여 표시한다.
2. WHERE New Listings 감지 THEN 시스템은 거래소의 `exchangeInfo` (Binance), `instruments-info` (Bybit), `instruments` (OKX) 등의 API를 호출하여 상장 정보를 SHALL 수집한다.
3. WHEN 새로 상장된 코인이 감지되면 THEN 시스템은 해당 코인에 "NEW" 배지를 SHALL 표시한다.
4. WHERE New Listings 기준 THEN 시스템은 최근 30일 이내에 상장된 코인을 신규 상장으로 SHALL 분류한다.

---

### Requirement 14: 심볼 정규화 및 매칭

**User Story:** As a BitScope 개발자, I want 거래소마다 다른 심볼 형식을 통합적으로 관리하기를, so that 동일 코인의 데이터를 거래소 간에 정확하게 매칭할 수 있다.

#### Acceptance Criteria

1. WHERE 심볼 정규화 THEN 시스템은 각 거래소의 심볼 형식을 공통 형식(예: "BTC", "ETH")으로 SHALL 변환한다:
   - Binance: "BTCUSDT" -> "BTC"
   - Bybit: "BTCUSDT" -> "BTC"
   - OKX: "BTC-USDT-SWAP" -> "BTC"
   - Gate.io: "BTC_USDT" -> "BTC"
   - Bitget: "BTCUSDT" -> "BTC"
   - Hyperliquid: "BTC" -> "BTC"
2. WHEN 정규화된 심볼이 동일한 경우 THEN 시스템은 해당 코인의 거래소별 데이터를 동일 코인으로 SHALL 매칭한다.
3. IF USDT-마진 외의 선물(COIN-마진 등)이 포함되면 THEN 시스템은 USDT-마진 선물만 SHALL 필터링한다.

---

## Non-Functional Requirements Summary

| 항목 | 요구사항 |
|---|---|
| **성능** | 초기 로드 3초 이내, 탭 전환 200ms 이내, 250+ 코인 가상 스크롤 |
| **가용성** | 개별 거래소 장애 시 부분 동작 보장 (graceful degradation) |
| **데이터 신선도** | 60초 자동 갱신, 2분 초과 시 경고 표시 |
| **호환성** | 데스크톱/태블릿/모바일 반응형 지원 |
| **기술 스택** | Next.js Route Handler, TanStack Query, Recharts, Tailwind CSS, shadcn/ui |
| **Rate Limit** | 각 거래소 API rate limit 준수 |
| **데이터 정확성** | 6개 거래소 벌크 ticker API를 병렬 호출, 심볼 정규화를 통한 정확한 매칭 |

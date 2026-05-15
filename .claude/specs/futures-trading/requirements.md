# 선물 거래 페이지 - 요구사항 문서

## 소개

BitScope 프로젝트에 **선물(Futures) 거래 페이지**를 추가합니다. 현재 "선물" 메뉴는 롱/숏 비율, 펀딩레이트 등 선물 마켓 데이터 대시보드 역할을 하고 있으며, 이를 "선물 마켓 데이터"로 이름을 변경하고, 새로운 "선물 거래" 메뉴를 추가합니다.

선물 거래 페이지는 해외 거래소(Binance, Bybit, OKX, Gate, Bitget)의 선물 차트, 오더북, 주문창(Coming Soon), 오픈 포지션 및 오픈 오더 조회 기능을 제공합니다. 기존 보안 아키텍처(클라이언트 서명 + Route Handler 릴레이)를 그대로 활용하며, TradingView 차트 위젯과 signer 모듈 등 기존 인프라를 재사용합니다.

---

## 요구사항

### 요구사항 1: 사이드바 네비게이션 메뉴 변경

**User Story:** 사용자로서, 선물 마켓 데이터와 선물 거래를 명확히 구분된 메뉴로 접근하고 싶다. 그래야 원하는 기능을 혼동 없이 사용할 수 있다.

#### 수용 기준

1. WHEN 사이드바 네비게이션이 렌더링될 때 THEN 시스템은 기존 "선물" 메뉴명을 "선물 마켓 데이터"로 표시 SHALL 한다.
2. WHEN 사이드바 네비게이션이 렌더링될 때 THEN 시스템은 "선물 마켓 데이터" 메뉴 아래에 "선물 거래" 메뉴를 표시 SHALL 한다.
3. WHEN 사용자가 "선물 거래" 메뉴를 클릭할 때 THEN 시스템은 선물 거래 페이지(`/futures-trading`)로 이동 SHALL 한다.
4. WHEN 사용자가 "선물 마켓 데이터" 메뉴를 클릭할 때 THEN 시스템은 기존 선물 마켓 데이터 페이지로 이동 SHALL 한다.
5. WHEN 사용자가 선물 거래 페이지에 있을 때 THEN 시스템은 "선물 거래" 메뉴를 활성 상태로 표시 SHALL 한다.

---

### 요구사항 2: 코인 선택 기능

**User Story:** 사용자로서, 검색 가능한 드롭다운에서 원하는 코인을 빠르게 선택하고 싶다. 그래야 다양한 선물 코인의 정보를 편리하게 조회할 수 있다.

#### 수용 기준

1. WHEN 선물 거래 페이지가 로드될 때 THEN 시스템은 BTCUSDT를 기본 선택된 코인으로 표시 SHALL 한다.
2. WHEN 사용자가 코인 선택 콤보박스를 클릭할 때 THEN 시스템은 주요 선물 코인 목록(BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT 등)을 드롭다운으로 표시 SHALL 한다.
3. WHEN 사용자가 콤보박스에 텍스트를 입력할 때 THEN 시스템은 입력된 텍스트로 코인 목록을 필터링하여 표시 SHALL 한다.
4. WHEN 사용자가 드롭다운에서 코인을 선택할 때 THEN 시스템은 선택된 코인으로 차트, 오더북, 주문창의 데이터를 갱신 SHALL 한다.
5. IF 선택한 코인이 현재 거래소에서 지원되지 않는 경우 THEN 시스템은 해당 코인이 이 거래소에서 지원되지 않음을 안내 메시지로 표시 SHALL 한다.

---

### 요구사항 3: 거래소 선택 기능

**User Story:** 사용자로서, 여러 해외 거래소 중 원하는 거래소를 쉽게 전환하고 싶다. 그래야 거래소별 선물 데이터를 비교하고 확인할 수 있다.

#### 수용 기준

1. WHEN 선물 거래 페이지가 로드될 때 THEN 시스템은 Binance를 기본 선택된 거래소로 표시 SHALL 한다.
2. WHEN 선물 거래 페이지가 렌더링될 때 THEN 시스템은 상단에 Binance, Bybit, OKX, Gate, Bitget 버튼을 표시 SHALL 한다.
3. WHEN 사용자가 거래소 버튼을 클릭할 때 THEN 시스템은 해당 거래소를 활성 상태로 전환하고 차트, 오더북, 주문창 데이터를 해당 거래소 기준으로 갱신 SHALL 한다.
4. WHEN 거래소가 전환될 때 THEN 시스템은 현재 선택된 코인의 해당 거래소 심볼로 모든 데이터를 새로 로드 SHALL 한다.

---

### 요구사항 4: TradingView 선물 차트

**User Story:** 사용자로서, 선택한 거래소와 코인의 선물 차트를 실시간으로 확인하고 싶다. 그래야 기술적 분석을 기반으로 거래 판단을 내릴 수 있다.

#### 수용 기준

1. WHEN 코인과 거래소가 선택된 상태일 때 THEN 시스템은 화면 왼쪽 영역에 해당 거래소의 PERP(무기한 선물) 심볼로 TradingView 차트를 표시 SHALL 한다.
2. WHEN 거래소가 Binance일 때 THEN 시스템은 TradingView 심볼을 `BINANCE:{symbol}PERP` 형식으로 매핑 SHALL 한다.
3. WHEN 거래소가 Bybit일 때 THEN 시스템은 TradingView 심볼을 `BYBIT:{symbol}.P` 형식으로 매핑 SHALL 한다.
4. WHEN 거래소가 OKX일 때 THEN 시스템은 TradingView 심볼을 `OKX:{symbol}.P` 형식으로 매핑 SHALL 한다.
5. WHEN 거래소가 Gate일 때 THEN 시스템은 TradingView 심볼을 `GATEIO:{symbol}PERP` 형식으로 매핑 SHALL 한다.
6. WHEN 거래소가 Bitget일 때 THEN 시스템은 TradingView 심볼을 `BITGET:{symbol}.P` 형식으로 매핑 SHALL 한다.
7. WHEN 코인 또는 거래소가 변경될 때 THEN 시스템은 새로운 심볼로 TradingView 차트를 업데이트 SHALL 한다.
8. WHEN TradingView 차트를 렌더링할 때 THEN 시스템은 기존 TradingView 차트 위젯 컴포넌트를 재사용 SHALL 한다.

---

### 요구사항 5: 선물 오더북

**User Story:** 사용자로서, 선택한 거래소와 코인의 선물 오더북(호가)을 실시간으로 확인하고 싶다. 그래야 시장의 매수/매도 수급을 파악할 수 있다.

#### 수용 기준

1. WHEN 코인과 거래소가 선택된 상태일 때 THEN 시스템은 화면 중앙 영역에 해당 거래소의 선물 오더북을 표시 SHALL 한다.
2. WHEN 오더북이 표시될 때 THEN 시스템은 매도 호가(Ask)를 상단에 빨간색으로, 매수 호가(Bid)를 하단에 초록색으로 표시 SHALL 한다.
3. WHEN 오더북이 표시될 때 THEN 시스템은 각 호가에 가격, 수량, 누적 수량을 표시 SHALL 한다.
4. WHEN 거래소가 Binance일 때 THEN 시스템은 `/fapi/v1/depth` 엔드포인트를 통해 오더북 데이터를 조회 SHALL 한다.
5. WHEN 거래소가 Bybit일 때 THEN 시스템은 `/v5/market/orderbook` 엔드포인트를 통해 오더북 데이터를 조회 SHALL 한다.
6. WHEN 코인 또는 거래소가 변경될 때 THEN 시스템은 새로운 오더북 데이터를 조회하여 갱신 SHALL 한다.
7. WHILE 선물 거래 페이지가 활성 상태인 동안 THEN 시스템은 오더북 데이터를 주기적으로(1~3초 간격) 갱신 SHALL 한다.

---

### 요구사항 6: 선물 주문창 (Coming Soon)

**User Story:** 사용자로서, 선물 주문 인터페이스의 미리보기를 확인하고 싶다. 그래야 향후 주문 기능이 추가될 때 어떤 형태인지 미리 알 수 있다.

#### 수용 기준

1. WHEN 코인과 거래소가 선택된 상태일 때 THEN 시스템은 화면 오른쪽 영역에 선물 주문창 UI를 표시 SHALL 한다.
2. WHEN 주문창이 표시될 때 THEN 시스템은 레버리지 설정, 롱/숏 방향 선택, 주문 유형(지정가/시장가), 가격 입력, 수량 입력, 마진 정보 필드를 포함 SHALL 한다.
3. WHEN 주문창이 표시될 때 THEN 시스템은 주문 실행 버튼 위에 "Coming Soon" 배지 또는 오버레이를 표시 SHALL 한다.
4. WHEN 사용자가 주문 실행 버튼을 클릭할 때 THEN 시스템은 "주문 기능은 추후 지원 예정입니다" 안내 메시지를 표시 SHALL 한다.
5. IF 사용자가 주문창의 입력 필드를 조작할 때 THEN 시스템은 UI 인터랙션(레버리지 슬라이더, 방향 토글 등)은 정상적으로 동작 SHALL 한다.

---

### 요구사항 7: 오픈 포지션 조회

**User Story:** 사용자로서, API Key가 연결된 모든 선물 거래소의 오픈 포지션을 한 곳에서 확인하고 싶다. 그래야 포트폴리오 전체의 선물 포지션을 종합적으로 관리할 수 있다.

#### 수용 기준

1. WHEN 선물 거래 페이지 하단의 "오픈 포지션" 탭이 선택되었을 때 THEN 시스템은 API Key가 연결된 모든 선물 거래소의 오픈 포지션을 테이블로 표시 SHALL 한다.
2. WHEN 오픈 포지션 테이블이 표시될 때 THEN 시스템은 다음 컬럼을 표시 SHALL 한다: 거래소, 심볼, 방향(Long/Short), 진입가, 현재가, 수량, 미실현 PnL, 레버리지, 청산가.
3. WHEN 포지션 방향이 Long일 때 THEN 시스템은 방향을 초록색으로 표시 SHALL 한다.
4. WHEN 포지션 방향이 Short일 때 THEN 시스템은 방향을 빨간색으로 표시 SHALL 한다.
5. WHEN 미실현 PnL이 양수일 때 THEN 시스템은 PnL 값을 초록색으로 표시 SHALL 한다.
6. WHEN 미실현 PnL이 음수일 때 THEN 시스템은 PnL 값을 빨간색으로 표시 SHALL 한다.
7. WHEN 거래소 필터가 제공될 때 THEN 시스템은 All, Binance, Bybit, OKX, Gate, Bitget 필터 옵션을 표시 SHALL 한다.
8. WHEN 사용자가 특정 거래소 필터를 선택할 때 THEN 시스템은 해당 거래소의 포지션만 필터링하여 표시 SHALL 한다.
9. WHEN 거래소가 Binance일 때 THEN 시스템은 `/fapi/v2/positionRisk` 엔드포인트를 통해 포지션 데이터를 조회 SHALL 한다.
10. WHEN 거래소가 Bybit일 때 THEN 시스템은 `/v5/position/list` 엔드포인트를 통해 포지션 데이터를 조회 SHALL 한다.
11. IF API Key가 연결된 선물 거래소가 없을 때 THEN 시스템은 "API Key를 연결하면 오픈 포지션을 조회할 수 있습니다" 안내 메시지를 표시 SHALL 한다.

---

### 요구사항 8: 오픈 오더 조회

**User Story:** 사용자로서, API Key가 연결된 모든 선물 거래소의 미체결 주문(오픈 오더)을 한 곳에서 확인하고 싶다. 그래야 대기 중인 주문 현황을 종합적으로 파악할 수 있다.

#### 수용 기준

1. WHEN 선물 거래 페이지 하단의 "오픈 오더" 탭이 선택되었을 때 THEN 시스템은 API Key가 연결된 모든 선물 거래소의 오픈 오더를 테이블로 표시 SHALL 한다.
2. WHEN 오픈 오더 테이블이 표시될 때 THEN 시스템은 다음 컬럼을 표시 SHALL 한다: 거래소, 심볼, 방향, 주문 유형(Limit/Market), 가격, 수량, 상태, 생성 시간.
3. WHEN 거래소 필터가 제공될 때 THEN 시스템은 오픈 포지션과 동일한 거래소 필터 옵션(All, Binance, Bybit, OKX, Gate, Bitget)을 표시 SHALL 한다.
4. WHEN 사용자가 특정 거래소 필터를 선택할 때 THEN 시스템은 해당 거래소의 오픈 오더만 필터링하여 표시 SHALL 한다.
5. WHEN 거래소가 Binance일 때 THEN 시스템은 `/fapi/v1/openOrders` 엔드포인트를 통해 오픈 오더 데이터를 조회 SHALL 한다.
6. WHEN 거래소가 Bybit일 때 THEN 시스템은 `/v5/order/realtime` 엔드포인트를 통해 오픈 오더 데이터를 조회 SHALL 한다.
7. IF API Key가 연결된 선물 거래소가 없을 때 THEN 시스템은 "API Key를 연결하면 오픈 오더를 조회할 수 있습니다" 안내 메시지를 표시 SHALL 한다.

---

### 요구사항 9: 선물 거래소 API 연동 (Route Handler)

**User Story:** 개발자로서, 선물 거래소 API를 안전하게 호출할 수 있는 Route Handler를 구축하고 싶다. 그래야 클라이언트의 서명된 요청을 거래소에 릴레이할 수 있다.

#### 수용 기준

1. WHEN 클라이언트가 선물 오더북 데이터를 요청할 때 THEN 시스템은 Next.js Route Handler를 통해 해당 거래소의 선물 오더북 API로 요청을 릴레이 SHALL 한다.
2. WHEN 클라이언트가 선물 포지션 데이터를 요청할 때 THEN 시스템은 클라이언트에서 생성한 서명을 포함하여 해당 거래소의 포지션 API로 요청을 릴레이 SHALL 한다.
3. WHEN 클라이언트가 선물 오픈 오더 데이터를 요청할 때 THEN 시스템은 클라이언트에서 생성한 서명을 포함하여 해당 거래소의 오픈 오더 API로 요청을 릴레이 SHALL 한다.
4. WHEN Route Handler가 요청을 릴레이할 때 THEN 시스템은 기존 proxy/relay 인프라를 재사용 SHALL 한다.
5. WHEN 클라이언트가 인증이 필요한 선물 API를 호출할 때 THEN 시스템은 기존 signer 모듈을 재사용하여 거래소별 서명을 생성 SHALL 한다.
6. IF 거래소 API 응답이 오류일 때 THEN 시스템은 적절한 HTTP 상태 코드와 에러 메시지를 클라이언트에 반환 SHALL 한다.

---

### 요구사항 10: 보안

**User Story:** 사용자로서, 선물 거래 기능에서도 기존과 동일한 수준의 보안을 보장받고 싶다. 그래야 API Key가 외부로 유출되는 걱정 없이 서비스를 사용할 수 있다.

#### 수용 기준

1. WHEN 선물 거래소 API를 호출할 때 THEN 시스템은 API Key를 브라우저 밖(서버, 외부)으로 절대 전송하지 않아야 SHALL 한다.
2. WHEN 인증이 필요한 선물 API 요청을 생성할 때 THEN 시스템은 클라이언트에서 거래소별 서명(HMAC-SHA256 등)을 생성 SHALL 한다.
3. WHEN 서명된 요청을 전송할 때 THEN 시스템은 Next.js Route Handler를 통해서만 거래소로 릴레이 SHALL 한다.
4. WHEN API Key가 저장될 때 THEN 시스템은 Web3 지갑 서명 기반 AES-256 암호화를 사용하여 localStorage에 저장 SHALL 한다.
5. WHEN 선물 데이터를 조회할 때 THEN 시스템은 지갑 주소별로 데이터를 분리하여 저장 및 표시 SHALL 한다.

---

### 요구사항 11: 거래소별 선물 심볼 매핑

**User Story:** 개발자로서, 거래소별로 다른 선물 심볼 포맷을 통일된 인터페이스로 관리하고 싶다. 그래야 코인 선택 시 올바른 거래소 API 파라미터를 자동으로 생성할 수 있다.

#### 수용 기준

1. WHEN 사용자가 코인을 선택할 때 THEN 시스템은 각 거래소의 선물 심볼 포맷에 맞게 심볼을 변환 SHALL 한다.
2. WHEN 거래소가 Binance일 때 THEN 시스템은 심볼을 `BTCUSDT` 형식으로 매핑 SHALL 한다.
3. WHEN 거래소가 Bybit일 때 THEN 시스템은 심볼을 `BTCUSDT` 형식으로 매핑 SHALL 한다.
4. WHEN 거래소가 OKX일 때 THEN 시스템은 심볼을 `BTC-USDT-SWAP` 형식으로 매핑 SHALL 한다.
5. WHEN 거래소가 Gate일 때 THEN 시스템은 심볼을 `BTC_USDT` 형식으로 매핑 SHALL 한다.
6. WHEN 거래소가 Bitget일 때 THEN 시스템은 심볼을 `BTCUSDT` 형식으로 매핑 SHALL 한다.
7. WHEN 심볼 매핑 정보가 정의될 때 THEN 시스템은 `packages/shared`에 공유 타입 및 매핑 유틸리티를 위치 SHALL 한다.

---

### 요구사항 12: 반응형 레이아웃 및 UX

**User Story:** 사용자로서, 다양한 화면 크기에서 선물 거래 페이지를 편리하게 사용하고 싶다. 그래야 데스크탑뿐 아니라 다양한 환경에서도 불편 없이 정보를 확인할 수 있다.

#### 수용 기준

1. WHEN 데스크탑 화면(1280px 이상)에서 표시될 때 THEN 시스템은 차트, 오더북, 주문창을 3열 레이아웃으로 나란히 표시 SHALL 한다.
2. WHEN 태블릿 화면(768px~1279px)에서 표시될 때 THEN 시스템은 차트를 전체 너비로, 오더북과 주문창을 2열로 표시 SHALL 한다.
3. WHEN 모바일 화면(767px 이하)에서 표시될 때 THEN 시스템은 차트, 오더북, 주문창을 수직으로 쌓아 표시 SHALL 한다.
4. WHEN 하단 오픈 포지션/오더 테이블이 표시될 때 THEN 시스템은 수평 스크롤을 지원하여 모든 컬럼을 확인할 수 있도록 SHALL 한다.
5. WHEN 페이지 로딩 중일 때 THEN 시스템은 각 섹션(차트, 오더북, 포지션 등)에 스켈레톤 로딩 UI를 표시 SHALL 한다.
6. WHEN 데이터 조회 중 오류가 발생할 때 THEN 시스템은 해당 섹션에 에러 메시지와 재시도 버튼을 표시 SHALL 한다.

---

## 비기능 요구사항

### NFR-1: 성능

1. WHEN 오더북 데이터를 갱신할 때 THEN 시스템은 1~3초 이내의 주기로 업데이트를 완료 SHALL 한다.
2. WHEN 거래소를 전환할 때 THEN 시스템은 2초 이내에 새 거래소의 데이터를 로드 SHALL 한다.
3. WHEN 오픈 포지션/오더를 조회할 때 THEN 시스템은 모든 연결된 거래소의 데이터를 병렬로 조회 SHALL 한다.

### NFR-2: 확장성

1. WHEN 새로운 선물 거래소를 추가할 때 THEN 시스템은 거래소별 설정(심볼 매핑, API 엔드포인트, 서명 방식)만 추가하면 지원 가능하도록 설계 SHALL 한다.
2. WHEN 향후 주문 기능을 구현할 때 THEN 시스템은 기존 주문창 UI와 인프라를 확장하여 실제 주문을 처리할 수 있도록 설계 SHALL 한다.

### NFR-3: 코드 재사용

1. WHEN 선물 거래 기능을 구현할 때 THEN 시스템은 기존 TradingView 차트 위젯 컴포넌트를 재사용 SHALL 한다.
2. WHEN 선물 거래 기능을 구현할 때 THEN 시스템은 기존 signer 모듈 및 proxy/relay 인프라를 재사용 SHALL 한다.
3. WHEN 선물 거래 기능의 공유 타입을 정의할 때 THEN 시스템은 `packages/shared` 패키지에 위치 SHALL 한다.

### NFR-4: 접근성

1. WHEN 오더북의 색상(빨간/초록)으로 정보를 구분할 때 THEN 시스템은 색상 외에 텍스트 레이블(Long/Short, +/-)로도 방향을 구분할 수 있도록 SHALL 한다.

---

## 범위 외 (Out of Scope)

- 실제 선물 주문 실행 기능 (Coming Soon으로 UI만 제공)
- 국내 거래소(업비트, 빗썸, 코인원)의 선물 지원
- 선물 거래 히스토리(체결 내역) 조회
- 마진 계산기 등 부가 도구
- 선물 포지션 알림/알람 기능

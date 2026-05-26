# 요구사항 문서: 선물 포지션 및 오픈오더 조회

## 소개

BitScope 선물 거래 페이지에서 사용자의 오픈 포지션과 오픈 오더를 실시간으로 조회하는 기능을 구현한다. 현재 UI 컴포넌트(테이블, 필터)와 타입 정의는 이미 완성되어 있으며, 훅(`useFuturesPositions`, `useFuturesOpenOrders`)이 placeholder로 빈 배열을 반환하는 상태이다. 이 기능은 Next.js Route Handler를 통한 서명된 요청 릴레이 패턴(기존 현물 API와 동일)을 따르며, Binance, Gate.io, Bitget 3개 거래소의 선물 포지션/오픈오더 API를 지원한다.

핵심 원칙:
- API Key 원문은 절대 서버로 전송하지 않음 (클라이언트 서명 + Route Handler 릴레이)
- 각 거래소의 상이한 응답 형식을 통일된 내부 모델(`FuturesPosition`, `FuturesOpenOrder`)로 정규화
- 한 거래소 실패가 다른 거래소 조회에 영향을 주지 않는 독립적 에러 처리

## 요구사항

### 요구사항 1: 선물 포지션 조회 Route Handler

**User Story:** 사용자로서, 나는 Binance/Gate.io/Bitget에서 내 선물 오픈 포지션을 조회하고 싶다. 그래야 각 거래소의 포지션 현황을 한 곳에서 통합 확인할 수 있다.

#### 수용 기준

1. WHEN 클라이언트가 `/api/exchange/[exchange]/futures-positions`에 POST 요청을 보내면 THEN 시스템 SHALL 서명된 요청(SignedRequest)을 파싱하여 해당 거래소의 선물 포지션 API에 릴레이한다.
2. WHEN 거래소 파라미터가 `binance`, `gate`, `bitget` 중 하나가 아니면 THEN 시스템 SHALL HTTP 400 응답과 함께 `INVALID_EXCHANGE` 에러 코드를 반환한다.
3. WHEN 요청 본문에 `url`, `method`, `headers` 중 하나라도 누락되면 THEN 시스템 SHALL HTTP 400 응답과 함께 `INVALID_SIGNED_REQUEST` 에러 코드를 반환한다.
4. WHEN Binance 선물 포지션 API(`/fapi/v2/positionRisk`) 응답을 수신하면 THEN 시스템 SHALL 응답을 `FuturesPosition[]` 타입으로 정규화하여 반환한다.
5. WHEN Gate.io 선물 포지션 API(`/api/v4/futures/usdt/positions`) 응답을 수신하면 THEN 시스템 SHALL 응답을 `FuturesPosition[]` 타입으로 정규화하여 반환한다.
6. WHEN Bitget 선물 포지션 API(`/api/v2/mix/position/all-position`) 응답을 수신하면 THEN 시스템 SHALL 응답을 `FuturesPosition[]` 타입으로 정규화하여 반환한다.
7. WHEN 거래소 API가 에러를 반환하면 THEN 시스템 SHALL 원본 에러 정보를 포함한 오류 응답을 반환한다.
8. WHEN 정규화 과정에서 예외가 발생하면 THEN 시스템 SHALL HTTP 500 응답과 함께 `NORMALIZATION_ERROR` 에러 코드를 반환한다.
9. WHERE 정규화된 포지션 데이터에는 SHALL `exchange`, `symbol`, `side`(LONG/SHORT), `entryPrice`, `markPrice`, `quantity`, `unrealizedPnl`, `leverage`, `liquidationPrice`, `marginType`, `timestamp` 필드가 포함되어야 한다.
10. WHEN 포지션 수량이 0인 항목이 거래소 응답에 포함되면 THEN 시스템 SHALL 해당 항목을 필터링하여 제외한다 (실제 오픈 포지션만 반환).

### 요구사항 2: 선물 오픈오더 조회 Route Handler

**User Story:** 사용자로서, 나는 Binance/Gate.io/Bitget에서 내 선물 오픈 오더(미체결 주문)를 조회하고 싶다. 그래야 현재 대기 중인 주문을 통합 관리할 수 있다.

#### 수용 기준

1. WHEN 클라이언트가 `/api/exchange/[exchange]/futures-open-orders`에 POST 요청을 보내면 THEN 시스템 SHALL 서명된 요청(SignedRequest)을 파싱하여 해당 거래소의 선물 오픈오더 API에 릴레이한다.
2. WHEN 거래소 파라미터가 `binance`, `gate`, `bitget` 중 하나가 아니면 THEN 시스템 SHALL HTTP 400 응답과 함께 `INVALID_EXCHANGE` 에러 코드를 반환한다.
3. WHEN 요청 본문에 `url`, `method`, `headers` 중 하나라도 누락되면 THEN 시스템 SHALL HTTP 400 응답과 함께 `INVALID_SIGNED_REQUEST` 에러 코드를 반환한다.
4. WHEN Binance 선물 오픈오더 API(`/fapi/v1/openOrders`) 응답을 수신하면 THEN 시스템 SHALL 응답을 `FuturesOpenOrder[]` 타입으로 정규화하여 반환한다.
5. WHEN Gate.io 선물 오픈오더 API(`/api/v4/futures/usdt/orders`) 응답을 수신하면 THEN 시스템 SHALL 응답을 `FuturesOpenOrder[]` 타입으로 정규화하여 반환한다.
6. WHEN Bitget 선물 오픈오더 API(`/api/v2/mix/order/orders-pending`) 응답을 수신하면 THEN 시스템 SHALL 응답을 `FuturesOpenOrder[]` 타입으로 정규화하여 반환한다.
7. WHEN 거래소 API가 에러를 반환하면 THEN 시스템 SHALL 원본 에러 정보를 포함한 오류 응답을 반환한다.
8. WHEN 정규화 과정에서 예외가 발생하면 THEN 시스템 SHALL HTTP 500 응답과 함께 `NORMALIZATION_ERROR` 에러 코드를 반환한다.
9. WHERE 정규화된 오픈오더 데이터에는 SHALL `exchange`, `orderId`, `symbol`, `side`(BUY/SELL), `positionSide`(LONG/SHORT), `orderType`, `price`, `quantity`, `status`, `createdAt` 필드가 포함되어야 한다.

### 요구사항 3: 거래소별 선물 포지션 응답 정규화

**User Story:** 개발자로서, 나는 Binance/Gate.io/Bitget의 서로 다른 선물 포지션 API 응답 형식을 통일된 `FuturesPosition` 타입으로 변환하고 싶다. 그래야 클라이언트 코드가 거래소별 차이를 의식하지 않고 동일한 인터페이스로 데이터를 처리할 수 있다.

#### 수용 기준

1. WHEN Binance 응답을 정규화할 때 THEN 시스템 SHALL `positionAmt`의 부호로 LONG/SHORT을 판별하고, `entryPrice`, `markPrice`, `unRealizedProfit`, `leverage`, `liquidationPrice`, `marginType` 필드를 매핑한다.
2. WHEN Gate.io 응답을 정규화할 때 THEN 시스템 SHALL `size`의 부호로 LONG/SHORT을 판별하고, `entry_price`, `mark_price`, `unrealised_pnl`, `leverage`, `liq_price`, `mode` 필드를 매핑한다.
3. WHEN Bitget 응답을 정규화할 때 THEN 시스템 SHALL `holdSide` 필드로 LONG/SHORT을 판별하고, `openPriceAvg`, `markPrice`, `unrealizedPL`, `leverage`, `liquidationPrice`, `marginMode` 필드를 매핑한다.
4. WHERE 각 거래소 정규화 함수는 SHALL `normalizeFuturesPositions` 디스패처 함수를 통해 호출되어야 한다.
5. WHEN 거래소 응답의 숫자 필드가 문자열 형태인 경우 THEN 시스템 SHALL `parseFloat`를 사용하여 숫자로 변환한다.
6. WHEN 변환된 숫자가 `NaN`이면 THEN 시스템 SHALL 해당 필드를 0으로 설정한다.

### 요구사항 4: 거래소별 선물 오픈오더 응답 정규화

**User Story:** 개발자로서, 나는 Binance/Gate.io/Bitget의 서로 다른 선물 오픈오더 API 응답 형식을 통일된 `FuturesOpenOrder` 타입으로 변환하고 싶다. 그래야 클라이언트 코드가 거래소별 차이를 의식하지 않고 동일한 인터페이스로 데이터를 처리할 수 있다.

#### 수용 기준

1. WHEN Binance 응답을 정규화할 때 THEN 시스템 SHALL `orderId`, `symbol`, `side`, `positionSide`, `type`, `price`, `origQty`, `status`, `time` 필드를 매핑한다.
2. WHEN Gate.io 응답을 정규화할 때 THEN 시스템 SHALL `id`, `contract`, `size`의 부호로 BUY/SELL을 판별하고, `price`, `left`(잔량), `status`, `create_time` 필드를 매핑한다.
3. WHEN Bitget 응답을 정규화할 때 THEN 시스템 SHALL `orderId`, `symbol`, `side`, `tradeSide`, `orderType`, `price`, `size`, `status`, `cTime` 필드를 매핑한다.
4. WHERE 각 거래소 정규화 함수는 SHALL `normalizeFuturesOpenOrders` 디스패처 함수를 통해 호출되어야 한다.
5. WHEN 거래소 응답의 숫자 필드가 문자열 형태인 경우 THEN 시스템 SHALL `parseFloat`를 사용하여 숫자로 변환한다.
6. WHEN 거래소 응답의 타임스탬프가 초 단위인 경우 THEN 시스템 SHALL 밀리초 단위로 변환한다 (Gate.io의 경우 해당).

### 요구사항 5: useFuturesPositions 훅 구현

**User Story:** 사용자로서, 나는 선물 거래 페이지에 접속하면 등록된 모든 거래소의 포지션이 자동으로 조회되어 통합 테이블에 표시되길 원한다. 그래야 여러 거래소를 개별적으로 확인할 필요 없이 한 눈에 포지션 현황을 파악할 수 있다.

#### 수용 기준

1. WHEN 선물 거래 페이지가 로드되면 THEN 시스템 SHALL API Key가 등록된 모든 선물 거래소에 대해 병렬로 포지션 조회 요청을 보낸다.
2. WHEN 특정 거래소에 API Key가 등록되지 않았으면 THEN 시스템 SHALL 해당 거래소는 건너뛰고 다른 거래소만 조회한다.
3. WHEN 포지션 조회에 성공하면 THEN 시스템 SHALL 모든 거래소의 포지션을 하나의 배열로 합쳐서 반환한다.
4. WHEN 특정 거래소 조회가 실패하면 THEN 시스템 SHALL 해당 거래소의 에러를 `errors` 맵에 기록하되, 다른 거래소의 결과는 정상적으로 반환한다.
5. WHILE 포지션을 조회하는 중에는 THEN 시스템 SHALL `isLoading`을 `true`로 설정한다.
6. WHEN 사용자가 `refetchAll`을 호출하면 THEN 시스템 SHALL 모든 거래소의 포지션을 다시 조회한다.
7. WHEN 포지션을 조회할 때 THEN 시스템 SHALL 클라이언트에서 거래소별 서명을 생성하고 서명된 요청을 Route Handler에 전달한다.
8. WHERE 포지션 조회 주기는 SHALL 30초 간격으로 자동 갱신되어야 한다.
9. WHERE 포지션 조회 결과는 SHALL TanStack Query 캐시를 통해 관리되어야 한다.

### 요구사항 6: useFuturesOpenOrders 훅 구현

**User Story:** 사용자로서, 나는 선물 거래 페이지에서 등록된 모든 거래소의 미체결 주문이 자동으로 조회되어 통합 테이블에 표시되길 원한다. 그래야 현재 대기 중인 주문을 한 곳에서 관리할 수 있다.

#### 수용 기준

1. WHEN 선물 거래 페이지가 로드되면 THEN 시스템 SHALL API Key가 등록된 모든 선물 거래소에 대해 병렬로 오픈오더 조회 요청을 보낸다.
2. WHEN 특정 거래소에 API Key가 등록되지 않았으면 THEN 시스템 SHALL 해당 거래소는 건너뛰고 다른 거래소만 조회한다.
3. WHEN 오픈오더 조회에 성공하면 THEN 시스템 SHALL 모든 거래소의 오픈오더를 하나의 배열로 합쳐서 반환한다.
4. WHEN 특정 거래소 조회가 실패하면 THEN 시스템 SHALL 해당 거래소의 에러를 `errors` 맵에 기록하되, 다른 거래소의 결과는 정상적으로 반환한다.
5. WHILE 오픈오더를 조회하는 중에는 THEN 시스템 SHALL `isLoading`을 `true`로 설정한다.
6. WHEN 사용자가 `refetchAll`을 호출하면 THEN 시스템 SHALL 모든 거래소의 오픈오더를 다시 조회한다.
7. WHEN 오픈오더를 조회할 때 THEN 시스템 SHALL 클라이언트에서 거래소별 서명을 생성하고 서명된 요청을 Route Handler에 전달한다.
8. WHERE 오픈오더 조회 주기는 SHALL 30초 간격으로 자동 갱신되어야 한다.
9. WHERE 오픈오더 조회 결과는 SHALL TanStack Query 캐시를 통해 관리되어야 한다.

### 요구사항 7: 빈 상태 메시지 분기 처리

**User Story:** 사용자로서, 나는 포지션/오더 테이블이 비어있을 때 그 이유를 정확히 알고 싶다. 그래야 API Key를 등록해야 하는지, 아니면 실제로 포지션이 없는 것인지 구분할 수 있다.

#### 수용 기준

1. WHEN 등록된 선물 거래소 API Key가 하나도 없으면 THEN 시스템 SHALL "API Key를 등록하면 포지션을 조회할 수 있습니다" 메시지를 표시한다.
2. WHEN API Key가 등록되어 있으나 조회된 포지션이 없으면 THEN 시스템 SHALL "오픈 포지션이 없습니다" 메시지를 표시한다.
3. WHEN API Key가 등록되어 있으나 조회된 오픈오더가 없으면 THEN 시스템 SHALL "오픈 오더가 없습니다" 메시지를 표시한다.
4. WHILE 포지션/오더를 조회하는 중에는 THEN 시스템 SHALL 로딩 상태를 표시한다.
5. WHEN 특정 거래소에서 에러가 발생하면 THEN 시스템 SHALL 해당 거래소의 에러를 사용자에게 알린다 (다른 거래소 결과는 정상 표시).

### 요구사항 8: 보안 요구사항

**User Story:** 사용자로서, 나는 내 거래소 API Key가 안전하게 보호되기를 원한다. 그래야 악의적인 서버나 제3자가 내 API Key에 접근할 수 없다.

#### 수용 기준

1. WHERE 선물 포지션/오픈오더 조회 과정에서 API Key 원문은 SHALL 절대 서버(Route Handler)로 전송되지 않아야 한다.
2. WHEN 클라이언트가 선물 API 요청을 생성할 때 THEN 시스템 SHALL 클라이언트 측에서 거래소별 서명(HMAC 등)을 생성한 후, 서명된 헤더만 Route Handler에 전달한다.
3. WHERE Route Handler는 SHALL 서명된 요청을 거래소 API에 그대로 릴레이하는 프록시 역할만 수행해야 한다.
4. WHERE 요청 본문(SignedRequest)에는 SHALL `url`, `method`, `headers` 필드만 포함되어야 하며, API Key/Secret 원문은 포함되지 않아야 한다.
5. WHEN Route Handler가 요청을 수신할 때 THEN 시스템 SHALL SignedRequest의 필수 필드(`url`, `method`, `headers`)가 모두 존재하는지 검증한다.

### 요구사항 9: 비기능 요구사항

**User Story:** 사용자로서, 나는 포지션/오더 조회가 빠르고 안정적으로 동작하길 원한다. 그래야 거래 결정에 필요한 정보를 지연 없이 확인할 수 있다.

#### 수용 기준

1. WHERE 거래소 API 릴레이 요청의 타임아웃은 SHALL 10초로 설정되어야 한다.
2. WHERE 포지션/오픈오더 조회 실패 시 SHALL 최대 2회 재시도를 수행해야 한다 (지수 백오프).
3. WHERE 거래소별 Rate Limit은 SHALL 기존 토큰 버킷 기반 제한을 따라야 한다.
4. WHERE 인메모리 캐시 TTL은 SHALL 10초로 설정되어야 한다.
5. WHERE 포지션/오픈오더 자동 갱신 주기는 SHALL 30초로 설정되어야 한다.
6. WHEN 한 거래소 API가 실패하더라도 THEN 시스템 SHALL 다른 거래소의 조회 결과에는 영향을 주지 않아야 한다 (독립적 에러 처리).
7. WHERE 기존 `relayRequest` 프록시 유틸리티와 `EXCHANGE_ENDPOINTS` 상수를 SHALL 재사용해야 한다.
8. WHERE 정규화 함수는 SHALL 기존 normalizer 모듈 구조(`apps/web/app/api/exchange/_lib/normalizer/`)에 추가되어야 한다.

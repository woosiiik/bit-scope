# Requirements Document: LBank 거래소 통합

## Introduction

BitScope 프로젝트에 LBank 암호화폐 거래소를 10번째 지원 거래소로 추가한다. LBank는 USDT 기반 해외 중앙화 거래소(CEX)로 분류되며, 기존 해외 거래소(바이낸스, 바이빗, OKX, Gate.io, Bitget)와 동일한 통합 패턴을 따른다.

현물(Spot) 거래를 완전히 지원하고, 선물(Futures/Perps)은 `perps:` 접두사로 USD 가치만 표시하며 포지션 상세는 제외한다. LBank의 인증 방식은 HmacSHA256(Secret Key 32자 이하) 또는 RSA(32자 초과)이며, 모든 Private API 요청은 POST + `application/x-www-form-urlencoded` 형식을 사용한다.

## Requirements

### Requirement 1: ExchangeType 및 거래소 설정 등록

**User Story:** 개발자로서, LBank을 ExchangeType 유니온 타입과 거래소 설정에 등록하여, 기존 거래소 인프라(팩토리, 레지스트리, 맵)에서 LBank를 자연스럽게 인식하고 처리할 수 있게 한다.

#### Acceptance Criteria

1. WHEN LBank 거래소가 추가되면 ExchangeType 유니온 타입에 `'lbank'`이 포함되어야 하며, 시스템 전체에서 타입 안전하게 참조될 SHALL 수 있어야 한다.
2. WHEN LBank 설정이 등록되면 `LBANK_CONFIG` 객체는 다음 값을 포함 SHALL 한다:
   - id: `'lbank'`
   - nameKo: `'엘뱅크'`
   - nameEn: `'LBank'`
   - restBaseUrl: `'https://api.lbank.info'`
   - futuresBaseUrl: `'https://lbkperp.lbank.com'`
   - wsUrl: `undefined` (REST 폴링 방식 사용)
   - rateLimit: `{ requestsPerSecond: 20, requestsPerMinute: 1200 }`
   - timeoutMs: `10000`
3. WHEN LBank 엔드포인트가 등록되면 `LBANK_ENDPOINTS` 객체는 다음 경로를 포함 SHALL 한다:
   - balance: `/v2/supplement/user_info.do`
   - ticker: `/v2/ticker/24hr.do`
   - orderbook: `/v2/depth.do`
   - orders: `/v2/supplement/orders_info_history.do`
   - markets: `/v2/currencyPairs.do`
   - futures: `/cfd/openApi/v1/pub/marketData` (선물 시세 조회용)
4. WHEN LBank이 추가되면 `EXCHANGE_CONFIGS`, `EXCHANGE_ENDPOINTS`, `SUPPORTED_EXCHANGES`, `FOREIGN_EXCHANGES` 맵/배열에 `'lbank'`이 등록 SHALL 되어야 한다.

### Requirement 2: 클라이언트 사이드 서명 모듈 (LBank Signer)

**User Story:** 사용자로서, 내 LBank API Key가 브라우저 밖으로 절대 전송되지 않으면서도 거래소 API에 정상적으로 인증된 요청을 보낼 수 있어야 한다.

#### Acceptance Criteria

1. WHEN 사용자의 Secret Key가 32자 이하이면 시스템은 HmacSHA256 서명 방식을 사용 SHALL 한다.
2. WHEN 사용자의 Secret Key가 32자를 초과하면 시스템은 RSA 서명 방식을 사용 SHALL 한다.
3. WHEN HmacSHA256 서명을 생성할 때 시스템은 다음 단계를 순차적으로 수행 SHALL 한다:
   - 요청 파라미터에 `api_key` 추가
   - `timestamp` (밀리초), `echostr` (30~40자 랜덤 문자열), `signature_method` 생성
   - 모든 파라미터를 알파벳순(ASCII) 정렬 후 URL 인코딩하여 쿼리스트링 형태로 결합
   - 결합된 문자열을 MD5 해시 후 대문자로 변환
   - MD5 해시 결과를 Secret Key로 HMAC-SHA256 서명
4. WHEN 서명된 요청이 생성되면 Body는 원래 파라미터 + `sign` 필드를 URL 인코딩된 형태로 포함 SHALL 하며, Headers에는 `Content-Type: application/x-www-form-urlencoded`, `timestamp`, `signature_method`, `echostr`이 포함 SHALL 되어야 한다.
5. WHEN 모든 Private API 요청이 전송될 때 HTTP 메서드는 POST SHALL 이어야 한다.
6. WHEN LBank Signer가 생성되면 `ExchangeSigner` 인터페이스(`signRequest`, `validateApiKey`, `getExchangeType`)를 구현 SHALL 해야 하며, Signer Factory(`signerRegistry`)에 `'lbank'`으로 등록 SHALL 되어야 한다.
7. WHEN `validateApiKey`가 호출되면 시스템은 잔고 조회 API를 호출하여 API Key의 유효성을 검증하고 `ApiKeyValidationResult`를 반환 SHALL 한다.

### Requirement 3: 응답 정규화 (Response Normalizer)

**User Story:** 사용자로서, LBank의 API 응답 형식에 관계없이 다른 거래소와 동일한 UI 형태로 데이터를 확인할 수 있어야 한다.

#### Acceptance Criteria

1. WHEN LBank 잔고 응답(`/v2/supplement/user_info.do`)이 수신되면 시스템은 이를 `NormalizedBalance` 형태로 변환 SHALL 하며, 각 보유 코인의 심볼, 수량, 평가 금액이 포함 SHALL 되어야 한다.
2. WHEN LBank 시세 응답(`/v2/ticker/24hr.do`)이 수신되면 시스템은 이를 `NormalizedTicker` 형태로 변환 SHALL 하며, 현재가, 24시간 변동률, 거래량이 포함 SHALL 되어야 한다.
3. WHEN LBank 호가 응답(`/v2/depth.do`)이 수신되면 시스템은 이를 `NormalizedOrderbook` 형태로 변환 SHALL 하며, 매수/매도 호가 목록이 포함 SHALL 되어야 한다.
4. WHEN LBank 주문 내역 응답(`/v2/supplement/orders_info_history.do`)이 수신되면 시스템은 이를 `NormalizedOrderHistory` 형태로 변환 SHALL 하며, 주문 ID, 심볼, 주문 유형(매수/매도), 가격, 수량, 체결 수량, 상태, 주문 시각이 포함 SHALL 되어야 한다.
5. WHEN LBank의 거래쌍 형식(`eth_usdt`)이 정규화될 때 시스템은 소문자 + 언더스코어 형식을 대문자 심볼로 변환(예: `eth_usdt` → `ETH`) SHALL 한다.
6. WHEN LBank이 `normalizeBalance`, `normalizeTicker`, `normalizeOrderbook`, `normalizeOrderHistory` 디스패처 함수의 switch-case에 등록되면 `'lbank'` 케이스가 추가 SHALL 되어야 한다.

### Requirement 4: 선물(Futures/Perps) 잔고 지원

**User Story:** 사용자로서, LBank 선물 계좌의 총 자산 가치를 포트폴리오에서 확인할 수 있어야 한다. (포지션 상세는 불필요)

#### Acceptance Criteria

1. WHEN LBank 선물 잔고가 조회되면 시스템은 `perps:` 접두사로 USD 가치만 표시 SHALL 하며, 개별 포지션 상세(레버리지, 진입가, 청산가 등)는 표시하지 않 SHALL 아야 한다.
2. WHEN `normalizeFuturesBalance` 디스패처 함수에서 `'lbank'` 케이스가 호출되면 시스템은 LBank 선물 API 응답에서 USDT 합계를 추출하여 반환 SHALL 한다.
3. WHEN LBank 선물 시세가 조회될 때 Futures Base URL(`https://lbkperp.lbank.com`)을 사용 SHALL 한다.

### Requirement 5: 실시간 시세 폴링 클라이언트

**User Story:** 사용자로서, LBank에 상장된 코인의 실시간 시세를 다른 해외 거래소와 동일한 방식으로 확인할 수 있어야 한다.

#### Acceptance Criteria

1. WHEN LBank 실시간 시세 클라이언트가 생성되면 `BaseExchangeClient`를 확장한 REST 폴링 클라이언트 SHALL 이어야 한다.
2. WHEN 시세 폴링이 실행되면 시스템은 LBank 공개 시세 API(`GET /v2/ticker/24hr.do`)를 주기적으로 호출하여 가격 데이터를 갱신 SHALL 한다.
3. WHEN 폴링 간격이 설정될 때 기존 해외 거래소 폴링 클라이언트(예: 바이낸스 5초)와 동일한 수준의 간격을 사용 SHALL 한다.
4. WHEN 시세 데이터가 수신되면 시스템은 거래쌍 형식(`eth_usdt`)을 내부 심볼 형식으로 변환하여 가격 맵에 저장 SHALL 한다.
5. WHEN 시세 폴링 클라이언트가 `exchange-ws/index.ts` 배럴 파일에서 export SHALL 되어야 한다.

### Requirement 6: API Key 등록 및 관리 (설정 페이지)

**User Story:** 사용자로서, 설정 페이지에서 LBank API Key(Access Key + Secret Key)를 안전하게 등록, 수정, 삭제할 수 있어야 한다.

#### Acceptance Criteria

1. WHEN 사용자가 설정 페이지에서 LBank 거래소를 선택하면 시스템은 Access Key와 Secret Key 두 개의 입력 필드를 표시 SHALL 한다. (Passphrase 필드는 불필요)
2. WHEN 사용자가 API Key를 저장하면 시스템은 Web3 지갑 서명 기반 AES-256 암호화를 적용하여 localStorage에 저장 SHALL 한다.
3. WHEN API Key가 저장될 때 데이터는 지갑 주소별로 분리 저장(`bitscope:{addr}:lbank`) SHALL 되어야 한다.
4. WHEN 사용자가 API Key를 등록하면 시스템은 `validateApiKey`를 호출하여 키의 유효성을 실시간 검증하고 결과를 피드백 SHALL 한다.
5. IF API Key 검증이 실패하면 시스템은 오류 코드(`INVALID_KEY`, `INSUFFICIENT_PERMISSION`, `NETWORK_ERROR`)에 따른 적절한 오류 메시지를 표시 SHALL 한다.

### Requirement 7: 잔고 조회 및 포트폴리오 표시

**User Story:** 사용자로서, LBank에 보유한 현물 자산을 BitScope 대시보드에서 다른 거래소와 통합하여 확인할 수 있어야 한다.

#### Acceptance Criteria

1. WHEN 사용자가 대시보드에 접속하면 시스템은 LBank 잔고를 다른 등록된 거래소와 함께 조회하여 통합 포트폴리오로 표시 SHALL 한다.
2. WHEN LBank 잔고가 표시될 때 USDT 기준 잔고를 KRW로 환산하여 표시 SHALL 한다.
3. WHEN LBank 잔고가 조회될 때 Spot 자산의 USDT 환산 합계를 `WalletSummary`에 포함 SHALL 한다.
4. IF LBank 선물 잔고가 존재하면 시스템은 `perps:` 접두사와 함께 USD 가치를 포트폴리오에 추가 표시 SHALL 한다.

### Requirement 8: 호가창(Orderbook) 조회

**User Story:** 사용자로서, LBank에 상장된 코인의 매수/매도 호가를 실시간으로 확인할 수 있어야 한다.

#### Acceptance Criteria

1. WHEN 사용자가 LBank 코인의 호가창을 요청하면 시스템은 `/v2/depth.do` 엔드포인트를 호출하여 매수/매도 호가 데이터를 조회 SHALL 한다.
2. WHEN 호가 데이터가 표시될 때 다른 거래소와 동일한 정규화된 형태(`NormalizedOrderbook`)로 변환되어 표시 SHALL 한다.

### Requirement 9: 주문 내역 조회

**User Story:** 사용자로서, LBank에서의 과거 주문 내역을 확인할 수 있어야 한다.

#### Acceptance Criteria

1. WHEN 사용자가 LBank 주문 내역을 요청하면 시스템은 `/v2/supplement/orders_info_history.do` 엔드포인트를 호출하여 주문 내역을 조회 SHALL 한다.
2. WHEN 주문 내역이 표시될 때 다른 거래소와 동일한 정규화된 형태(`NormalizedOrderHistory`)로 변환되어 표시 SHALL 한다.
3. WHEN 주문 내역의 통화 단위가 표시될 때 `Currency`는 `'USDT'`로 설정 SHALL 한다.

### Requirement 10: 김치 프리미엄 비교 지원

**User Story:** 사용자로서, LBank의 USDT 시세를 국내 거래소 KRW 시세와 비교하여 김치 프리미엄을 확인할 수 있어야 한다.

#### Acceptance Criteria

1. WHEN LBank이 `FOREIGN_EXCHANGES` 배열에 등록되면 김치 프리미엄 계산 로직에서 LBank 시세가 비교 대상으로 포함 SHALL 되어야 한다.
2. WHEN 김치 프리미엄이 계산될 때 LBank의 USDT 시세를 USD/KRW 환율로 환산하여 국내 거래소 KRW 시세와 비교 SHALL 한다.

### Requirement 11: Next.js Route Handler 릴레이

**User Story:** 사용자로서, LBank API 요청이 CORS 문제 없이 브라우저에서 정상적으로 동작해야 한다.

#### Acceptance Criteria

1. WHEN 클라이언트에서 LBank API 요청이 발생하면 시스템은 Next.js Route Handler를 통해 서명된 요청을 LBank 서버로 릴레이 SHALL 한다.
2. WHEN Route Handler가 LBank 요청을 처리할 때 기존 거래소 Route Handler와 동일한 패턴(프록시/릴레이)을 따를 SHALL 한다.
3. WHEN LBank Private API 요청이 릴레이될 때 HTTP 메서드는 POST, Content-Type은 `application/x-www-form-urlencoded`로 전달 SHALL 한다.

## Non-Functional Requirements

### NFR 1: 보안

1. LBank API Key(Access Key, Secret Key)는 브라우저 밖(서버, 네트워크)으로 절대 전송되지 않 SHALL 아야 한다.
2. 모든 서명 연산은 클라이언트(브라우저)에서 수행 SHALL 되어야 한다.
3. API Key는 AES-256으로 암호화된 상태로만 localStorage에 저장 SHALL 되어야 한다.

### NFR 2: 성능

1. LBank API Rate Limit(일반 20req/s, 주문 50req/s)을 초과하지 않도록 요청 빈도를 제한 SHALL 해야 한다.
2. LBank API 요청의 타임아웃은 10초 이내로 설정 SHALL 한다.
3. 시세 폴링 간격은 5초 이내로 설정하여 합리적인 실시간성을 확보 SHALL 한다.

### NFR 3: 확장성

1. LBank Signer, Normalizer, Polling Client는 기존 어댑터 패턴을 따라 구현되어, 기존 코드 변경을 최소화 SHALL 해야 한다.
2. ExchangeType 유니온 타입 확장과 각 레지스트리/맵 등록만으로 기존 인프라에 통합 SHALL 되어야 한다.

### NFR 4: 호환성

1. LBank의 거래쌍 형식(`eth_usdt`, 소문자 + 언더스코어)과 내부 심볼 형식 간 양방향 변환이 정확하게 동작 SHALL 해야 한다.
2. LBank의 `application/x-www-form-urlencoded` POST 방식이 기존 JSON 기반 거래소 요청과 충돌 없이 처리 SHALL 되어야 한다.

### NFR 5: 에러 처리

1. WHEN LBank API가 오류 응답을 반환하면 시스템은 오류 코드와 메시지를 파싱하여 사용자에게 의미 있는 피드백을 제공 SHALL 한다.
2. WHEN LBank API 요청이 타임아웃되거나 네트워크 오류가 발생하면 시스템은 기존 재시도 설정(`RETRY_CONFIG`: 최대 3회, 지수 백오프)에 따라 재시도 SHALL 한다.
3. WHEN 서명 생성 과정에서 오류가 발생하면(예: 잘못된 Secret Key 길이) 시스템은 명확한 오류 메시지를 사용자에게 표시 SHALL 한다.

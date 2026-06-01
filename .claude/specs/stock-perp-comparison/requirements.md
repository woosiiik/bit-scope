# Requirements Document

## Introduction

본 기능은 BitScope 앱에 한국 주식의 실제 가격 차트와 해당 종목의 Hyperliquid 영구선물(perp) 차트를 **동일한 타임라인 위에 겹쳐서(overlay)** 보여주는 비교 뷰를 추가한다. 주식 가격은 KRW, perp 가격은 USD로 표기되므로 USD/KRW 환율을 적용하여 두 시계열을 공통 통화 축에서 비교 가능하게 정규화한다.

핵심 목적은 **24시간 거래되는 perp 시장이 거래 시간이 제한된 주식 시장과 어떻게 괴리되는지(야간, 주말, 휴장)** 를 시각적으로 드러내는 것이다. 따라서 주식 시장이 닫혀 있는 구간에서는 주식 라인이 끊기고(gap), perp 라인은 계속 이어지도록 하여 "24/7 vs 제한 시간" 괴리를 명확히 보여준다.

대상 종목은 다음 3개 페어로 한정한다.

| 종목 | 주식 심볼 (Yahoo) | Perp 코인 (Hyperliquid) |
|------|------------------|------------------------|
| 삼성전자 | `005930.KS` | `xyz:SMSN` |
| SK하이닉스 | `000660.KS` | `xyz:SKHX` |
| 현대차 | `005380.KS` | `xyz:HYUNDAI` |

데이터 소스:
- **주식/환율:** Yahoo Finance chart API (`query1.finance.yahoo.com/v8/finance/chart/...`), KRW 표기, 타임존 `Asia/Seoul`.
- **Perp:** Hyperliquid native API (`POST https://api.hyperliquid.xyz/info`, `type: candleSnapshot`), USD 표기, epoch ms UTC 타임스탬프.

주 사용 시간 단위는 **분봉(intraday minute candle)** 이며, 긴 기간 조회 시 일봉(daily)으로 폴백한다. 모든 외부 호출은 기존 앱 구조에 따라 Next.js Route Handler(CORS 프록시)를 경유한다.

**비목표(Non-goals):**
- 실시간 WebSocket 스트리밍은 본 기능의 필수 범위가 아니다(기존 폴링/요청 방식으로 충분).
- 매매/주문 등 거래 액션은 제공하지 않는다(조회 전용).
- 위 3개 페어 외의 종목 확장은 본 범위가 아니다.
- 기술적 지표(이동평균, RSI 등) 오버레이는 본 범위가 아니다.

## Requirements

### Requirement 1: 페어 선택

**User Story:** 사용자로서, 미리 정의된 주식-perp 페어를 선택하고 싶다. 그래야 비교하고 싶은 종목을 골라 차트를 볼 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 비교 뷰에 진입하면 THEN 시스템은 SHALL 삼성전자, SK하이닉스, 현대차 3개 페어를 선택 가능한 목록으로 표시한다.
2. WHEN 사용자가 특정 페어를 선택하면 THEN 시스템은 SHALL 해당 페어의 주식 심볼(예: `005930.KS`)과 perp 코인(예: `xyz:SMSN`)을 함께 사용하여 데이터를 조회한다.
3. WHEN 비교 뷰가 처음 로드되면 THEN 시스템은 SHALL 기본 페어 1개(삼성전자)를 자동 선택하여 차트를 표시한다.
4. WHERE 페어 선택 UI에서 시스템은 SHALL 각 페어를 한국어 종목명(예: "삼성전자")으로 표시한다.
5. WHEN 사용자가 페어를 변경하면 THEN 시스템은 SHALL 현재 선택된 시간 범위/간격 설정을 유지한 채 새 페어의 데이터를 다시 조회한다.

### Requirement 2: 주식 캔들 조회

**User Story:** 사용자로서, 선택한 종목의 실제 주식 가격 시계열을 보고 싶다. 그래야 실제 시장 가격과 perp를 비교할 수 있다.

#### Acceptance Criteria

1. WHEN 페어와 시간 범위가 결정되면 THEN 시스템은 SHALL Yahoo Finance chart API를 Route Handler 프록시를 통해 호출하여 주식 OHLCV 캔들을 조회한다.
2. WHEN Yahoo 응답을 수신하면 THEN 시스템은 SHALL `chart.result[0].timestamp`와 `chart.result[0].indicators.quote[0]`에서 시각/OHLCV를 추출하여 정규화된 캔들 배열로 변환한다.
3. WHEN 주식 캔들을 정규화하면 THEN 시스템은 SHALL `meta.currency`가 `KRW`이고 `meta.exchangeTimezoneName`이 `Asia/Seoul`임을 전제로 통화/타임존을 기록한다.
4. IF Yahoo 응답의 특정 시각에 OHLCV 값이 `null`(거래 없음/휴장)이면 THEN 시스템은 SHALL 해당 지점을 채워 넣지 않고(forward-fill 금지) 결측(gap)으로 유지한다.
5. WHEN 1분봉 데이터를 요청하지만 요청 범위가 Yahoo 분봉 이력 한계(1m ≈ 최근 7일)를 초과하면 THEN 시스템은 SHALL 더 거친 간격(5m ≈ 60일, 또는 1d)으로 자동 폴백한다.

### Requirement 3: Perp 캔들 조회

**User Story:** 사용자로서, 선택한 종목의 Hyperliquid perp 가격 시계열을 보고 싶다. 그래야 24시간 거래되는 perp 흐름을 확인할 수 있다.

#### Acceptance Criteria

1. WHEN 페어와 시간 범위가 결정되면 THEN 시스템은 SHALL `POST https://api.hyperliquid.xyz/info`에 `{"type":"candleSnapshot","req":{"coin":"<xyz:COIN>","interval":"<interval>","startTime":<ms>,"endTime":<ms>}}` 형태로 perp 캔들을 요청한다.
2. WHEN perp 캔들 응답을 수신하면 THEN 시스템은 SHALL `{t,T,s,i,o,c,h,l,v,n}` 필드에서 시각(epoch ms)과 OHLCV를 추출하여 정규화된 캔들 배열로 변환한다.
3. WHEN perp 캔들을 정규화하면 THEN 시스템은 SHALL 가격 통화를 USD로, 타임스탬프를 UTC epoch ms로 기록한다.
4. WHERE perp 요청에서 시스템은 SHALL 코인명에 `xyz:` 접두사를 사용하며, candleSnapshot에는 별도의 `dex` 파라미터를 추가하지 않는다.
5. WHEN perp 요청 간격(interval)을 결정할 때 THEN 시스템은 SHALL 주식 캔들에 사용한 간격과 동일하게 맞추어 두 시계열의 해상도를 정렬한다.

### Requirement 4: USD/KRW 환율 조회 및 통화 변환

**User Story:** 사용자로서, KRW 주식 가격과 USD perp 가격을 같은 통화 축에서 비교하고 싶다. 그래야 두 가격의 괴리를 정확히 읽을 수 있다.

#### Acceptance Criteria

1. WHEN 비교 데이터를 준비하면 THEN 시스템은 SHALL Yahoo Finance(`KRW=X`)에서 USD/KRW 환율 시계열을 Route Handler 프록시를 통해 조회한다.
2. WHEN 두 시계열을 공통 통화로 변환하면 THEN 시스템은 SHALL 하나의 통화를 기준으로 통일한다(주식 KRW → USD 변환, 또는 perp USD → KRW 변환 중 택일하여 일관되게 적용).
3. WHEN 통화 변환을 수행하면 THEN 시스템은 SHALL 단일 고정 환율이 아니라 각 캔들 시각에 시간 정합된(time-matched) 환율을 적용한다.
4. IF 특정 캔들 시각에 정확히 일치하는 환율 포인트가 없으면 THEN 시스템은 SHALL 해당 시각에 가장 가까운(직전) 환율 값을 사용한다.
5. WHEN 변환이 완료되면 THEN 시스템은 SHALL 변환에 사용된 기준 통화와 환율 정보를 사용자에게 표시(예: 축 라벨, 적용 환율 안내)한다.

### Requirement 5: 타임라인 정렬 (타임존 처리)

**User Story:** 사용자로서, 주식과 perp 가격을 동일한 시간축 위에서 보고 싶다. 그래야 같은 시점의 두 가격을 정확히 대조할 수 있다.

#### Acceptance Criteria

1. WHEN 주식 캔들 시각을 처리하면 THEN 시스템은 SHALL `Asia/Seoul` 기준 시각을 공통 비교를 위해 UTC epoch ms로 변환한다.
2. WHEN perp 캔들 시각을 처리하면 THEN 시스템은 SHALL UTC epoch ms를 그대로 공통 타임라인의 기준으로 사용한다.
3. WHEN 두 시계열을 병합하면 THEN 시스템은 SHALL 동일한 시각의 주식 값과 perp 값을 같은 타임라인 포인트에 매핑한다.
4. WHERE 차트의 시간축 라벨에서 시스템은 SHALL 사용자에게 한국 시간(KST, `Asia/Seoul`) 기준으로 시각을 표시한다.
5. WHEN 한쪽 시계열에만 데이터가 존재하는 시각(예: 주식 휴장 중 perp만 거래)을 처리하면 THEN 시스템은 SHALL 해당 시각을 타임라인에 유지하고 데이터가 없는 쪽은 결측으로 둔다.

### Requirement 6: 오버레이 차트 렌더링 (휴장 구간 갭 유지)

**User Story:** 사용자로서, 24시간 perp와 제한 시간 주식의 괴리를 한눈에 보고 싶다. 그래야 야간/주말/휴장 중 두 시장이 어떻게 벌어지는지 직관적으로 파악할 수 있다.

#### Acceptance Criteria

1. WHEN 비교 차트를 렌더링하면 THEN 시스템은 SHALL 주식 시계열과 perp 시계열을 동일한 차트 위에 두 개의 구분되는 라인으로 겹쳐 표시한다.
2. WHEN 주식 시장이 닫혀 있는 구간(야간/주말/휴장)을 렌더링하면 THEN 시스템은 SHALL 주식 라인을 끊어진 갭(gap)으로 표시하고 forward-fill로 평탄화하지 않는다.
3. WHEN 주식 시장 휴장 구간을 렌더링하면 THEN 시스템은 SHALL perp 라인을 끊김 없이 연속으로 표시한다.
4. WHEN 두 라인을 표시하면 THEN 시스템은 SHALL 색상/범례로 주식 라인과 perp 라인을 명확히 구분한다.
5. WHEN 사용자가 차트의 특정 시점에 호버(hover)하면 THEN 시스템은 SHALL 해당 시점의 주식 가격, perp 가격, 적용 환율, 두 값의 괴리(차이/비율)를 툴팁으로 표시한다.
6. WHERE 차트의 Y축에서 시스템은 SHALL 변환 후 공통 통화 단위를 명시한다.

### Requirement 7: 주식 개장/휴장 구간 시각 표시

**User Story:** 사용자로서, 차트에서 주식 시장이 열려 있던 구간과 닫혀 있던 구간을 구분해서 보고 싶다. 그래야 갭의 원인이 휴장 때문임을 즉시 이해할 수 있다.

#### Acceptance Criteria

1. WHEN 비교 차트를 렌더링하면 THEN 시스템은 SHALL 주식 시장 개장 구간과 휴장 구간을 시각적으로 구분(예: 배경 음영, 구간 표시)하여 표시한다.
2. WHEN 주식 데이터가 결측인 구간을 표시하면 THEN 시스템은 SHALL 해당 구간이 "주식 휴장"임을 나타내는 시각 단서를 제공한다.
3. IF 사용자가 휴장 구간 표시를 토글할 수 있는 옵션이 제공되면 THEN 시스템은 SHALL 토글 상태에 따라 휴장 음영의 표시/숨김을 전환한다.

### Requirement 8: 시간 범위 및 간격 선택

**User Story:** 사용자로서, 비교 차트의 기간과 캔들 간격을 조절하고 싶다. 그래야 단기 분봉 움직임과 장기 추세를 모두 확인할 수 있다.

#### Acceptance Criteria

1. WHEN 비교 뷰가 로드되면 THEN 시스템은 SHALL 기본값으로 분봉(intraday minute candle) 기준의 시간 범위를 적용한다.
2. WHEN 사용자가 시간 범위를 선택하면 THEN 시스템은 SHALL 선택된 범위에 맞는 캔들 간격을 결정하고 주식·perp·환율 데이터를 모두 동일 범위로 다시 조회한다.
3. WHEN 선택된 시간 범위가 Yahoo 분봉 이력 한계를 초과하면 THEN 시스템은 SHALL 일봉(1d) 등 더 거친 간격으로 자동 폴백하고 폴백되었음을 사용자에게 안내한다.
4. WHEN 분봉으로 조회 가능한 범위를 선택하면 THEN 시스템은 SHALL 주식과 perp의 캔들 간격을 동일하게 맞춘다.
5. WHERE 시간 범위/간격 선택 UI에서 시스템은 SHALL 분봉이 기본이고 긴 범위에서는 일봉으로 전환된다는 점을 사용자가 이해할 수 있도록 옵션을 제시한다.

### Requirement 9: 로딩/에러/빈 상태 처리

**User Story:** 사용자로서, 데이터 조회가 실패하거나 비어 있을 때 명확한 상태 안내를 받고 싶다. 그래야 빈 화면 앞에서 혼란스럽지 않다.

#### Acceptance Criteria

1. WHILE 주식·perp·환율 데이터를 조회하는 동안 시스템은 SHALL 로딩 상태(스피너/스켈레톤 등)를 표시한다.
2. IF Yahoo Finance 호출이 throttle(예: 429)되거나 실패하면 THEN 시스템은 SHALL 주식 데이터 조회 실패 상태와 재시도 수단을 사용자에게 표시한다.
3. IF 선택한 perp 코인에 해당하는 캔들이 존재하지 않거나 빈 배열이 반환되면 THEN 시스템은 SHALL "perp 데이터 없음" 상태를 표시하고 가능한 경우 주식 라인만 단독으로 렌더링한다.
4. IF 환율 데이터 조회에 실패하면 THEN 시스템은 SHALL 통화 변환이 불가함을 알리고 비교 차트 대신 명확한 오류 안내를 표시한다.
5. WHEN 한쪽 시계열만 사용 가능하면 THEN 시스템은 SHALL 사용 가능한 데이터만으로 부분 렌더링하고 어떤 데이터가 누락되었는지 명시한다.
6. WHEN 조회된 모든 데이터가 비어 있으면 THEN 시스템은 SHALL 빈 상태(empty state) 안내를 표시한다.

### Requirement 10: 비기능 요구사항

**User Story:** 사용자로서, 비교 뷰가 빠르고 일관되며 기존 앱과 자연스럽게 통합되기를 바란다. 그래야 쾌적하게 사용할 수 있다.

#### Acceptance Criteria

1. WHERE 모든 외부 API(Yahoo, Hyperliquid) 호출에서 시스템은 SHALL 기존 앱 구조에 따라 Next.js Route Handler(CORS 프록시)를 경유한다.
2. WHEN UI 텍스트를 표시하면 THEN 시스템은 SHALL 모든 라벨/안내/오류 메시지를 한국어로 표시한다.
3. WHEN 차트 및 컴포넌트를 구현하면 THEN 시스템은 SHALL 기존 futures-dashboard와 일관된 차트 라이브러리(Recharts) 및 정규화 패턴을 재사용한다.
4. WHEN 동일한 페어/범위에 대해 반복 조회가 발생하면 THEN 시스템은 SHALL 불필요한 중복 외부 호출을 줄이기 위해 캐싱/요청 관리(예: TanStack Query)를 적용한다.
5. WHILE 분봉 단위로 데이터를 렌더링하는 동안 시스템은 SHALL 다수의 캔들 포인트에서도 차트가 응답성 있게 동작하도록 렌더링을 최적화한다.

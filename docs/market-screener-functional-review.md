# 마켓 스크리너 요구사항 대비 기능 검증

> 최초 검증: 2026-05-28 / 최종 갱신: 2026-05-29
> 요구사항 문서: `.claude/specs/velo-market-screener/requirements.md` (18개 기능 요구사항 + 5개 NFR)
> 대상: `/market-screener` 페이지
> 비고: 2026-05-29 Charts/Table 탭 분리 개편을 반영한 현행 상태 기록이다.

---

## 0. 2026-05-29 레이아웃 개편

마켓 스크리너를 **Charts / Table 두 탭**으로 분리했다(이전: 한 화면 혼합).

```
[Charts] [Table]                         ← 상위 뷰 전환
시가총액: [All] [Large] [Mid] [Small]     ← Charts·Table 공용
섹터:    [All] [DeFi] [L1] [L2] [Metaverse] [Meme] [Dino] [AI]  ← Charts·Table 공용
정렬:    [Top Gainers] [Top Losers] [Top Volume] [New Listings]  ← Table 뷰에서만 표시
```

- **Charts 탭(기본)**: 10개 차트 그리드. 시가총액/섹터 필터가 차트에 적용되고, 정렬 탭은 의미가 없어 숨긴다(`showSortTabs=false`).
- **Table 탭**: 정렬 탭 + 시가총액/섹터 필터 + 200행 테이블.
- 효과: 차트가 별도 탭으로 분리되어 "테이블 아래로 스크롤해야 차트가 보이는" 문제가 해소됐다.

이 개편은 UX를 개선했지만 아래 2장의 기능 미동작(FAIL) 항목 대부분은 그대로 남아 있다.

---

## 1. 검증 요약

### 기능 요구사항 (18개, 약 107개 수락 기준)

| 상태 | 기준 수 | 비율 |
|------|---------|------|
| **구현 완료** | ~81개 | ~76% |
| **부분 구현** | ~10개 | ~9% |
| **미구현** | ~16개 | ~15% |

레이아웃 개편(Charts/Table)으로 차트 접근성·필터 조합 UX는 개선됐으나, 기능 미동작 항목의 실질 수정은 거의 없다.

### 비기능 요구사항 (5개 카테고리, 22개 기준)

| 상태 | 기준 수 |
|------|---------|
| **PASS** | 12개 |
| **FAIL** | 6개 |
| **부분/주의** | 4개 |

---

## 2. 미구현 항목 (FAIL) — 총 16건 (현재 상태)

### 기능 미동작 (사용자 직접 체감)

| # | 요구사항 | 내용 | 현재 상태 |
|---|---------|------|:--------:|
| 1 | **Req 7.2/7.10** | **Return Buckets 기간 전환 무효** — PeriodTabs UI는 Charts 탭에 있으나 `klineData`가 차트에 전달되지 않아 항상 24h `change24h` 사용 | 부분(UI만) |
| 2 | **Req 10.2/10.3** | **Sector Performance 기간 선택기 누락** — PeriodTabs 자체가 없음, 항상 24h | OPEN |
| 3 | **Req 7.6** | **Return Buckets 툴팁 코인 목록 미표시** — 코인 수만, 심볼+수익률 목록 없음 | OPEN |
| 4 | **Req 10.5** | **Sector Performance 툴팁 불완전** — 평균 수익률만, 코인 수/구성 목록 없음 | OPEN |
| 5 | **Req 16.6** | **가격 변동 flash 애니메이션 미구현** | OPEN |
| 6 | **Req 16.8** | **2분 경과 stale 경고 미구현** — 마지막 갱신 시간 표시도 없음 | OPEN |
| 7 | **Req 18.6** | **마지막 데이터 갱신 시간 미표시** — 코인 수/거래소 수만 표시 | OPEN |

### 요구사항 불일치

| # | 요구사항 | 내용 | 현재 상태 |
|---|---------|------|:--------:|
| 8 | **Req 3.1** | **기본 탭 불일치** — 구현 `topVolume`, 요구사항 "Top Gainers" | OPEN |
| 9 | **Req 4.5** | **Uncategorized 처리 오류** — 매핑에 없는 코인이 `small`로 폴백(`coin-aggregator.ts`). 요구사항은 cap 탭에서 제외 | OPEN |
| 10 | **Req 3.6** | **New Listings "데이터 준비 중" 전용 메시지 미구현** — 일반 메시지만 | OPEN |
| 11 | **Req 15.1** | **OKX 신규 상장 감지 미구현** — Binance/Bybit만 | OPEN |
| 12 | **Req 17.1** | **코인 이름 검색 미지원** — 심볼만 검색 가능(`useScreenerFilter.ts`) | OPEN |
| 13 | **Req 14.6** | **매핑 코인 수 부족** — 요구사항 250+, 실제 섹터 ~121개 / 시가총액 ~71개 | OPEN |

### NFR 미충족

| # | 요구사항 | 내용 | 현재 상태 |
|---|---------|------|:--------:|
| 14 | **NFR-1.3** | **250+ 행 가상화 미구현** — `slice(0, 200)` 하드코딩 | OPEN |
| 15 | **NFR-1.5** | **차트 lazy loading 미구현** — 10개 차트 정적 import | OPEN |
| 16 | **NFR-3.3** | **탭 키보드 탐색 미구현** — Arrow key, ARIA tablist 패턴 없음 | OPEN |

> 16건 중 1건(Return Buckets, UI만 존재)이 부분 진척, 나머지 15건은 미해결이다.

---

## 3. 부분 구현 항목

| # | 요구사항 | 내용 |
|---|---------|------|
| 1 | Req 2.2 | 테이블에 코인 아이콘 미표시 — 심볼 텍스트만 |
| 2 | Req 9.5 | Binance OI 누락 — 벌크 ticker에 OI 없어 Total OI 차트에서 Binance 0/생략 |
| 3 | NFR-2.2 | 실패 거래소 이름 미표시 — 에러 개수만 표시 |
| 4 | NFR-4.1 | i18n 대량 미적용 — 한국어/영어 하드코딩 혼재 |
| 5 | Req 8.5 / 9.6 | 차트 정렬이 서버 응답에 의존 — 차트 자체 정렬 없음 |
| 6 | 추가 차트 | Price Changes/Funding Rate의 `slice(0,20)` 후 정렬 → 전체 Top20이 아닌 임의 20개 정렬 |
| 7 | 추가 차트 | Dominance/Funding Heatmap 하드코딩 색상 → 다크 모드 대비 |
| 8 | NFR-1.2 | 클라이언트 타임아웃이 요구사항(5초)과 불일치 |
| 9 | Req 10.1 | 섹터 수/명칭 불일치 — 요구 "6개, Gaming", 구현 "7개, Metaverse+Dino" |
| 10 | 데이터 | Bybit 1000x 코인 OI — `priceMultiplier`(×1000) 적용으로 개선됨. 원본 `openInterest` 단위 기준 추가 검증 권장 |
| 11 | 데이터 | OKX 거래량 `volCcy24h × last` — 현재가 환산으로 VWAP 대비 약간의 오차 |

---

## 4. 차트별 상태 (Charts 탭 10개)

### 원본 요구사항 차트 4개

| 차트 | 기간 선택 | 툴팁 | 종합 |
|------|:--------:|:----:|:----:|
| **Return Buckets** | X (UI만, 1w/1m 무효) | 부분 (코인 목록 없음) | 60% |
| **Market Volume** | N/A | O | 90% |
| **Total OI** | N/A | O | 85% (Binance 0) |
| **Sector Performance** | X (선택기 없음) | 부분 | 60% |

### 추가 구현 차트 6개

| 차트 | 데이터 소스 | 기간 전환 | 다크 모드 | 비고 |
|------|-----------|:---------:|:---------:|------|
| **Price Changes** | ticker + kline | O | O | slice-before-sort 이슈 |
| **Funding Rate** | ticker | N/A (모드 토글) | O | slice-before-sort 이슈 |
| **OI Changes** | Phase 2 서버 / ticker 폴백 | O | 부분(하드코딩 색상) | 서버 의존, 시계열 미반환 |
| **Dominance** | CoinGecko + ticker | N/A (메트릭 토글) | 부분(하드코딩 색상) | 3-모드 토글, 잘 설계됨 |
| **Funding Heatmap** | Phase 2 서버 | O | 부분(하드코딩 RGB) | 커스텀 SVG |
| **Normalized CVD** | Phase 2 서버 | O | O | X축/툴팁 소수점 4자리로 통일 |

---

## 5. 데이터 파이프라인 검증 (Req 11-14)

### 집계 공식 (검증 완료, 정확)

| 항목 | 요구사항 | 구현 |
|------|---------|------|
| 가격 | 거래량 가중평균 | `Σ(price × volume) / Σ(volume)` |
| 거래량 | 합산 | `Σ(volume24h)` |
| OI | 합산 | `Σ(openInterest)` |
| 펀딩비율 | OI 가중평균 | `Σ(funding × OI) / Σ(OI)` + OI=0 폴백 |
| change24h | (미명시) | 거래량 가중평균 (합리적) |

### 거래소별 데이터 정확성

| 거래소 | OI | funding | 종합 |
|--------|:--:|:-------:|:----:|
| **Binance** | 0 (벌크 미포함) | O (premiumIndex 보충) | 85% |
| **Bybit** | priceMultiplier 적용(개선) | O | 90% |
| **OKX** | O (별도 API 보충) | O (별도 API 보충) | 95% |
| **Gate.io** | O | O | 95% |
| **Bitget** | O | O | 95% |
| **Hyperliquid** | O | O | 95% |

### 심볼 정규화 (검증 완료)

| 패턴 | 구현 |
|------|:---:|
| Binance/Bybit `BTCUSDT` → `BTC` | O |
| OKX `BTC-USDT-SWAP` → `BTC` | O |
| Gate `BTC_USDT` → `BTC` | O |
| Bitget `BTCUSDT` → `BTC` | O |
| Hyperliquid `BTC` → `BTC` | O |
| `1000PEPE → PEPE` (11개 1000x 코인) | O (접두사 제거 + 가격 ×1000) |
| USDT-마진만 필터링 | O (6개 거래소 모두) |

---

## 6. 수정 우선순위

### 즉시 수정 (기능 미동작)

1. **Return Buckets 기간 전환** — `klineData`와 `period`를 차트에 전달, 1w/1m에서 kline 변화율 사용
2. **Sector Performance 기간 선택기** — PeriodTabs 추가 + kline 데이터 연동
3. **Uncategorized 코인 처리** — `small` 폴백 대신 `marketCap === undefined`인 코인은 cap 필터에서 제외

### 단기 수정 (데이터 정확도/완성도)

4. **Return Buckets/Sector Performance 툴팁** — 코인 목록(심볼+수익률) 표시
5. **테이블 행 제한** — `slice(0, 200)` → 가상 스크롤 또는 최소 250개
6. **마지막 갱신 시간 표시** + 2분 초과 경고
7. **기본 탭** — `topVolume` → `topGainers`
8. **코인 매핑 확대** — 섹터 121 / 시가총액 71 → 250+
9. **Bybit 1000x OI 원본 단위 재검증**

### 중기 개선

10. i18n 통일, flash 애니메이션, 차트 lazy loading, 탭 키보드 접근성, 코인 아이콘, 실패 거래소 이름 표시, Price Changes/Funding Rate sort-before-slice 수정, 다크 모드 하드코딩 색상 → CSS 변수

---

## 7. 요구사항별 전체 체크리스트

| Req | 제목 | 기준 수 | 통과 | 부분 | 실패 |
|-----|------|:------:|:----:|:----:|:----:|
| 1 | 사이드바 메뉴 | 4 | 4 | 0 | 0 |
| 2 | 테이블 기본 구조 | 10 | 8 | 1 | 1 |
| 3 | 정렬 탭 | 8 | 6 | 0 | 2 |
| 4 | 시가총액 필터 | 5 | 4 | 0 | 1 |
| 5 | 섹터 필터 | 5 | 5 | 0 | 0 |
| 6 | 탭 조합 | 4 | 4 | 0 | 0 |
| 7 | Return Buckets | 10 | 5 | 2 | 3 |
| 8 | Market Volume | 5 | 4 | 1 | 0 |
| 9 | Total OI | 6 | 4 | 2 | 0 |
| 10 | Sector Performance | 7 | 3 | 1 | 3 |
| 11 | 데이터 수집 | 5 | 4 | 1 | 0 |
| 12 | 거래소 API | 7 | 7 | 0 | 0 |
| 13 | 심볼 정규화 | 3 | 3 | 0 | 0 |
| 14 | 정적 매핑 | 6 | 5 | 0 | 1 |
| 15 | New Listings | 4 | 3 | 0 | 1 |
| 16 | 클라이언트 상태 | 8 | 5 | 0 | 3 |
| 17 | 검색 | 4 | 3 | 0 | 1 |
| 18 | 레이아웃 | 6 | 4 | 2 | 0 |
| **합계** | | **107** | **81** | **10** | **16** |

**전체 달성률: 약 76%(81/107 통과), 부분 포함 시 약 85%(91/107).** 2026-05-29 Charts/Table 개편으로 레이아웃(Req 18)·차트 접근성은 개선됐으나, 기능 미동작 16건은 후속 수정 대상으로 남아 있다.

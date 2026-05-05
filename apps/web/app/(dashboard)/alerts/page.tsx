/**
 * 알림 관리 페이지
 *
 * 가격 알림 및 김치 프리미엄 알림의 CRUD 관리,
 * 알림 발생 이력 조회, 브라우저 알림 설정을 제공한다.
 *
 * 주요 기능:
 * - 활성/비활성 알림 설정 목록 표시
 * - 가격 알림 설정 폼 (코인, 목표가, 조건 선택)
 * - 김프 알림 설정 폼 (임계값 설정)
 * - 알림 이력 표시
 * - 브라우저 Notification API 연동, 권한 거부 시 인앱 토스트/배지 대체
 * - WebSocket을 통한 실시간 알림 수신
 *
 * @see 요구사항 6.1 (가격 알림 조건 충족 시 브라우저 알림)
 * @see 요구사항 6.2 (김프 임계값 초과 시 알림)
 * @see 요구사항 6.3 (활성/비활성 알림 목록, 최근 알림 이력)
 * @see 요구사항 6.4 (브라우저 알림 권한 거부 시 인앱 토스트/배지)
 * @see 요구사항 6.5 (알림 이력 기록)
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  Bell,
  BellRing,
  BellOff,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Clock,
  Check,
  X,
  Info,
  History,
  Settings,
  Wifi,
  Send,
  ArrowRight,
} from 'lucide-react';
import type { AlertCondition, ExchangeType, AlertCurrency } from '@bitscope/shared';
import {
  MAJOR_COINS,
  getCurrencyForExchange,
  formatAlertPrice,
  getInputStepForCurrency,
  getCurrencyDisplay,
} from '@bitscope/shared';
import { cn, getExchangeName, getCoinName } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import {
  useAlertList,
  useAlertHistory,
  useAlertMutations,
  useAlertNotifications,
  type AlertResponse,
  type AlertHistoryResponse,
  type CreateAlertParams,
  type InAppNotification,
  type NotificationPermission,
} from '@/hooks/useAlerts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableRowSkeleton } from '@/components/ui/skeleton';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// ===== 상수 =====

/** 알림 지원 거래소 (서버에서 시세 모니터링이 되는 거래소만) */
const ALERT_SUPPORTED_EXCHANGES: readonly ExchangeType[] = [
  'upbit', 'bithumb', 'coinone', 'binance', 'hyperliquid',
];

/** 알림 조건 옵션 */
const PRICE_CONDITIONS: { value: AlertCondition; labelKey: 'conditionAbove' | 'conditionBelow' }[] = [
  { value: 'above', labelKey: 'conditionAbove' },
  { value: 'below', labelKey: 'conditionBelow' },
];

const PREMIUM_CONDITIONS: { value: AlertCondition; labelKey: 'premiumAbove' | 'premiumBelow' }[] = [
  { value: 'premium_above', labelKey: 'premiumAbove' },
  { value: 'premium_below', labelKey: 'premiumBelow' },
];

/** 탭 정의 */
type TabId = 'settings' | 'history' | 'notifications';

/** 필터 타입 */
type AlertFilter = 'all' | 'active' | 'inactive';

// ===== 메인 페이지 =====

export default function AlertsPage() {
  const { t } = useTranslation();
  const { wallet } = useWalletAuth();

  // 활성 탭
  const [activeTab, setActiveTab] = useState<TabId>('settings');

  // 지갑 미연결 시 안내
  if (!wallet.isConnected || !wallet.address) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[60vh]">
        <BellOff className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          {t.wallet.authRequired.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.wallet.authRequired.description}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <AlertsPageHeader />

      {/* 텔레그램 연결 안내 배너 */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
        <Send className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="flex-1 text-sm text-muted-foreground">
          {t.telegram.alertPageNotice}
        </p>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline whitespace-nowrap"
        >
          {t.telegram.goToSettings}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {/* 탭 네비게이션 */}
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* 탭 콘텐츠 */}
      {activeTab === 'settings' && (
        <AlertSettingsTab walletAddress={wallet.address} />
      )}
      {activeTab === 'history' && (
        <AlertHistoryTab walletAddress={wallet.address} />
      )}
      {activeTab === 'notifications' && (
        <AlertNotificationsTab walletAddress={wallet.address} />
      )}
    </div>
  );
}

// ===== 서브 컴포넌트 =====

// ----- 페이지 헤더 -----

/**
 * 알림 페이지 상단 헤더
 */
function AlertsPageHeader() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">
        {t.nav.alerts}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.alert.noAlertsDescription}
      </p>
    </div>
  );
}

// ----- 탭 네비게이션 -----

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

/**
 * 탭 네비게이션 컴포넌트
 */
function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const { t } = useTranslation();

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'settings', label: t.alert.tabs.settings, icon: Settings },
    { id: 'history', label: t.alert.tabs.history, icon: History },
    { id: 'notifications', label: t.alert.tabs.notifications, icon: Wifi },
  ];

  return (
    <div className="flex gap-1 border-b border-border" role="tablist" aria-label={t.nav.alerts}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px]',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ===== 알림 설정 탭 =====

interface AlertSettingsTabProps {
  walletAddress: string;
}

/**
 * 알림 설정 탭
 *
 * 활성/비활성 알림 목록과 알림 생성 폼을 표시한다.
 *
 * @see 요구사항 6.3 (활성/비활성 알림 목록)
 */
function AlertSettingsTab({ walletAddress }: AlertSettingsTabProps) {
  const { t } = useTranslation();

  // 상태
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [alertType, setAlertType] = useState<'price' | 'premium'>('price');

  // 알림 목록 조회
  const isActiveFilter = filter === 'all' ? undefined : filter === 'active';
  const { data: alerts, isLoading, error, refetch } = useAlertList({
    walletAddress,
    isActive: isActiveFilter,
    enabled: true,
  });

  // CRUD 뮤테이션
  const {
    createAlert: createMutation,
    deleteAlert: deleteMutation,
    toggleActive,
  } = useAlertMutations(walletAddress);

  // 알림 생성 핸들러
  const handleCreateAlert = useCallback(
    (params: Omit<CreateAlertParams, 'walletAddress'>) => {
      createMutation.mutate(
        { ...params, walletAddress },
        {
          onSuccess: () => {
            setShowCreateForm(false);
          },
        },
      );
    },
    [createMutation, walletAddress],
  );

  // 알림 삭제 핸들러
  const handleDeleteAlert = useCallback(
    (alertId: string) => {
      if (window.confirm(t.alert.deleteAlertConfirm)) {
        deleteMutation.mutate(alertId);
      }
    },
    [deleteMutation, t.alert.deleteAlertConfirm],
  );

  return (
    <div className="space-y-4">
      {/* 필터 및 생성 버튼 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as AlertFilter[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
            >
              {f === 'all'
                ? t.alert.allAlerts
                : f === 'active'
                  ? t.alert.activeAlerts
                  : t.alert.inactiveAlerts}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              setAlertType('price');
              setShowCreateForm(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {t.alert.createPriceAlert}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAlertType('premium');
              setShowCreateForm(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {t.alert.createPremiumAlert}
          </Button>
        </div>
      </div>

      {/* 알림 생성 폼 */}
      {showCreateForm && (
        <CreateAlertForm
          type={alertType}
          isLoading={createMutation.isPending}
          error={createMutation.error?.message ?? null}
          onSubmit={handleCreateAlert}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* 알림 목록 */}
      {isLoading && !alerts ? (
        <Card>
          <CardContent className="p-4">
            <TableRowSkeleton columns={5} rows={5} />
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BellOff className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-4 text-sm text-destructive">
              {error.message}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
              {t.common.retry}
            </Button>
          </CardContent>
        </Card>
      ) : !alerts || alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">{t.alert.noAlerts}</p>
            <p className="text-xs text-muted-foreground">{t.alert.noAlertsDescription}</p>
          </CardContent>
        </Card>
      ) : (
        <AlertList
          alerts={alerts}
          onToggleActive={toggleActive}
          onDelete={handleDeleteAlert}
        />
      )}
    </div>
  );
}

// ----- 알림 생성 폼 -----

interface CreateAlertFormProps {
  type: 'price' | 'premium';
  isLoading: boolean;
  error: string | null;
  onSubmit: (params: Omit<CreateAlertParams, 'walletAddress'>) => void;
  onCancel: () => void;
}

/**
 * 알림 생성 폼
 *
 * 가격 알림 또는 김프 알림을 설정할 수 있는 폼을 표시한다.
 *
 * @see 요구사항 6.1 (가격 알림 설정)
 * @see 요구사항 6.2 (김프 알림 설정)
 */
function CreateAlertForm({
  type,
  isLoading,
  error,
  onSubmit,
  onCancel,
}: CreateAlertFormProps) {
  const { t, locale } = useTranslation();

  // 폼 상태: 거래소 → 코인 → 조건 → 가격
  const [exchange, setExchange] = useState<string>('');
  const [symbol, setSymbol] = useState('');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [condition, setCondition] = useState<AlertCondition>(
    type === 'price' ? 'above' : 'premium_above',
  );
  const [targetValue, setTargetValue] = useState('');

  // 거래소별 동적 코인 목록
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(false);

  const conditions = type === 'price' ? PRICE_CONDITIONS : PREMIUM_CONDITIONS;

  // 거래소에 따른 통화 결정
  const currency = exchange
    ? getCurrencyForExchange(exchange as ExchangeType)
    : null;

  // 거래소 선택 시 해당 거래소의 코인 목록을 가져온다
  useEffect(() => {
    if (!exchange) {
      setAvailableSymbols([]);
      return;
    }

    let cancelled = false;
    setSymbolsLoading(true);

    fetch(`/api/exchange/${exchange}/ticker`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const tickers = data?.data?.tickers ?? data?.tickers ?? [];
        const symbols: string[] = tickers
          .map((t: { symbol?: string }) => t.symbol)
          .filter(Boolean)
          .sort();
        // 중복 제거
        setAvailableSymbols([...new Set(symbols)]);
      })
      .catch(() => {
        if (!cancelled) setAvailableSymbols([]);
      })
      .finally(() => {
        if (!cancelled) setSymbolsLoading(false);
      });

    return () => { cancelled = true; };
  }, [exchange]);

  // 거래소 변경 시 하위 필드 초기화
  const handleExchangeChange = (newExchange: string) => {
    setExchange(newExchange);
    setSymbol('');
    setSymbolSearch('');
    setTargetValue('');
  };

  // 검색어로 필터링된 코인 목록
  const filteredSymbols = symbolSearch
    ? availableSymbols.filter((sym) => {
        const coinInfo = MAJOR_COINS.find((c) => c.symbol === sym);
        const searchLower = symbolSearch.toLowerCase();
        return (
          sym.toLowerCase().includes(searchLower) ||
          (coinInfo?.nameKo?.includes(symbolSearch)) ||
          (coinInfo?.nameEn?.toLowerCase().includes(searchLower))
        );
      })
    : availableSymbols;

  // 코인 선택 핸들러
  const handleSymbolSelect = (sym: string) => {
    setSymbol(sym);
    setSymbolSearch(sym);
    setShowSymbolDropdown(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedValue = parseFloat(targetValue);
    if (!exchange || !symbol || isNaN(parsedValue)) return;
    // 가격 알림은 0 이상만, 김프 알림은 음수도 허용
    if (type === 'price' && parsedValue < 0) return;

    onSubmit({
      symbol: symbol.toUpperCase(),
      exchange: exchange as ExchangeType,
      currency: currency!,
      condition,
      targetValue: parsedValue,
    });
  };

  const isFormValid =
    exchange.trim() !== '' &&
    symbol.trim() !== '' &&
    targetValue.trim() !== '' &&
    !isNaN(parseFloat(targetValue)) &&
    (type === 'premium' || parseFloat(targetValue) >= 0);

  // 통화별 가격 입력 속성
  const isPremiumType = type === 'premium';
  const inputStep = isPremiumType ? '0.01' : (currency ? getInputStepForCurrency(currency) : '1');
  const currencyDisplay = currency ? getCurrencyDisplay(currency) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">
          {type === 'price' ? t.alert.createPriceAlert : t.alert.createPremiumAlert}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. 거래소 선택 (필수) */}
            <div className="space-y-1.5">
              <Label htmlFor="alert-exchange">{t.alert.selectExchange}</Label>
              <select
                id="alert-exchange"
                value={exchange}
                onChange={(e) => handleExchangeChange(e.target.value)}
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                )}
                required
                aria-label={t.alert.selectExchange}
              >
                <option value="">{t.alert.selectExchange}</option>
                {ALERT_SUPPORTED_EXCHANGES.map((ex) => (
                  <option key={ex} value={ex}>
                    {getExchangeName(ex, locale)}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. 코인 선택 (검색 가능, 거래소 미선택 시 비활성화) */}
            <div className="space-y-1.5 relative">
              <Label htmlFor="alert-symbol">
                {t.alert.selectCoin}
                {availableSymbols.length > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({availableSymbols.length})
                  </span>
                )}
              </Label>
              <Input
                id="alert-symbol"
                type="text"
                value={symbolSearch}
                onChange={(e) => {
                  setSymbolSearch(e.target.value);
                  setSymbol('');
                  setShowSymbolDropdown(true);
                }}
                onFocus={() => setShowSymbolDropdown(true)}
                onBlur={() => {
                  // 클릭 이벤트가 먼저 처리되도록 약간의 딜레이
                  setTimeout(() => setShowSymbolDropdown(false), 200);
                }}
                disabled={!exchange || symbolsLoading}
                placeholder={
                  symbolsLoading
                    ? '로딩 중...'
                    : !exchange
                      ? t.alert.selectCoin
                      : `${t.alert.selectCoin} (검색)`
                }
                className={cn(
                  (!exchange || symbolsLoading) && 'opacity-50 cursor-not-allowed',
                )}
                autoComplete="off"
                aria-label={t.alert.selectCoin}
              />
              {/* 검색 드롭다운 */}
              {showSymbolDropdown && exchange && !symbolsLoading && filteredSymbols.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-input bg-popover shadow-md">
                  {filteredSymbols.slice(0, 50).map((sym) => {
                    const coinInfo = MAJOR_COINS.find((c) => c.symbol === sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors',
                          symbol === sym && 'bg-accent font-medium',
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSymbolSelect(sym);
                        }}
                      >
                        <span className="font-medium">{sym}</span>
                        {coinInfo && (
                          <span className="ml-1.5 text-muted-foreground text-xs">
                            {getCoinName(coinInfo, locale)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {filteredSymbols.length > 50 && (
                    <div className="px-3 py-1.5 text-xs text-muted-foreground text-center">
                      +{filteredSymbols.length - 50}개 더...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. 조건 선택 */}
            <div className="space-y-1.5">
              <Label htmlFor="alert-condition">{t.alert.selectCondition}</Label>
              <select
                id="alert-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as AlertCondition)}
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                )}
                required
                aria-label={t.alert.selectCondition}
              >
                {conditions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t.alert[c.labelKey]}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. 목표값 입력 (통화별 step/접두사/접미사) */}
            <div className="space-y-1.5">
              <Label htmlFor="alert-target">
                {isPremiumType ? t.alert.targetPremium : t.alert.targetPrice}
                {!isPremiumType && currency && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({currency})
                  </span>
                )}
              </Label>
              <div className="relative">
                {!isPremiumType && currencyDisplay?.prefix && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {currencyDisplay.prefix}
                  </span>
                )}
                <Input
                  id="alert-target"
                  type="number"
                  step={inputStep}
                  min={isPremiumType ? undefined : '0'}
                  placeholder={
                    isPremiumType
                      ? t.alert.enterTargetPremium
                      : t.alert.enterTargetPrice
                  }
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  required
                  className={cn(
                    !isPremiumType && currencyDisplay?.prefix && 'pl-7',
                    !isPremiumType && currencyDisplay?.suffix && 'pr-8',
                  )}
                  aria-label={isPremiumType ? t.alert.targetPremium : t.alert.targetPrice}
                />
                {isPremiumType && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                )}
                {!isPremiumType && currencyDisplay?.suffix && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {currencyDisplay.suffix}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 오류 메시지 */}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* 버튼 */}
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isLoading}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isLoading || !isFormValid}
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-1" />
                  {t.alert.creating}
                </>
              ) : (
                <>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t.alert.createAlert}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ----- 알림 목록 -----

interface AlertListProps {
  alerts: AlertResponse[];
  onToggleActive: (alertId: string, currentIsActive: boolean) => void;
  onDelete: (alertId: string) => void;
}

/**
 * 알림 목록
 *
 * 등록된 알림을 데스크톱에서는 테이블, 모바일에서는 카드로 표시한다.
 */
function AlertList({ alerts, onToggleActive, onDelete }: AlertListProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="p-0">
        {/* 데스크톱 테이블 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full" role="table" aria-label={t.alert.tabs.settings}>
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="col">
                  {t.alert.form.typeLabel}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="col">
                  {t.portfolio.coinName}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="col">
                  {t.alert.selectExchange}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="col">
                  {t.alert.selectCondition}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {t.alert.targetPrice}
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground" scope="col">
                  {t.apiKey.connectionStatus}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {/* 액션 */}
                </th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <AlertTableRow
                  key={alert.id}
                  alert={alert}
                  onToggleActive={onToggleActive}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 */}
        <div className="md:hidden divide-y divide-border">
          {alerts.map((alert) => (
            <AlertMobileCard
              key={alert.id}
              alert={alert}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ----- 알림 테이블 행 -----

interface AlertTableRowProps {
  alert: AlertResponse;
  onToggleActive: (alertId: string, currentIsActive: boolean) => void;
  onDelete: (alertId: string) => void;
}

/**
 * 알림 테이블의 개별 행 (데스크톱)
 */
function AlertTableRow({ alert, onToggleActive, onDelete }: AlertTableRowProps) {
  const { t, locale } = useTranslation();

  const isPremium = alert.condition === 'premium_above' || alert.condition === 'premium_below';
  const conditionLabel = getConditionLabel(alert.condition as AlertCondition, t);
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === alert.symbol);
  const exchangeName = getExchangeName(alert.exchange as ExchangeType, locale);

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors">
      {/* 알림 유형 */}
      <td className="px-4 py-3">
        <Badge
          variant={isPremium ? 'secondary' : 'outline'}
          className="text-xs"
        >
          {isPremium ? t.alert.premiumAlert : t.alert.priceAlert}
        </Badge>
      </td>

      {/* 코인 */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-semibold text-foreground">{alert.symbol}</span>
          {coinInfo && (
            <span className="text-xs text-muted-foreground">{getCoinName(coinInfo, locale)}</span>
          )}
        </div>
      </td>

      {/* 거래소 */}
      <td className="px-4 py-3 text-sm text-foreground">
        {exchangeName}
      </td>

      {/* 조건 */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {(alert.condition === 'above' || alert.condition === 'premium_above') ? (
            <TrendingUp className="h-3.5 w-3.5 text-profit" aria-hidden="true" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-loss" aria-hidden="true" />
          )}
          <span className="text-sm text-foreground">{conditionLabel}</span>
        </div>
      </td>

      {/* 목표값 */}
      <td className="px-4 py-3 text-right">
        <span className="text-sm font-medium text-foreground">
          {isPremium
            ? formatAlertPrice(Number(alert.targetValue), undefined, true)
            : formatAlertPrice(Number(alert.targetValue), alert.currency as AlertCurrency)}
        </span>
      </td>

      {/* 상태 */}
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={() => onToggleActive(alert.id, alert.isActive)}
          className="inline-flex items-center"
          aria-label={t.alert.toggleActive}
        >
          <Badge
            variant={alert.isActive ? 'default' : 'secondary'}
            className={cn(
              'cursor-pointer text-xs',
              alert.isActive
                ? 'bg-profit/20 text-profit hover:bg-profit/30'
                : 'hover:bg-muted',
            )}
          >
            {alert.isActive ? t.alert.active : t.alert.inactive}
          </Badge>
        </button>
      </td>

      {/* 액션 */}
      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(alert.id)}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          aria-label={t.alert.deleteAlert}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </td>
    </tr>
  );
}

// ----- 알림 모바일 카드 -----

interface AlertMobileCardProps {
  alert: AlertResponse;
  onToggleActive: (alertId: string, currentIsActive: boolean) => void;
  onDelete: (alertId: string) => void;
}

/**
 * 알림 모바일 카드
 *
 * 모바일 환경에서 알림 정보를 카드 형태로 표시한다.
 */
function AlertMobileCard({ alert, onToggleActive, onDelete }: AlertMobileCardProps) {
  const { t, locale } = useTranslation();

  const isPremium = alert.condition === 'premium_above' || alert.condition === 'premium_below';
  const conditionLabel = getConditionLabel(alert.condition as AlertCondition, t);
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === alert.symbol);
  const exchangeName = getExchangeName(alert.exchange as ExchangeType, locale);

  return (
    <div className="px-4 py-3 space-y-2">
      {/* 상단: 코인 + 유형 + 상태 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{alert.symbol}</span>
          {coinInfo && (
            <span className="text-xs text-muted-foreground">{getCoinName(coinInfo, locale)}</span>
          )}
          <Badge variant={isPremium ? 'secondary' : 'outline'} className="text-[10px]">
            {isPremium ? t.alert.premiumAlert : t.alert.priceAlert}
          </Badge>
        </div>
        <button
          type="button"
          onClick={() => onToggleActive(alert.id, alert.isActive)}
          aria-label={t.alert.toggleActive}
        >
          <Badge
            variant={alert.isActive ? 'default' : 'secondary'}
            className={cn(
              'cursor-pointer text-xs',
              alert.isActive
                ? 'bg-profit/20 text-profit'
                : '',
            )}
          >
            {alert.isActive ? t.alert.active : t.alert.inactive}
          </Badge>
        </button>
      </div>

      {/* 중단: 조건 정보 */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {(alert.condition === 'above' || alert.condition === 'premium_above') ? (
            <TrendingUp className="h-3.5 w-3.5 text-profit" aria-hidden="true" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-loss" aria-hidden="true" />
          )}
          <span>{conditionLabel}</span>
          <span className="text-xs">({exchangeName})</span>
        </div>
        <span className="font-medium text-foreground">
          {isPremium
            ? formatAlertPrice(Number(alert.targetValue), undefined, true)
            : formatAlertPrice(Number(alert.targetValue), alert.currency as AlertCurrency)}
        </span>
      </div>

      {/* 하단: 삭제 버튼 */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(alert.id)}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
          aria-label={t.alert.deleteAlert}
        >
          <Trash2 className="mr-1 h-3 w-3" aria-hidden="true" />
          {t.common.delete}
        </Button>
      </div>
    </div>
  );
}

// ===== 알림 이력 탭 =====

interface AlertHistoryTabProps {
  walletAddress: string;
}

/**
 * 알림 이력 탭
 *
 * 최근 발생한 알림 이력을 시간순으로 표시한다.
 *
 * @see 요구사항 6.5 (알림 이력 기록)
 */
function AlertHistoryTab({ walletAddress }: AlertHistoryTabProps) {
  const { t } = useTranslation();

  const { data: history, isLoading, error, refetch } = useAlertHistory({
    walletAddress,
    limit: 100,
    enabled: true,
  });

  if (isLoading && !history) {
    return (
      <Card>
        <CardContent className="p-4">
          <TableRowSkeleton columns={4} rows={5} />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <History className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-4 text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
            {t.common.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <History className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-4 text-sm text-muted-foreground">{t.alert.noHistory}</p>
          <p className="text-xs text-muted-foreground">{t.alert.noHistoryDescription}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* 데스크톱 테이블 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full" role="table" aria-label={t.alert.history}>
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="col">
                  {t.alert.triggeredAt}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="col">
                  {t.portfolio.coinName}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {t.alert.triggeredValue}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="col">
                  {t.alert.message}
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <AlertHistoryRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 */}
        <div className="md:hidden divide-y divide-border">
          {history.map((item) => (
            <AlertHistoryMobileCard key={item.id} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ----- 알림 이력 테이블 행 -----

interface AlertHistoryRowProps {
  item: AlertHistoryResponse;
}

/**
 * 알림 이력 테이블 행 (데스크톱)
 */
function AlertHistoryRow({ item }: AlertHistoryRowProps) {
  const { locale } = useTranslation();
  const triggeredDate = new Date(item.triggeredAt);
  const formattedDate = triggeredDate.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const alertSymbol = item.alert?.symbol ?? '';
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === alertSymbol);

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm text-foreground">{formattedDate}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-semibold text-foreground">{alertSymbol}</span>
          {coinInfo && (
            <span className="text-xs text-muted-foreground">{getCoinName(coinInfo, locale)}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-sm font-medium text-foreground">
          {Number(item.triggeredValue).toLocaleString('ko-KR')}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-muted-foreground">{item.message}</span>
      </td>
    </tr>
  );
}

// ----- 알림 이력 모바일 카드 -----

interface AlertHistoryMobileCardProps {
  item: AlertHistoryResponse;
}

/**
 * 알림 이력 모바일 카드
 */
function AlertHistoryMobileCard({ item }: AlertHistoryMobileCardProps) {
  const triggeredDate = new Date(item.triggeredAt);
  const formattedDate = triggeredDate.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="px-4 py-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BellRing className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">{formattedDate}</span>
        </div>
      </div>
      <p className="text-sm text-foreground">{item.message}</p>
    </div>
  );
}

// ===== 실시간 알림 탭 =====

interface AlertNotificationsTabProps {
  walletAddress: string;
}

/**
 * 실시간 알림 탭
 *
 * WebSocket을 통해 수신된 실시간 알림과
 * 브라우저 알림 권한 설정을 관리한다.
 *
 * @see 요구사항 6.4 (브라우저 알림 권한 거부 시 인앱 알림)
 */
function AlertNotificationsTab({ walletAddress }: AlertNotificationsTabProps) {
  const { t } = useTranslation();

  const {
    notifications,
    unreadCount,
    notificationPermission,
    requestPermission,
    markAllAsRead,
    clearAll,
  } = useAlertNotifications({ walletAddress, enabled: true });

  return (
    <div className="space-y-4">
      {/* 브라우저 알림 권한 안내 */}
      <NotificationPermissionCard
        permission={notificationPermission}
        onRequestPermission={requestPermission}
      />

      {/* 인앱 알림 목록 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">
              {t.alert.notification.inAppNotifications}
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  {unreadCount}
                </Badge>
              )}
            </CardTitle>
            {notifications.length > 0 && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t.alert.notification.markAllRead}
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t.alert.notification.clearAll}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Wifi className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground">
                {t.alert.noHistory}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.alert.noHistoryDescription}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <InAppNotificationItem
                  key={notification.id}
                  notification={notification}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ----- 브라우저 알림 권한 카드 -----

interface NotificationPermissionCardProps {
  permission: NotificationPermission;
  onRequestPermission: () => Promise<void>;
}

/**
 * 브라우저 알림 권한 설정 카드
 *
 * 현재 알림 권한 상태를 표시하고 권한 요청 버튼을 제공한다.
 *
 * @see 요구사항 6.4 (브라우저 알림 권한)
 */
function NotificationPermissionCard({
  permission,
  onRequestPermission,
}: NotificationPermissionCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {permission === 'granted' ? (
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-profit" aria-hidden="true" />
          ) : permission === 'denied' ? (
            <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-loss" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-foreground">
              {t.alert.notification.title}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {permission === 'granted'
                ? t.alert.notification.permissionGranted
                : permission === 'denied'
                  ? t.alert.notification.permissionDenied
                  : t.alert.notification.permissionDefault}
            </p>
          </div>
          {permission === 'default' && (
            <Button size="sm" onClick={onRequestPermission}>
              <Bell className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t.alert.notification.requestPermission}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ----- 인앱 알림 항목 -----

interface InAppNotificationItemProps {
  notification: InAppNotification;
}

/**
 * 인앱 알림 개별 항목
 *
 * WebSocket을 통해 수신된 알림을 리스트 형태로 표시한다.
 * 읽지 않은 알림은 시각적으로 구분된다.
 */
function InAppNotificationItem({ notification }: InAppNotificationItemProps) {
  const { notification: data, receivedAt, isRead } = notification;

  const formattedTime = receivedAt.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className={cn(
        'py-3 transition-colors',
        !isRead && 'bg-primary/5',
      )}
    >
      <div className="flex items-start gap-2">
        <BellRing
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            !isRead ? 'text-primary' : 'text-muted-foreground',
          )}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {data.symbol}
            </Badge>
            {!isRead && (
              <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            )}
          </div>
          <p className="mt-1 text-sm text-foreground">{data.message}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{formattedTime}</p>
        </div>
      </div>
    </div>
  );
}

// ===== 유틸리티 함수 =====

/**
 * 알림 조건에 대한 표시 레이블을 반환한다.
 */
function getConditionLabel(
  condition: AlertCondition,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (condition) {
    case 'above':
      return t.alert.conditionAbove;
    case 'below':
      return t.alert.conditionBelow;
    case 'premium_above':
      return t.alert.premiumAbove;
    case 'premium_below':
      return t.alert.premiumBelow;
    default:
      return String(condition);
  }
}

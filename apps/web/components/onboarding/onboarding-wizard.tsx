/**
 * 온보딩 마법사 컴포넌트
 *
 * 최초 로그인 사용자에게 3단계 온보딩 가이드를 제공한다.
 * 1단계: 거래소 선택 (업비트, 빗썸, 코인원 중 선택, 건너뛰기 가능)
 * 2단계: API 키 입력 (선택한 거래소의 API 키 등록)
 * 3단계: 자산 조회 확인 (등록된 키로 실제 조회 가능 여부 확인)
 *
 * API 키를 등록하지 않은 사용자에게는 데모 모드를 통해
 * 고정 모의 데이터로 서비스를 체험할 수 있도록 한다.
 *
 * @see 요구사항 11.1 (단계별 온보딩 가이드)
 * @see 요구사항 11.2 (특정 거래소 건너뛰기)
 * @see 요구사항 11.3 (데모 데이터 미리보기 모드)
 * @see 요구사항 11.4 (온보딩 완료 후 대시보드 이동)
 */

'use client';

import { useCallback, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Play,
  Shield,
  XCircle,
} from 'lucide-react';
import type { ExchangeType, ApiKeyPair } from '@bitscope/shared';
import { DOMESTIC_EXCHANGES, FOREIGN_EXCHANGES, DEX_EXCHANGES } from '@bitscope/shared';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { getExchangeName, generateUUID } from '@/lib/utils';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import type { UseOnboardingReturn } from '@/hooks/useOnboarding';
import {
  encryptApiKey,
  storeEncryptedKey,
  loadEncryptedKey,
  getCachedEncryptionKey,
  cacheEncryptionKey,
  getRegisteredExchanges,
} from '@/lib/crypto/encryption-service';
import { deriveEncryptionKey } from '@/lib/crypto/key-derivation';
import { createSigner } from '@/lib/exchange/signer-factory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/** OnboardingWizard Props */
interface OnboardingWizardProps {
  /** useOnboarding 훅에서 반환된 온보딩 상태 및 제어 함수 */
  onboarding: UseOnboardingReturn;
  /** 지갑 주소 */
  walletAddress: string;
}

/**
 * 온보딩 마법사 메인 컴포넌트
 *
 * 현재 스텝에 따라 적절한 스텝 컴포넌트를 렌더링한다.
 */
export function OnboardingWizard({ onboarding, walletAddress }: OnboardingWizardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* 헤더 영역 */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <BarChart3 className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t.onboarding.welcome}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.onboarding.welcomeDescription}
          </p>
        </div>

        {/* 스텝 인디케이터 */}
        <StepIndicator
          currentStepIndex={onboarding.currentStepIndex}
          totalSteps={onboarding.totalSteps}
        />

        {/* 현재 스텝 컨텐츠 */}
        {onboarding.currentStep === 'exchange-select' && (
          <ExchangeSelectStep
            onboarding={onboarding}
          />
        )}
        {onboarding.currentStep === 'api-key' && (
          <ApiKeyStep
            onboarding={onboarding}
            walletAddress={walletAddress}
          />
        )}
        {onboarding.currentStep === 'verify' && (
          <VerifyStep
            onboarding={onboarding}
            walletAddress={walletAddress}
          />
        )}

        {/* 데모 모드 카드 (거래소 선택 스텝에서만 표시) */}
        {onboarding.currentStep === 'exchange-select' && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 p-4 text-center">
              <Play className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t.onboarding.demoMode}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.onboarding.demoModeDescription}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onboarding.activateDemoMode}
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                {t.onboarding.demoMode}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ===== 스텝 인디케이터 =====

interface StepIndicatorProps {
  currentStepIndex: number;
  totalSteps: number;
}

/**
 * 온보딩 진행 상황 인디케이터
 *
 * 3개 스텝의 현재 위치를 시각적으로 표시한다.
 */
function StepIndicator({ currentStepIndex, totalSteps }: StepIndicatorProps) {
  const { t } = useTranslation();
  const steps = [t.onboarding.step1, t.onboarding.step2, t.onboarding.step3];

  return (
    <div className="flex items-center justify-center gap-2" role="navigation" aria-label="온보딩 진행 단계">
      {steps.map((label, index) => {
        const isActive = index === currentStepIndex;
        const isCompleted = index < currentStepIndex;

        return (
          <div key={label} className="flex items-center gap-2">
            {/* 스텝 번호/체크 */}
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                isCompleted
                  ? 'bg-primary text-primary-foreground'
                  : isActive
                    ? 'border-2 border-primary bg-background text-primary'
                    : 'border border-border bg-muted text-muted-foreground'
              }`}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${label} ${isCompleted ? '(완료)' : isActive ? '(현재)' : ''}`}
            >
              {isCompleted ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                index + 1
              )}
            </div>

            {/* 스텝 이름 (모바일에서는 현재 스텝만 표시) */}
            <span
              className={`text-xs font-medium hidden sm:inline ${
                isActive ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {label}
            </span>

            {/* 구분선 (마지막 제외) */}
            {index < totalSteps - 1 && (
              <div
                className={`h-px w-6 sm:w-10 ${
                  isCompleted ? 'bg-primary' : 'bg-border'
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===== 스텝 1: 거래소 선택 =====

interface ExchangeSelectStepProps {
  onboarding: UseOnboardingReturn;
}

/**
 * 거래소 선택 스텝
 *
 * 사용자가 사용 중인 거래소를 선택한다.
 * 최소 1개 이상 선택하거나 건너뛸 수 있다.
 *
 * @see 요구사항 11.1 (거래소 선택)
 * @see 요구사항 11.2 (거래소 건너뛰기 허용)
 */
function ExchangeSelectStep({ onboarding }: ExchangeSelectStepProps) {
  const { t, locale } = useTranslation();

  const groups = [
    { label: t.dashboard.domesticLabel, exchanges: DOMESTIC_EXCHANGES as readonly ExchangeType[], highlight: true },
    { label: t.dashboard.foreignLabel, exchanges: FOREIGN_EXCHANGES as readonly ExchangeType[], highlight: false },
    { label: t.dashboard.dexLabel, exchanges: DEX_EXCHANGES as readonly ExchangeType[], highlight: false },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t.onboarding.step1}</CardTitle>
        <CardDescription>{t.onboarding.step1Description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className={`text-sm font-semibold mb-2 ${group.highlight ? 'text-primary' : 'text-muted-foreground'}`}>
              {group.label}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {group.exchanges.map((exchange) => {
                const isSelected = onboarding.selectedExchanges.includes(exchange);
                return (
                  <button
                    key={exchange}
                    type="button"
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : group.highlight
                          ? 'border-primary/30 bg-background hover:bg-primary/5'
                          : 'border-border bg-background hover:bg-accent'
                    }`}
                    onClick={() => onboarding.toggleExchange(exchange)}
                    aria-pressed={isSelected}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}
                    >
                      {isSelected ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Key className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>
                    <span className="text-xs font-medium text-foreground">{getExchangeName(exchange, locale)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onboarding.skipOnboarding}>
          {t.onboarding.skipAll}
        </Button>
        <Button
          onClick={onboarding.goToNextStep}
          disabled={onboarding.selectedExchanges.length === 0}
        >
          {t.common.next}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// ===== 거래소별 API Key 카드 =====

interface ExchangeKeyCardProps {
  exchange: ExchangeType;
  form: ExchangeKeyFormState;
  locale: string;
  t: ReturnType<typeof useTranslation>['t'];
  isProcessing: boolean;
  onUpdateForm: (exchange: ExchangeType, update: Partial<ExchangeKeyFormState>) => void;
  onRegister: (exchange: ExchangeType) => void;
}

function ExchangeKeyCard({ exchange, form, locale, t, isProcessing, onUpdateForm, onRegister }: ExchangeKeyCardProps) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{getExchangeName(exchange, locale)}</span>
        {form.isRegistered && (
          <Badge variant="success" className="gap-1 text-[10px]">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {t.apiKey.settingsPage.connected}
          </Badge>
        )}
      </div>

      {form.isRegistered ? (
        <p className="text-xs text-muted-foreground">{t.apiKey.settingsPage.registerSuccess}</p>
      ) : (
        <>
          <Input
            id={`${exchange}-access-key`}
            type="text"
            placeholder={t.apiKey.settingsPage.accessKeyPlaceholder}
            value={form.accessKey}
            onChange={(e) => onUpdateForm(exchange, { accessKey: e.target.value, error: null })}
            disabled={isProcessing}
            autoComplete="off"
            spellCheck={false}
            className="h-8 text-xs"
          />
          <div className="relative">
            <Input
              id={`${exchange}-secret-key`}
              type={form.showSecretKey ? 'text' : 'password'}
              placeholder={t.apiKey.settingsPage.secretKeyPlaceholder}
              value={form.secretKey}
              onChange={(e) => onUpdateForm(exchange, { secretKey: e.target.value, error: null })}
              disabled={isProcessing}
              autoComplete="off"
              spellCheck={false}
              className="h-8 pr-8 text-xs"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => onUpdateForm(exchange, { showSecretKey: !form.showSecretKey })}
            >
              {form.showSecretKey ? (
                <EyeOff className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Eye className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          </div>

          {form.error && (
            <div className="flex items-center gap-1.5 text-[10px] text-red-600 dark:text-red-400" role="alert">
              <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{form.error}</span>
            </div>
          )}

          <Button
            size="sm"
            onClick={() => onRegister(exchange)}
            disabled={isProcessing || !form.accessKey.trim() || !form.secretKey.trim()}
            className="w-full h-7 text-xs"
          >
            {isProcessing && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
            {form.isValidating ? t.apiKey.validating
              : form.isRegistering ? t.apiKey.settingsPage.registering
              : t.apiKey.settingsPage.registerButton}
          </Button>
        </>
      )}
    </div>
  );
}

// ===== 스텝 2: API 키 입력 =====

interface ApiKeyStepProps {
  onboarding: UseOnboardingReturn;
  walletAddress: string;
}

/** 각 거래소별 키 입력 상태 */
interface ExchangeKeyFormState {
  accessKey: string;
  secretKey: string;
  showSecretKey: boolean;
  isValidating: boolean;
  isRegistering: boolean;
  isRegistered: boolean;
  error: string | null;
}

/**
 * API 키 입력 스텝
 *
 * 선택한 거래소에 대해 API 키를 입력하고 등록한다.
 * 각 거래소를 개별적으로 건너뛸 수 있다.
 *
 * @see 요구사항 11.1 (API 키 입력)
 * @see 요구사항 11.2 (특정 거래소 건너뛰기)
 */
function ApiKeyStep({ onboarding, walletAddress }: ApiKeyStepProps) {
  const { t, locale } = useTranslation();
  const { signMessage } = useWalletAuth();

  /** 거래소별 폼 상태 */
  const [forms, setForms] = useState<Record<string, ExchangeKeyFormState>>(() => {
    const initial: Record<string, ExchangeKeyFormState> = {};
    for (const exchange of onboarding.selectedExchanges) {
      // 이미 등록된 키가 있는지 확인
      const isAlreadyRegistered = !!loadEncryptedKey(walletAddress, exchange);
      initial[exchange] = {
        accessKey: '',
        secretKey: '',
        showSecretKey: false,
        isValidating: false,
        isRegistering: false,
        isRegistered: isAlreadyRegistered,
        error: null,
      };
    }
    return initial;
  });

  /** 폼 상태 업데이트 헬퍼 */
  const updateForm = useCallback(
    (exchange: ExchangeType, update: Partial<ExchangeKeyFormState>) => {
      setForms((prev) => {
        const existing = prev[exchange];
        if (!existing) return prev;
        return {
          ...prev,
          [exchange]: { ...existing, ...update },
        };
      });
    },
    [],
  );

  /**
   * 암호화 키를 확보한다.
   *
   * sessionStorage에 캐싱된 키가 있으면 사용하고,
   * 없으면 지갑 서명을 요청하여 새로 도출한다.
   */
  const ensureEncryptionKey = useCallback(async (): Promise<string> => {
    const cachedKey = getCachedEncryptionKey();
    if (cachedKey) return cachedKey;

    const derivation = await deriveEncryptionKey(walletAddress, signMessage);
    cacheEncryptionKey(derivation.derivedKey);
    return derivation.derivedKey;
  }, [walletAddress, signMessage]);

  /**
   * API 키를 등록한다.
   *
   * 유효성 검증 후 암호화하여 localStorage에 저장한다.
   */
  const handleRegister = useCallback(
    async (exchange: ExchangeType) => {
      const form = forms[exchange];
      if (!form || !form.accessKey.trim() || !form.secretKey.trim()) return;

      const apiKeyPair: ApiKeyPair = {
        accessKey: form.accessKey.trim(),
        secretKey: form.secretKey.trim(),
      };

      updateForm(exchange, { isValidating: true, error: null });

      try {
        // 유효성 검증
        const signer = createSigner(exchange);
        const validationResult = await signer.validateApiKey(apiKeyPair);

        if (!validationResult.isValid) {
          updateForm(exchange, {
            isValidating: false,
            error: validationResult.errorMessage || t.apiKey.invalid,
          });
          return;
        }

        // 암호화 키 확보
        updateForm(exchange, { isValidating: false, isRegistering: true });
        const encryptionKey = await ensureEncryptionKey();

        // 암호화 후 저장
        const encrypted = encryptApiKey(apiKeyPair, encryptionKey);
        const existingStored = loadEncryptedKey(walletAddress, exchange);
        const nonce = existingStored?.nonce || generateUUID();
        storeEncryptedKey(walletAddress, exchange, encrypted, nonce);

        updateForm(exchange, {
          isRegistering: false,
          isRegistered: true,
          accessKey: '',
          secretKey: '',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : t.apiKey.settingsPage.registerFailed;
        updateForm(exchange, {
          isValidating: false,
          isRegistering: false,
          error: message,
        });
      }
    },
    [forms, walletAddress, ensureEncryptionKey, updateForm, t],
  );

  /** 하나 이상의 거래소가 등록되었는지 확인 */
  const hasAnyRegistered = Object.values(forms).some((f) => f.isRegistered);

  /** 모든 거래소가 등록 또는 처리 완료되었는지 확인 */
  const _allProcessed = Object.values(forms).every(
    (f) => f.isRegistered || !f.accessKey,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t.onboarding.step2}</CardTitle>
        <CardDescription>{t.onboarding.step2Description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 보안 안내 */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <Shield
            className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
            aria-hidden="true"
          />
          <p className="text-xs text-muted-foreground">
            {t.apiKey.settingsPage.securityNoticeDescription}
          </p>
        </div>

        {/* IP Whitelist 안내 (국내 거래소 선택 시) */}
        {onboarding.selectedExchanges.some((ex) => ['upbit', 'bithumb', 'coinone'].includes(ex)) && (
          <div className="flex items-start gap-3 rounded-lg border-2 border-blue-400 bg-blue-50 px-4 py-3 text-sm dark:border-blue-600 dark:bg-blue-950/30">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <div>
              <p className="font-semibold text-blue-800 dark:text-blue-300">
                API Key 발급 시 IP Whitelist 등록 필수
              </p>
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
                국내 거래소에서 API Key를 발급받을 때 아래 IP를 반드시 허용 목록에 추가하세요.
              </p>
              <p className="mt-2 select-all rounded bg-blue-100 px-3 py-1.5 font-mono text-base font-bold text-blue-900 dark:bg-blue-900/50 dark:text-blue-200">
                158.179.168.88
              </p>
            </div>
          </div>
        )}

        {/* 거래소별 API 키 입력 폼 (그룹별 카드뷰) */}
        {[
          { label: t.dashboard.domesticLabel, exchanges: DOMESTIC_EXCHANGES as readonly ExchangeType[] },
          { label: t.dashboard.foreignLabel, exchanges: FOREIGN_EXCHANGES as readonly ExchangeType[] },
          { label: t.dashboard.dexLabel, exchanges: DEX_EXCHANGES as readonly ExchangeType[] },
        ].map((group) => {
          const groupExchanges = onboarding.selectedExchanges.filter(
            (ex) => (group.exchanges as readonly string[]).includes(ex),
          );
          if (groupExchanges.length === 0) return null;

          return (
            <div key={group.label} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
              <div className="grid grid-cols-1 gap-3">
                {groupExchanges.map((exchange) => {
                  const form = forms[exchange];
                  if (!form) return null;
                  return (
                    <ExchangeKeyCard
                      key={exchange}
                      exchange={exchange}
                      form={form}
                      locale={locale}
                      t={t}
                      isProcessing={form.isValidating || form.isRegistering}
                      onUpdateForm={updateForm}
                      onRegister={handleRegister}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
      <CardFooter className="flex justify-between gap-2">
        <Button
          variant="ghost"
          onClick={onboarding.goToPreviousStep}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.common.previous}
        </Button>
        <div className="flex gap-2">
          {!hasAnyRegistered && (
            <Button
              variant="outline"
              onClick={onboarding.goToNextStep}
            >
              {t.onboarding.proceedWithoutKeys}
            </Button>
          )}
          {hasAnyRegistered && (
            <Button onClick={onboarding.goToNextStep}>
              {t.common.next}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

// ===== 스텝 3: 자산 조회 확인 =====

interface VerifyStepProps {
  onboarding: UseOnboardingReturn;
  walletAddress: string;
}

/**
 * 자산 조회 확인 스텝
 *
 * 등록된 API 키로 거래소 자산이 정상 조회되는지 확인한다.
 * API 키가 없는 경우에도 완료할 수 있다 (설정에서 나중에 등록 가능).
 *
 * @see 요구사항 11.1 (자산 조회 확인)
 * @see 요구사항 11.4 (온보딩 완료 후 대시보드 이동)
 */
function VerifyStep({ onboarding, walletAddress }: VerifyStepProps) {
  const { t, locale } = useTranslation();

  /** 등록된 거래소 목록 확인 */
  const registeredExchanges = getRegisteredExchanges(walletAddress);
  const hasRegisteredKeys = registeredExchanges.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t.onboarding.step3}</CardTitle>
        <CardDescription>{t.onboarding.step3Description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasRegisteredKeys ? (
          <>
            {/* 등록된 거래소 목록 표시 */}
            <div className="space-y-2">
              {registeredExchanges.map((exchange) => {
                return (
                  <div
                    key={exchange}
                    className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30"
                  >
                    <CheckCircle2
                      className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400"
                      aria-hidden="true"
                    />
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {getExchangeName(exchange, locale)}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {t.apiKey.settingsPage.registerSuccess}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 건너뛴 거래소 표시 */}
            {onboarding.selectedExchanges
              .filter((e) => !registeredExchanges.includes(e))
              .length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-xs text-amber-800 dark:text-amber-400">
                  {t.onboarding.verifyFailed}
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <p className="text-xs text-muted-foreground">
                {t.onboarding.verifySuccess}
              </p>
            </div>
          </>
        ) : (
          /* API 키 미등록 상태 */
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Key className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {t.onboarding.noExchangeSelected}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.onboarding.demoModeDescription}
              </p>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between gap-2">
        <Button
          variant="ghost"
          onClick={onboarding.goToPreviousStep}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.common.previous}
        </Button>
        <div className="flex gap-2">
          {!hasRegisteredKeys && (
            <Button
              variant="outline"
              onClick={onboarding.activateDemoMode}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {t.onboarding.demoMode}
            </Button>
          )}
          <Button onClick={onboarding.completeOnboarding}>
            {hasRegisteredKeys
              ? t.onboarding.completeAndGo
              : t.onboarding.complete}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

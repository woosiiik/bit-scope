/**
 * API Key 등록/관리 페이지
 *
 * 8개 거래소(업비트, 빗썸, 코인원, 바이낸스, 바이빗, OKX, Gate.io, Bitget)의 API Key를 안전하게 등록/관리하는 페이지이다.
 * 지갑 서명 기반 암호화로 API Key를 localStorage에 안전하게 저장하며,
 * 거래소 API를 통해 Key 유효성을 검증한다.
 *
 * 주요 기능:
 * - 거래소별 API Key 입력 폼 (Access Key, Secret Key)
 * - API Key 등록 시 유효성 검증 (거래소 API 호출)
 * - 지갑 서명 기반 AES 암호화 후 localStorage 저장
 * - Read-Only 권한이 아닌 키 등록 시 보안 경고
 * - Secret Key 마스킹 표시 (****abcd)
 * - 등록된 API Key 목록 (거래소명, 등록일, 연결 상태)
 * - API Key 삭제
 * - 거래소별 API Key 발급 가이드
 *
 * @see 요구사항 1.1 ~ 1.9 (거래소 API 키 관리)
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Plus,
  Shield,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import type { ExchangeType, ApiKeyPair } from '@bitscope/shared';
import { SUPPORTED_EXCHANGES } from '@bitscope/shared';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useTranslation } from '@/lib/i18n/i18n-context';
import {
  encryptApiKey,
  decryptApiKey,
  storeEncryptedKey,
  loadEncryptedKey,
  removeEncryptedKey,
  getRegisteredExchanges,
  getCachedEncryptionKey,
  getCachedEncryptionNonce,
  cacheEncryptionKey,
  loadWalletNonce,
  type StoredApiKeyData,
} from '@/lib/crypto/encryption-service';
import { deriveEncryptionKey } from '@/lib/crypto/key-derivation';
import { createSigner } from '@/lib/exchange/signer-factory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TelegramSection } from '@/components/settings/telegram-section';

/** 거래소별 API Key 등록 상태 */
interface RegisteredKeyInfo {
  exchange: ExchangeType;
  registeredAt: string;
  /** 연결 상태: 'connected'(유효), 'error'(무효), 'checking'(확인 중), 'unknown'(미확인) */
  status: 'connected' | 'error' | 'checking' | 'unknown';
  /** 마스킹된 Access Key */
  maskedAccessKey: string;
  /** 마스킹된 Secret Key */
  maskedSecretKey: string;
  /** 오류 메시지 (상태가 error인 경우) */
  errorMessage?: string;
}

/** API Key 등록 폼 상태 */
/** Passphrase가 필요한 거래소 */
const PASSPHRASE_EXCHANGES: ExchangeType[] = ['okx', 'bitget'];

interface RegisterFormState {
  exchange: ExchangeType | '';
  accessKey: string;
  secretKey: string;
  passphrase: string;
  isValidating: boolean;
  isRegistering: boolean;
  showSecretKey: boolean;
  validationResult: {
    isValid: boolean;
    isReadOnly: boolean;
    errorMessage?: string;
  } | null;
}

/**
 * Secret Key를 마스킹 처리한다.
 *
 * 마지막 4자를 제외한 나머지를 ****로 대체한다.
 * 4자 이하인 경우 전부 ****로 대체한다.
 *
 * @param key 원본 키 문자열
 * @returns 마스킹된 키 문자열 (예: "****abcd")
 */
function maskKey(key: string): string {
  if (!key || key.length <= 4) {
    return '****';
  }
  return '****' + key.slice(-4);
}

/**
 * 거래소 이름을 현재 언어로 반환한다.
 *
 * @param exchange 거래소 식별자
 * @param t 번역 메시지 객체
 * @returns 거래소 한글/영문 이름
 */
function getExchangeDisplayName(
  exchange: ExchangeType,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return t.exchange[exchange];
}

/**
 * API Key 등록/관리 페이지 컴포넌트
 */
export default function SettingsPage() {
  const { wallet, signMessage } = useWalletAuth();
  const { t } = useTranslation();

  /** 등록된 API Key 목록 */
  const [registeredKeys, setRegisteredKeys] = useState<RegisteredKeyInfo[]>([]);

  /** 등록 폼 표시 여부 */
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  /** 삭제 확인 대화상자 대상 거래소 */
  const [deleteTarget, setDeleteTarget] = useState<ExchangeType | null>(null);

  /** 등록 폼 상태 */
  const [form, setForm] = useState<RegisterFormState>({
    exchange: '',
    accessKey: '',
    secretKey: '',
    passphrase: '',
    isValidating: false,
    isRegistering: false,
    showSecretKey: false,
    validationResult: null,
  });

  /** 알림 메시지 */
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  /** API 키 발급 가이드 표시 여부 */
  const [showGuide, setShowGuide] = useState(false);

  /** 알림 자동 제거 타이머 (컴포넌트 언마운트 시 정리용) */
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 컴포넌트 언마운트 시 알림 타이머 정리 */
  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    };
  }, []);

  /**
   * 등록된 API Key 목록을 로드한다.
   *
   * localStorage에서 현재 지갑 주소에 등록된 거래소 목록을 조회하고,
   * 각 거래소의 등록 정보(마스킹된 키, 등록일, 상태)를 구성한다.
   */
  const loadRegisteredKeys = useCallback(() => {
    if (!wallet.address) return;

    const exchanges = getRegisteredExchanges(wallet.address);
    const keys: RegisteredKeyInfo[] = [];

    for (const exchange of exchanges) {
      const stored = loadEncryptedKey(wallet.address, exchange);
      if (stored) {
        // 암호화 키가 있으면 복호화를 시도하여 마스킹된 키를 표시
        const encryptionKey = getCachedEncryptionKey();
        let maskedAccessKey = '****';
        let maskedSecretKey = '****';

        if (encryptionKey) {
          try {
            const decrypted = decryptApiKey(
              {
                encryptedAccessKey: stored.encryptedAccessKey,
                encryptedSecretKey: stored.encryptedSecretKey,
                iv: stored.iv,
              },
              encryptionKey,
            );
            maskedAccessKey = maskKey(decrypted.accessKey);
            maskedSecretKey = maskKey(decrypted.secretKey);
          } catch {
            // 복호화 실패 시 기본 마스킹 유지
          }
        }

        keys.push({
          exchange,
          registeredAt: stored.registeredAt,
          status: 'unknown',
          maskedAccessKey,
          maskedSecretKey,
        });
      }
    }

    setRegisteredKeys(keys);
  }, [wallet.address]);

  /** 컴포넌트 마운트 시 등록된 키 목록 로드 */
  useEffect(() => {
    loadRegisteredKeys();
  }, [loadRegisteredKeys]);

  /**
   * 알림 메시지를 표시한 후 일정 시간 후 자동 제거한다.
   */
  const showNotification = useCallback(
    (type: 'success' | 'error', message: string) => {
      // 기존 타이머가 있으면 정리
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
      setNotification({ type, message });
      notificationTimerRef.current = setTimeout(() => {
        setNotification(null);
        notificationTimerRef.current = null;
      }, 5000);
    },
    [],
  );

  /**
   * 암호화 키 확보를 보장한다.
   *
   * sessionStorage에 캐싱된 암호화 키가 있으면 그것을 사용하고,
   * 없으면 지갑 서명을 요청하여 새로 도출한다.
   *
   * @param storedData 기존 저장된 API Key 데이터 (nonce 재사용)
   * @returns 도출된 암호화 키
   */
  const ensureEncryptionKey = useCallback(
    async (storedData?: StoredApiKeyData | null): Promise<{ key: string; nonce: string }> => {
      // 1. sessionStorage에 캐싱된 키가 있으면 사용 (서명 불필요)
      const cachedKey = getCachedEncryptionKey();
      const cachedNonce = getCachedEncryptionNonce();

      if (cachedKey && cachedNonce) {
        return { key: cachedKey, nonce: cachedNonce };
      }

      // 2. 기존 nonce 찾기: 지갑 단위 nonce → storedData nonce 순으로 조회
      const walletNonce = loadWalletNonce(wallet.address);
      const existingNonce = walletNonce ?? storedData?.nonce ?? undefined;

      // 3. 지갑 서명을 통해 암호화 키를 도출 (기존 nonce 있으면 재사용)
      const derivation = await deriveEncryptionKey(
        wallet.address,
        signMessage,
        existingNonce,
      );

      // 4. 도출된 키와 nonce를 sessionStorage에 캐싱
      cacheEncryptionKey(derivation.derivedKey, derivation.nonce);

      return { key: derivation.derivedKey, nonce: derivation.nonce };
    },
    [wallet.address, signMessage],
  );

  /**
   * API Key 등록 폼을 초기화한다.
   */
  const resetForm = useCallback(() => {
    setForm({
      exchange: '',
      accessKey: '',
      secretKey: '',
      passphrase: '',
      isValidating: false,
      isRegistering: false,
      showSecretKey: false,
      validationResult: null,
    });
  }, []);

  /**
   * 등록 폼을 열면서 이미 등록된 거래소를 제외한다.
   */
  const handleOpenRegisterForm = useCallback(() => {
    resetForm();
    setShowRegisterForm(true);
  }, [resetForm]);

  /**
   * 등록 폼을 닫는다.
   */
  const handleCloseRegisterForm = useCallback(() => {
    setShowRegisterForm(false);
    resetForm();
  }, [resetForm]);

  /**
   * API Key를 등록한다.
   *
   * 등록 프로세스:
   * 1. 암호화 키 확보 (sessionStorage 캐시 또는 지갑 서명)
   * 2. 거래소 API를 통해 Key 유효성 검증
   * 3. Read-Only 권한 확인 (비-Read-Only 시 경고)
   * 4. AES 암호화 후 localStorage 저장
   *
   * @see 요구사항 1.2 (API 키 유효성 검증)
   * @see 요구사항 1.3 (검증 실패 원인 안내)
   * @see 요구사항 1.4 (지갑 서명 기반 암호화 후 localStorage 저장)
   * @see 요구사항 1.7 (Read-Only 아닌 키 보안 경고)
   */
  const handleRegister = useCallback(async () => {
    if (!form.exchange || !form.accessKey || !form.secretKey) return;

    const exchange = form.exchange as ExchangeType;
    const needsPassphrase = PASSPHRASE_EXCHANGES.includes(exchange);

    // Passphrase가 필요한 거래소인데 입력 안 했으면 중단
    if (needsPassphrase && !form.passphrase) return;

    // OKX/Bitget: secretKey에 passphrase를 "|||"로 합쳐서 저장
    const finalSecretKey = needsPassphrase
      ? `${form.secretKey}|||${form.passphrase}`
      : form.secretKey;

    const apiKeyPair: ApiKeyPair = {
      accessKey: form.accessKey,
      secretKey: finalSecretKey,
    };

    setForm((prev) => ({ ...prev, isValidating: true, validationResult: null }));

    try {
      // 1. API Key 유효성 검증 (거래소 API 호출)
      const signer = createSigner(exchange);
      const validationResult = await signer.validateApiKey(apiKeyPair);

      setForm((prev) => ({
        ...prev,
        isValidating: false,
        validationResult: {
          isValid: validationResult.isValid,
          isReadOnly: validationResult.isReadOnly,
          errorMessage: validationResult.errorMessage,
        },
      }));

      if (!validationResult.isValid) {
        // 검증 실패 시 원인 안내
        showNotification(
          'error',
          validationResult.errorMessage || t.apiKey.settingsPage.registerFailed,
        );
        return;
      }

      // 2. Read-Only 권한 확인
      // 비-Read-Only 키도 등록 가능하지만 경고 표시 (validateApiKey에서 isReadOnly를 확인)
      // UI에서 경고를 표시하되 등록 절차는 계속 진행

      // 3. 암호화 키 확보 (지갑 서명)
      setForm((prev) => ({ ...prev, isRegistering: true }));
      const { key: encryptionKey, nonce } = await ensureEncryptionKey();

      // 4. AES 암호화
      const encrypted = encryptApiKey(apiKeyPair, encryptionKey);

      // 5. localStorage 저장 (암호화에 사용된 nonce와 동일한 nonce를 저장)
      storeEncryptedKey(wallet.address, exchange, encrypted, nonce);

      // 7. 폼 초기화 및 성공 알림
      handleCloseRegisterForm();
      loadRegisteredKeys();
      showNotification('success', t.apiKey.settingsPage.registerSuccess);
    } catch (error) {
      setForm((prev) => ({ ...prev, isValidating: false, isRegistering: false }));
      const message =
        error instanceof Error ? error.message : t.apiKey.settingsPage.registerFailed;
      showNotification('error', message);
    }
  }, [
    form.exchange,
    form.accessKey,
    form.secretKey,
    wallet.address,
    ensureEncryptionKey,
    handleCloseRegisterForm,
    loadRegisteredKeys,
    showNotification,
    t,
  ]);

  /**
   * API Key를 삭제한다.
   *
   * 해당 거래소의 암호화된 API Key와 관련 데이터를 즉시 삭제한다.
   *
   * @param exchange 삭제할 거래소 식별자
   * @see 요구사항 1.5 (API 키 삭제 시 관련 데이터 즉시 삭제)
   */
  const handleDelete = useCallback(
    (exchange: ExchangeType) => {
      removeEncryptedKey(wallet.address, exchange);
      setDeleteTarget(null);
      loadRegisteredKeys();
      showNotification('success', t.apiKey.settingsPage.deleteSuccess);
    },
    [wallet.address, loadRegisteredKeys, showNotification, t],
  );

  /**
   * 등록 가능한 거래소 목록을 반환한다.
   *
   * 이미 등록된 거래소를 제외하고 반환한다.
   */
  const availableExchanges = SUPPORTED_EXCHANGES.filter(
    (ex) => !registeredKeys.some((k) => k.exchange === ex),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t.apiKey.settingsPage.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.apiKey.settingsPage.description}
        </p>
      </div>

      {/* 알림 메시지 */}
      {notification && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            notification.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'
          }`}
          role="alert"
          aria-live="polite"
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* 보안 안내 */}
      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
            <Shield
              className="h-5 w-5 text-green-600 dark:text-green-400"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {t.apiKey.settingsPage.securityNotice}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.apiKey.settingsPage.securityNoticeDescription}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 등록된 API Key 목록 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {t.apiKey.register}
          </h2>
          {availableExchanges.length > 0 && (
            <Button
              onClick={handleOpenRegisterForm}
              size="sm"
              disabled={showRegisterForm}
              aria-label={t.apiKey.settingsPage.registerNew}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t.apiKey.settingsPage.registerNew}
            </Button>
          )}
        </div>

        {registeredKeys.length === 0 && !showRegisterForm ? (
          /* 등록된 키가 없는 경우 */
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Key className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                {t.apiKey.settingsPage.noKeys}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.apiKey.settingsPage.noKeysDescription}
              </p>
              <Button
                onClick={handleOpenRegisterForm}
                className="mt-4"
                aria-label={t.apiKey.settingsPage.registerNew}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t.apiKey.settingsPage.registerNew}
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* 등록된 키 목록 */
          <div className="space-y-3">
            {registeredKeys.map((keyInfo) => (
              <RegisteredKeyCard
                key={keyInfo.exchange}
                keyInfo={keyInfo}
                deleteTarget={deleteTarget}
                onDeleteRequest={() => setDeleteTarget(keyInfo.exchange)}
                onDeleteConfirm={() => handleDelete(keyInfo.exchange)}
                onDeleteCancel={() => setDeleteTarget(null)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* API Key 등록 폼 */}
      {showRegisterForm && (
        <RegisterForm
          form={form}
          setForm={setForm}
          availableExchanges={availableExchanges}
          onRegister={handleRegister}
          onCancel={handleCloseRegisterForm}
          t={t}
        />
      )}

      {/* API 키 발급 가이드 */}
      <Card>
        <CardHeader>
          <button
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowGuide(!showGuide)}
            aria-expanded={showGuide}
            aria-controls="api-key-guide"
          >
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">
                {t.apiKey.settingsPage.guideTitle}
              </CardTitle>
            </div>
            <span className="text-sm text-muted-foreground">
              {showGuide ? '-' : '+'}
            </span>
          </button>
          <CardDescription>
            {t.apiKey.settingsPage.guideDescription}
          </CardDescription>
        </CardHeader>
        {showGuide && (
          <CardContent id="api-key-guide">
            <div className="space-y-4">
              {SUPPORTED_EXCHANGES.map((exchange) => (
                <ExchangeGuide key={exchange} exchange={exchange} t={t} />
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 텔레그램 알림 섹션 */}
      <TelegramSection />
    </div>
  );
}

// ============================================================
// RegisteredKeyCard - 등록된 API Key 카드
// ============================================================

/** RegisteredKeyCard Props */
interface RegisteredKeyCardProps {
  keyInfo: RegisteredKeyInfo;
  deleteTarget: ExchangeType | null;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}

/**
 * 등록된 API Key 카드 컴포넌트
 *
 * 거래소명, 등록일, 연결 상태, 마스킹된 키 정보를 표시한다.
 * 삭제 버튼과 삭제 확인 다이얼로그를 제공한다.
 *
 * @see 요구사항 1.6 (Secret Key 마스킹 표시)
 * @see 요구사항 1.9 (등록된 API 키 목록 조회)
 */
function RegisteredKeyCard({
  keyInfo,
  deleteTarget,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  t,
}: RegisteredKeyCardProps) {
  const isDeleting = deleteTarget === keyInfo.exchange;

  /** 연결 상태 배지 */
  const statusBadge = () => {
    switch (keyInfo.status) {
      case 'connected':
        return <Badge variant="success">{t.apiKey.settingsPage.connected}</Badge>;
      case 'error':
        return <Badge variant="destructive">{t.apiKey.settingsPage.error}</Badge>;
      case 'checking':
        return (
          <Badge variant="secondary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
            {t.apiKey.validating}
          </Badge>
        );
      default:
        return <Badge variant="outline">{t.apiKey.settingsPage.connected}</Badge>;
    }
  };

  /** 등록 일시 포맷 */
  const formattedDate = (() => {
    try {
      return new Date(keyInfo.registeredAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return keyInfo.registeredAt;
    }
  })();

  return (
    <Card>
      <CardContent className="p-4">
        {isDeleting ? (
          /* 삭제 확인 상태 */
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <ShieldAlert
                className="h-5 w-5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t.apiKey.settingsPage.confirmDelete}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.apiKey.settingsPage.confirmDeleteDescription}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onDeleteCancel}
              >
                {t.common.cancel}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onDeleteConfirm}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t.apiKey.settingsPage.deleteButton}
              </Button>
            </div>
          </div>
        ) : (
          /* 정상 표시 상태 */
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* 거래소 아이콘/이름 */}
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Key className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {getExchangeDisplayName(keyInfo.exchange, t)}
                  </span>
                  {statusBadge()}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  <span>
                    {t.apiKey.accessKey}: {keyInfo.maskedAccessKey}
                  </span>
                  <span>
                    {t.apiKey.secretKey}: {keyInfo.maskedSecretKey}
                  </span>
                  <span>
                    {t.apiKey.registeredAt}: {formattedDate}
                  </span>
                </div>
              </div>
            </div>

            {/* 삭제 버튼 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onDeleteRequest}
              aria-label={`${getExchangeDisplayName(keyInfo.exchange, t)} ${t.apiKey.settingsPage.deleteButton}`}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// RegisterForm - API Key 등록 폼
// ============================================================

/** RegisterForm Props */
interface RegisterFormProps {
  form: RegisterFormState;
  setForm: React.Dispatch<React.SetStateAction<RegisterFormState>>;
  availableExchanges: ExchangeType[];
  onRegister: () => Promise<void>;
  onCancel: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}

/**
 * API Key 등록 폼 컴포넌트
 *
 * 거래소 선택, Access Key / Secret Key 입력, 등록 버튼을 제공한다.
 * 유효성 검증 결과와 Read-Only 경고를 표시한다.
 *
 * @see 요구사항 1.1 (거래소 API 키 입력 폼)
 * @see 요구사항 1.2 (유효성 검증 후 결과 표시)
 * @see 요구사항 1.7 (Read-Only 아닌 키 보안 경고)
 */
function RegisterForm({
  form,
  setForm,
  availableExchanges,
  onRegister,
  onCancel,
  t,
}: RegisterFormProps) {
  /** 폼 유효성 확인 */
  const needsPassphrase = form.exchange !== '' && PASSPHRASE_EXCHANGES.includes(form.exchange as ExchangeType);
  const isFormValid = form.exchange !== '' && form.accessKey.trim() !== '' && form.secretKey.trim() !== ''
    && (!needsPassphrase || form.passphrase.trim() !== '');

  /** 등록/검증 진행 중 여부 */
  const isProcessing = form.isValidating || form.isRegistering;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.apiKey.settingsPage.registerNew}</CardTitle>
        <CardDescription>{t.apiKey.registerDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 거래소 선택 */}
        <div className="space-y-2">
          <Label htmlFor="exchange-select">
            {t.apiKey.settingsPage.selectExchange}
          </Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.apiKey.settingsPage.selectExchange}>
            {availableExchanges.map((exchange) => (
              <button
                key={exchange}
                type="button"
                role="radio"
                aria-checked={form.exchange === exchange}
                className={`inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  form.exchange === exchange
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-accent'
                }`}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    exchange,
                    validationResult: null,
                  }))
                }
                disabled={isProcessing}
              >
                {getExchangeDisplayName(exchange, t)}
              </button>
            ))}
          </div>
          {availableExchanges.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {/* 모든 거래소가 이미 등록된 경우 */}
              {t.apiKey.settingsPage.noKeysDescription}
            </p>
          )}
        </div>

        {/* Access Key 입력 */}
        <div className="space-y-2">
          <Label htmlFor="access-key">{t.apiKey.accessKey}</Label>
          <Input
            id="access-key"
            type="text"
            placeholder={t.apiKey.settingsPage.accessKeyPlaceholder}
            value={form.accessKey}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                accessKey: e.target.value,
                validationResult: null,
              }))
            }
            disabled={isProcessing}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Secret Key 입력 */}
        <div className="space-y-2">
          <Label htmlFor="secret-key">{t.apiKey.secretKey}</Label>
          <div className="relative">
            <Input
              id="secret-key"
              type={form.showSecretKey ? 'text' : 'password'}
              placeholder={t.apiKey.settingsPage.secretKeyPlaceholder}
              value={form.secretKey}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  secretKey: e.target.value,
                  validationResult: null,
                }))
              }
              disabled={isProcessing}
              autoComplete="off"
              spellCheck={false}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  showSecretKey: !prev.showSecretKey,
                }))
              }
              aria-label={form.showSecretKey ? t.apiKey.settingsPage.hideSecretKey : t.apiKey.settingsPage.showSecretKey}
            >
              {form.showSecretKey ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Passphrase 입력 (OKX, Bitget만) */}
        {form.exchange && PASSPHRASE_EXCHANGES.includes(form.exchange as ExchangeType) && (
          <div className="space-y-2">
            <Label htmlFor="passphrase">Passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              placeholder={t.apiKey.settingsPage.passphrasePlaceholder}
              value={form.passphrase}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  passphrase: e.target.value,
                  validationResult: null,
                }))
              }
              disabled={isProcessing}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {t.apiKey.settingsPage.passphraseDescription}
            </p>
          </div>
        )}

        {/* 유효성 검증 결과 */}
        {form.validationResult && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
              form.validationResult.isValid
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'
            }`}
            role="alert"
            aria-live="polite"
          >
            {form.validationResult.isValid ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <div>
              <span>
                {form.validationResult.isValid
                  ? t.apiKey.valid
                  : form.validationResult.errorMessage || t.apiKey.invalid}
              </span>
            </div>
          </div>
        )}

        {/* Read-Only 경고 */}
        {form.validationResult?.isValid && !form.validationResult.isReadOnly && (
          <div
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
            role="alert"
            aria-live="polite"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">
                {t.apiKey.settingsPage.readOnlyWarning}
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                {t.apiKey.settingsPage.readOnlyWarningDescription}
              </p>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
        >
          {t.apiKey.settingsPage.cancelButton}
        </Button>
        <Button
          onClick={onRegister}
          disabled={!isFormValid || isProcessing}
        >
          {isProcessing && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {form.isValidating
            ? t.apiKey.validating
            : form.isRegistering
              ? t.apiKey.settingsPage.registering
              : t.apiKey.settingsPage.registerButton}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ============================================================
// ExchangeGuide - 거래소별 API 키 발급 가이드
// ============================================================

/** ExchangeGuide Props */
interface ExchangeGuideProps {
  exchange: ExchangeType;
  t: ReturnType<typeof useTranslation>['t'];
}

/**
 * 거래소별 API 키 발급 가이드 컴포넌트
 *
 * 각 거래소의 API 키 발급 방법과 링크를 안내한다.
 *
 * @see 요구사항 1.8 (거래소별 API 키 발급 가이드)
 */
function ExchangeGuide({ exchange, t }: ExchangeGuideProps) {
  const guideUrl = t.apiKey.settingsPage.guides[exchange];
  const guideStep = t.apiKey.settingsPage.guideSteps[exchange];

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">
          {getExchangeDisplayName(exchange, t)}
        </span>
        <a
          href={guideUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          aria-label={`${getExchangeDisplayName(exchange, t)} ${t.apiKey.guideLink}`}
        >
          {t.apiKey.guideLink}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{guideStep}</p>
    </div>
  );
}

/**
 * 텔레그램 알림 설정 섹션 컴포넌트
 *
 * 설정 페이지에서 텔레그램 봇 연결/해제 및 테스트 알림을 관리한다.
 *
 * 상태별 표시:
 * - 미연결: "텔레그램 연결" 버튼 -> 인증 코드 표시 + 봇 링크
 * - 연결됨: 텔레그램 사용자명 표시 + "연결 해제" 버튼 + 테스트 알림 버튼
 * - 비활성: 텔레그램 봇 미설정 안내
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageCircle,
  Link2,
  Unlink,
  Send,
  ExternalLink,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ===== API ===== //

/**
 * NestJS API 기본 URL을 반환한다.
 */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return (
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      `${window.location.protocol}//${window.location.hostname}:4000`
    );
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
}

/** 텔레그램 연결 상태 */
interface TelegramStatus {
  connected: boolean;
  username: string | null;
  isActive: boolean;
  enabled: boolean;
}

/** 인증 코드 응답 */
interface ConnectLinkResponse {
  verificationCode: string;
  botLink: string | null;
  botUsername: string | null;
  expiresInSeconds: number;
}

/**
 * 텔레그램 연결 상태를 조회한다.
 */
async function fetchTelegramStatus(walletAddress: string): Promise<TelegramStatus> {
  const url = `${getApiBaseUrl()}/telegram/status/${walletAddress}`;
  const res = await fetch(url);
  const json = await res.json();
  return json.data ?? json;
}

/**
 * 인증 코드 및 봇 링크를 요청한다.
 */
async function fetchConnectLink(walletAddress: string): Promise<ConnectLinkResponse> {
  const url = `${getApiBaseUrl()}/telegram/connect-link/${walletAddress}`;
  const res = await fetch(url);
  const json = await res.json();
  return json.data ?? json;
}

/**
 * 텔레그램 연결을 해제한다.
 */
async function disconnectTelegram(walletAddress: string): Promise<void> {
  const url = `${getApiBaseUrl()}/telegram/connection/${walletAddress}`;
  await fetch(url, { method: 'DELETE' });
}

/**
 * 테스트 알림을 전송한다.
 */
async function sendTestAlert(walletAddress: string): Promise<boolean> {
  const url = `${getApiBaseUrl()}/telegram/test/${walletAddress}`;
  const res = await fetch(url, { method: 'POST' });
  const json = await res.json();
  const data = json.data ?? json;
  return data.sent === true;
}

// ===== 컴포넌트 ===== //

/**
 * 텔레그램 알림 설정 섹션
 */
export function TelegramSection() {
  const { wallet } = useWalletAuth();
  const { t } = useTranslation();

  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVerification, setShowVerification] = useState(false);
  const [connectLink, setConnectLink] = useState<ConnectLinkResponse | null>(null);
  const [processing, setProcessing] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  /** 알림 자동 제거 타이머 */
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 연결 상태 폴링 타이머 */
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 컴포넌트 언마운트 시 타이머 정리 */
  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, []);

  /**
   * 알림 메시지를 표시한다.
   */
  const showNotification = useCallback(
    (type: 'success' | 'error', message: string) => {
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
   * 텔레그램 연결 상태를 로드한다.
   */
  const loadStatus = useCallback(async () => {
    if (!wallet.address) return;

    try {
      const result = await fetchTelegramStatus(wallet.address);
      setStatus(result);
    } catch {
      setStatus({ connected: false, username: null, isActive: false, enabled: false });
    } finally {
      setLoading(false);
    }
  }, [wallet.address]);

  /** 초기 로드 */
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /**
   * 인증 코드 생성 및 표시
   */
  const handleConnect = useCallback(async () => {
    if (!wallet.address) return;

    setProcessing(true);
    try {
      const result = await fetchConnectLink(wallet.address);
      setConnectLink(result);
      setShowVerification(true);

      // 인증 코드 표시 중 5초마다 상태 폴링 (연결 완료 감지)
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
      pollingTimerRef.current = setInterval(async () => {
        try {
          const updated = await fetchTelegramStatus(wallet.address);
          if (updated.connected) {
            setStatus(updated);
            setShowVerification(false);
            setConnectLink(null);
            showNotification('success', t.telegram.connectSuccess);
            if (pollingTimerRef.current) {
              clearInterval(pollingTimerRef.current);
              pollingTimerRef.current = null;
            }
          }
        } catch {
          // 폴링 오류는 무시
        }
      }, 5000);

      // 5분 후 폴링 중단
      setTimeout(() => {
        if (pollingTimerRef.current) {
          clearInterval(pollingTimerRef.current);
          pollingTimerRef.current = null;
        }
      }, 300_000);
    } catch {
      showNotification('error', t.telegram.connectFailed);
    } finally {
      setProcessing(false);
    }
  }, [wallet.address, showNotification, t]);

  /**
   * 연결 해제
   */
  const handleDisconnect = useCallback(async () => {
    if (!wallet.address) return;

    setProcessing(true);
    try {
      await disconnectTelegram(wallet.address);
      setStatus({
        connected: false,
        username: null,
        isActive: false,
        enabled: status?.enabled ?? false,
      });
      setConfirmDisconnect(false);
      showNotification('success', t.telegram.disconnectSuccess);
    } catch {
      showNotification('error', t.telegram.disconnectFailed);
    } finally {
      setProcessing(false);
    }
  }, [wallet.address, status?.enabled, showNotification, t]);

  /**
   * 테스트 알림 전송
   */
  const handleTestAlert = useCallback(async () => {
    if (!wallet.address) return;

    setProcessing(true);
    try {
      const sent = await sendTestAlert(wallet.address);
      if (sent) {
        showNotification('success', t.telegram.testSent);
      } else {
        showNotification('error', t.telegram.testFailed);
      }
    } catch {
      showNotification('error', t.telegram.testFailed);
    } finally {
      setProcessing(false);
    }
  }, [wallet.address, showNotification, t]);

  /**
   * 인증 코드를 클립보드에 복사한다.
   */
  const handleCopyCode = useCallback(async () => {
    if (!connectLink?.verificationCode) return;

    try {
      await navigator.clipboard.writeText(
        `/start ${connectLink.verificationCode}`,
      );
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // 클립보드 API를 사용할 수 없는 경우 무시
    }
  }, [connectLink?.verificationCode]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    );
  }

  // 텔레그램 기능 비활성화 상태
  if (status && !status.enabled) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <CardTitle className="text-base">{t.telegram.title}</CardTitle>
          </div>
          <CardDescription>{t.telegram.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t.telegram.disabled}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle className="text-base">{t.telegram.title}</CardTitle>
          </div>
          {status?.connected ? (
            <Badge variant="success">{t.telegram.connected}</Badge>
          ) : (
            <Badge variant="outline">{t.telegram.notConnected}</Badge>
          )}
        </div>
        <CardDescription>{t.telegram.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
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

        {status?.connected ? (
          /* 연결됨 상태 */
          <div className="space-y-4">
            {/* 사용자 정보 */}
            {status.username && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t.telegram.username}:</span>
                <span className="font-medium text-foreground">
                  @{status.username}
                </span>
              </div>
            )}

            {/* 액션 버튼 */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestAlert}
                disabled={processing}
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                {t.telegram.testButton}
              </Button>

              {confirmDisconnect ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t.telegram.confirmDisconnect}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={processing}
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Unlink className="h-4 w-4" aria-hidden="true" />
                    )}
                    {t.common.confirm}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDisconnect(false)}
                    disabled={processing}
                  >
                    {t.common.cancel}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDisconnect(true)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Unlink className="h-4 w-4" aria-hidden="true" />
                  {t.telegram.disconnectButton}
                </Button>
              )}
            </div>
          </div>
        ) : showVerification && connectLink ? (
          /* 인증 코드 표시 상태 */
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t.telegram.verificationDescription}
            </p>

            {/* 단계 안내 */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-4">
              <p className="text-sm">{t.telegram.verificationStep1}</p>
              {connectLink.botLink && (
                <a
                  href={connectLink.botLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#0088cc] px-3 py-2 text-sm font-medium text-white hover:bg-[#0077b5] transition-colors"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  {t.telegram.openBot}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}

              <p className="text-sm">{t.telegram.verificationStep2}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-background px-3 py-2 text-sm font-mono border border-border">
                  /start {connectLink.verificationCode}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyCode}
                  aria-label={codeCopied ? 'Copied' : 'Copy'}
                  className="shrink-0"
                >
                  {codeCopied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t.telegram.verificationExpires}
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowVerification(false);
                setConnectLink(null);
                if (pollingTimerRef.current) {
                  clearInterval(pollingTimerRef.current);
                  pollingTimerRef.current = null;
                }
              }}
            >
              {t.common.cancel}
            </Button>
          </div>
        ) : (
          /* 미연결 상태 */
          <Button
            onClick={handleConnect}
            disabled={processing}
            size="sm"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="h-4 w-4" aria-hidden="true" />
            )}
            {t.telegram.connectButton}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

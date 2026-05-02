/**
 * 지갑 연결 페이지
 *
 * RainbowKit ConnectButton을 통합하여 사용자에게 Web3 지갑 연결 UI를 제공한다.
 * MetaMask 등 EIP-1193 호환 지갑을 지원하며,
 * 지갑이 설치되지 않은 경우 MetaMask 설치 안내를 표시한다.
 * 지갑 연결 완료 후 대시보드('/')로 자동 리다이렉트한다.
 *
 * @see 요구사항 8.1 (Web3 지갑 연결 인증)
 * @see 요구사항 8.2 (지갑 주소를 사용자 식별자로 사용)
 * @see 요구사항 8.3 (MetaMask 미설치 시 안내)
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  BarChart3,
  ExternalLink,
  LayoutDashboard,
  Shield,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * 서비스 특징 카드 컴포넌트
 *
 * 지갑 연결 페이지에서 BitScope의 핵심 특징을 소개한다.
 */
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/**
 * 지갑 연결 페이지 컴포넌트
 *
 * 3가지 상태를 처리한다:
 * 1. 지갑 연결 완료: 대시보드로 리다이렉트
 * 2. Web3 지갑 사용 가능: RainbowKit ConnectButton 표시
 * 3. Web3 지갑 미설치: MetaMask 설치 안내 표시
 */
export default function ConnectPage() {
  const router = useRouter();
  const {
    wallet,
    isWalletAvailable,
    metaMaskInstallUrl,
  } = useWalletAuth();
  const { t } = useTranslation();

  /**
   * 지갑 연결 완료 시 대시보드로 리다이렉트
   *
   * 이미 지갑이 연결된 상태로 이 페이지에 접근하거나,
   * 지갑 연결이 완료되면 대시보드('/')로 자동 이동한다.
   */
  useEffect(() => {
    if (wallet.isConnected && wallet.address) {
      router.replace('/');
    }
  }, [wallet.isConnected, wallet.address, router]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 상단 바: 로고 + 테마 토글 */}
      <header className="flex h-16 items-center justify-between border-b border-border px-4 md:px-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
          <span className="text-lg font-bold text-foreground">
            {t.common.appName}
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* 메인 컨텐츠 */}
      <main
        className="flex flex-1 flex-col items-center justify-center px-4 py-12"
        role="main"
        id="main-content"
      >
        <div className="w-full max-w-md space-y-8">
          {/* 제목 영역 */}
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="h-8 w-8 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t.wallet.connectPage.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.wallet.connectPage.description}
            </p>
          </div>

          {/* 지갑 연결 또는 설치 안내 */}
          {isWalletAvailable ? (
            /* Web3 지갑이 설치된 경우: RainbowKit ConnectButton */
            <div className="flex flex-col items-center gap-4">
              <ConnectButton
                label={t.wallet.connectPage.connectButton}
                showBalance={false}
              />

              {/* 보안 안내 */}
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3">
                <Shield
                  className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {t.wallet.connectPage.securityNotice}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.wallet.connectPage.securityDescription}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Web3 지갑이 미설치된 경우: MetaMask 설치 안내 */
            <div
              className="flex flex-col items-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30"
              role="alert"
            >
              <div className="text-center">
                <h2 className="text-base font-semibold text-foreground">
                  {t.wallet.connectPage.noWalletTitle}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t.wallet.connectPage.noWalletDescription}
                </p>
              </div>
              <Button asChild size="lg">
                <a
                  href={metaMaskInstallUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.wallet.connectPage.installMetamask}
                >
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                  {t.wallet.connectPage.installMetamask}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </Button>
            </div>
          )}

          {/* 서비스 특징 소개 */}
          <div className="space-y-3">
            <FeatureCard
              icon={LayoutDashboard}
              title={t.wallet.connectPage.features.portfolio}
              description={t.wallet.connectPage.features.portfolioDesc}
            />
            <FeatureCard
              icon={TrendingUp}
              title={t.wallet.connectPage.features.realtime}
              description={t.wallet.connectPage.features.realtimeDesc}
            />
            <FeatureCard
              icon={Shield}
              title={t.wallet.connectPage.features.secure}
              description={t.wallet.connectPage.features.secureDesc}
            />
          </div>
        </div>
      </main>

      {/* 하단 푸터 */}
      <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
        <p>{t.common.appName} &mdash; {t.common.appDescription}</p>
      </footer>
    </div>
  );
}

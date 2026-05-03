/**
 * 데모 모드 배너 컴포넌트
 *
 * 데모 모드가 활성화된 경우 화면 상단에 배너를 표시하여
 * 사용자에게 현재 모의 데이터로 서비스를 체험 중임을 안내한다.
 * 설정 페이지로의 링크를 제공하여 실제 API 키 등록을 유도한다.
 *
 * @see 요구사항 11.3 (데모 데이터 미리보기 모드)
 */

'use client';

import { useRouter } from 'next/navigation';
import { Eye, Settings, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** DemoModeBanner Props */
interface DemoModeBannerProps {
  /** 데모 모드 종료 핸들러 */
  onExit: () => void;
}

/**
 * 데모 모드 배너
 *
 * 대시보드 상단에 고정되어 데모 모드 상태를 안내하고,
 * 설정 페이지로 이동하거나 데모 모드를 종료할 수 있는 버튼을 제공한다.
 */
export function DemoModeBanner({ onExit }: DemoModeBannerProps) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-800 dark:bg-amber-950/30"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Eye
          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
        >
          {t.onboarding.demoModeBadge}
        </Badge>
        <span className="text-sm text-amber-800 dark:text-amber-400">
          {t.onboarding.demoModeNotice}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/50"
          onClick={() => router.push('/settings')}
        >
          <Settings className="h-3.5 w-3.5" aria-hidden="true" />
          {t.nav.settings}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
          onClick={onExit}
          aria-label={t.onboarding.exitDemoMode}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

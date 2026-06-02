/**
 * Notion 시그니처 컴포넌트 키트 (docs/DESIGN-notion.md)
 *
 * 파스텔 틴트 feature 카드, 퍼플 pill CTA 등 Notion 특유의 깔끔한 컴포넌트.
 * 라운드(12px) + hairline 보더 + 소프트 그림자 기반. 라이트/다크 모두 동작한다.
 */

import { cn } from '@/lib/utils';

/** Notion 파스텔 feature-card 틴트. */
export type NotionTint =
  | 'peach'
  | 'rose'
  | 'mint'
  | 'lavender'
  | 'sky'
  | 'yellow'
  | 'cream';

const TINT_BG: Record<NotionTint, string> = {
  peach: 'bg-tint-peach',
  rose: 'bg-tint-rose',
  mint: 'bg-tint-mint',
  lavender: 'bg-tint-lavender',
  sky: 'bg-tint-sky',
  yellow: 'bg-tint-yellow',
  cream: 'bg-tint-cream',
};

/**
 * feature-card — 파스텔 틴트 배경의 둥근 카드. 다크 모드에선 틴트 대신 카드 표면을 쓴다.
 */
export function FeatureCard({
  tint,
  title,
  className,
  children,
}: {
  tint?: NotionTint;
  title?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl p-6',
        // 라이트: 파스텔 틴트(틴트는 항상 어두운 charcoal 텍스트), 다크: 카드 표면
        tint ? cn(TINT_BG[tint], 'text-[#37352f] dark:bg-card dark:text-card-foreground') : 'border border-border bg-card text-card-foreground',
        className,
      )}
    >
      {title ? <h3 className="mb-2 text-lg font-semibold tracking-tight">{title}</h3> : null}
      {children}
    </div>
  );
}

/** 퍼플 pill CTA — Notion의 시그니처 1차 액션 버튼. */
export function CtaPill({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md bg-primary px-[18px] py-2.5',
        'text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** 인라인 링크 — Notion link-blue. */
export function NotionLink({
  className,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cn('font-medium text-link hover:underline', className)} {...props}>
      {children}
    </a>
  );
}

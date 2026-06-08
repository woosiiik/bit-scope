/**
 * Sheet 컴포넌트
 *
 * Radix UI의 Dialog primitive를 기반으로 한 shadcn/ui 스타일 슬라이드 패널이다.
 * 모바일 네비게이션 드로어 등 화면 가장자리에서 슬라이드되어 들어오는 모달 UI에 사용한다.
 *
 * Radix Dialog가 다음을 기본 제공한다:
 * - 포커스 트랩 / 열림 시 포커스 진입 / 닫힘 시 트리거로 포커스 복귀
 * - ESC 키 닫기, 백드롭(Overlay) 클릭 닫기
 * - role="dialog" + aria-modal="true"
 * - 본문 스크롤 락(내장 RemoveScroll), 배경 콘텐츠 inert 처리
 *
 * 슬라이드/페이드 애니메이션은 globals.css의 .sheet-overlay / .sheet-content-left
 * 클래스(data-state 기반 keyframes)로 처리하며 prefers-reduced-motion을 존중한다.
 */

'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;
const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('sheet-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm', className)}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** SheetContent가 슬라이드되어 들어오는 방향 */
type SheetSide = 'left' | 'right' | 'top' | 'bottom';

const sideClasses: Record<SheetSide, string> = {
  left: 'sheet-content-left inset-y-0 left-0 h-full w-72 max-w-[85vw] border-r',
  right: 'inset-y-0 right-0 h-full w-72 max-w-[85vw] border-l',
  top: 'inset-x-0 top-0 w-full border-b',
  bottom: 'inset-x-0 bottom-0 w-full border-t',
};

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** 슬라이드 방향 (기본: left) */
  side?: SheetSide;
  /** 기본 닫기(X) 버튼 표시 여부 (기본: true) */
  showClose?: boolean;
  /** 닫기 버튼 접근성 레이블 */
  closeLabel?: string;
}

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'left', showClose = true, closeLabel = 'Close', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex flex-col bg-sidebar text-sidebar-foreground shadow-lg',
        'border-sidebar-border focus:outline-none',
        sideClasses[side],
        className,
      )}
      {...props}
    >
      {children}
      {showClose && (
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md',
            'text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          )}
          aria-label={closeLabel}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetTitle,
  SheetDescription,
};

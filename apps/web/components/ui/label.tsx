/**
 * Label 컴포넌트
 *
 * shadcn/ui 기반 폼 레이블로, 접근성 요구사항을 충족한다.
 * htmlFor 속성을 통해 연관된 입력 필드와 연결된다.
 *
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 * @see 요구사항 NF4.2 (ARIA 레이블)
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Label 컴포넌트 Props */
export type LabelProps = React.ComponentProps<"label">;

/**
 * 폼 Label 컴포넌트
 *
 * 입력 필드와 연결되는 레이블을 렌더링한다.
 * 비활성 상태에서는 opacity가 낮아진다.
 */
const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          className,
        )}
        {...props}
      />
    );
  },
);
Label.displayName = 'Label';

export { Label };

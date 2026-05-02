/**
 * Input 컴포넌트
 *
 * shadcn/ui 기반 텍스트 입력 필드로, 다양한 상태(오류, 비활성)를 지원한다.
 * Tailwind CSS를 사용하여 라이트/다크 테마에 대응한다.
 *
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Input 컴포넌트 Props */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * 범용 Input 컴포넌트
 *
 * HTML input 요소를 래핑하여 일관된 스타일을 적용한다.
 * ref 전달을 지원하여 폼 라이브러리와 호환된다.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };

/**
 * 언어 전환 컴포넌트
 *
 * 한국어/영어 언어를 전환하는 드롭다운 버튼이다.
 * useTranslation 훅을 통해 현재 언어를 표시하고 전환한다.
 *
 * @see 요구사항 9.9 (한국어/영어 언어 전환)
 * @see 요구사항 NF5.1 (한국어 기본 언어)
 */

'use client';

import { Globe } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { type Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * 언어 전환 드롭다운 메뉴
 *
 * 헤더 등에 배치하여 사용자가 언어를 전환할 수 있다.
 * 현재 선택된 언어에 체크 표시를 한다.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, supportedLocales, localeNames, t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t.settings.language}>
          <Globe className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">{t.settings.language}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {supportedLocales.map((loc: Locale) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => setLocale(loc)}
            className={locale === loc ? 'font-semibold' : ''}
          >
            <span>{localeNames[loc]}</span>
            {locale === loc && (
              <span className="ml-auto text-primary" aria-hidden="true">
                &#10003;
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 홈 페이지
 *
 * BitScope의 랜딩 페이지로, 서비스 소개와 함께
 * 테마 토글을 포함한다.
 */

import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <h1 className="text-4xl font-bold text-foreground">BitScope</h1>
      <p className="mt-2 text-muted-foreground">
        한국 암호화폐 거래소 포트폴리오 통합 조회 서비스
      </p>
    </main>
  );
}

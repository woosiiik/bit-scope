import { describe, it, expect } from 'vitest';

describe('Web 앱 초기 설정 검증', () => {
  it('Vitest 테스트 러너가 정상적으로 동작한다', () => {
    expect(1 + 1).toBe(2);
  });

  it('TypeScript strict 모드에서 타입 검증이 동작한다', () => {
    const value: string = 'BitScope';
    expect(value).toBe('BitScope');
  });

  it('공유 패키지 import가 가능하다', async () => {
    // 초기에는 빈 모듈이므로, import 자체가 에러 없이 동작하는지 확인
    const shared = await import('@bitscope/shared');
    expect(shared).toBeDefined();
  });
});

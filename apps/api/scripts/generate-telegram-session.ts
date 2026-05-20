/**
 * Telegram StringSession 생성 스크립트 (1회용)
 *
 * 사용법:
 *   npx tsx apps/api/scripts/generate-telegram-session.ts
 *
 * 필요 정보:
 *   1. API ID / API Hash — https://my.telegram.org/apps 에서 발급
 *   2. 전화번호 — Telegram 계정의 전화번호
 *   3. 인증 코드 — Telegram 앱으로 전송됨
 *
 * 결과:
 *   StringSession 문자열이 출력됨 → t_system_config 테이블의
 *   telegram_session 값에 저장하면 됨
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log('=== Telegram StringSession 생성 ===\n');

  const apiId = Number(await ask('API ID: '));
  const apiHash = await ask('API Hash: ');

  if (!apiId || !apiHash) {
    console.error('API ID와 API Hash가 필요합니다.');
    process.exit(1);
  }

  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true,
  });

  await client.start({
    phoneNumber: async () => await ask('전화번호 (예: +821012345678): '),
    password: async () => await ask('2단계 인증 비밀번호 (없으면 Enter): '),
    phoneCode: async () => await ask('Telegram으로 전송된 인증 코드: '),
    onError: (err) => console.error('오류:', err),
  });

  const sessionString = client.session.save() as unknown as string;

  console.log('\n=== 생성 완료 ===');
  console.log('아래 문자열을 t_system_config 테이블의 telegram_session 값에 저장하세요:\n');
  console.log(sessionString);
  console.log('\nSQL:');
  console.log(`UPDATE t_system_config SET config_value = '${sessionString}' WHERE config_key = 'telegram_session';`);

  await client.disconnect();
  rl.close();
}

main().catch((err) => {
  console.error('실패:', err);
  process.exit(1);
});

/**
 * 헤더용 지갑 연결 버튼 컴포넌트
 *
 * RainbowKit의 ConnectButton을 헤더 레이아웃에 맞게 커스터마이징한다.
 * 연결 상태에 따라 축약된 지갑 주소 또는 연결 버튼을 표시한다.
 *
 * @see 요구사항 8.1 (Web3 지갑 연결 인증)
 * @see 요구사항 8.2 (지갑 주소를 사용자 식별자로 사용)
 */

'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTranslation } from '@/lib/i18n/i18n-context';

/**
 * 헤더용 지갑 연결 버튼
 *
 * RainbowKit의 ConnectButton.Custom을 사용하여
 * 앱의 디자인 시스템에 맞는 커스텀 버튼을 렌더링한다.
 * 연결 상태에서는 체인 아이콘과 축약된 주소를 표시하고,
 * 미연결 상태에서는 연결 버튼을 표시한다.
 */
export function WalletButton() {
  const { t } = useTranslation();

  return (
    <ConnectButton
      label={t.wallet.connect}
      showBalance={false}
      chainStatus="icon"
      accountStatus={{
        smallScreen: 'avatar',
        largeScreen: 'full',
      }}
    />
  );
}

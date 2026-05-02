/**
 * wagmi v2 + viem + RainbowKit 설정
 *
 * Web3 지갑 연결을 위한 체인 설정 및 커넥터를 구성한다.
 * EIP-1193 표준 기반의 MetaMask 등 지갑 연동을 지원하며,
 * 향후 온체인 지갑 자산 조회 기능으로 확장 가능하도록 설계한다.
 *
 * @see 요구사항 8.1, 8.2, 8.18
 */

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia } from 'wagmi/chains';
import { http } from 'wagmi';

/**
 * RainbowKit + wagmi 통합 설정
 *
 * RainbowKit의 getDefaultConfig를 사용하여 wagmi config와
 * RainbowKit 설정을 동시에 생성한다. 체인은 Ethereum Mainnet과
 * Sepolia(테스트넷)를 지원한다.
 *
 * 참고: BitScope는 암호화폐 거래소 포트폴리오 조회 서비스로,
 * 실제 온체인 트랜잭션을 수행하지 않는다. 지갑 연결은
 * 사용자 인증과 API Key 암호화 키 도출에만 사용된다.
 */
export const wagmiConfig = getDefaultConfig({
  /** RainbowKit 앱 이름 (지갑 연결 모달에 표시) */
  appName: 'BitScope',

  /**
   * WalletConnect 프로젝트 ID
   * 환경 변수에서 로드하며, 미설정 시 빈 문자열로 폴백한다.
   * WalletConnect를 통한 모바일 지갑 연결에 필요하다.
   */
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',

  /**
   * 지원 체인 목록
   * - mainnet: Ethereum 메인넷 (프로덕션 환경)
   * - sepolia: Ethereum 테스트넷 (개발 환경)
   */
  chains: [mainnet, sepolia],

  /**
   * 체인별 RPC 전송 설정
   * 기본 public RPC를 사용하며, 필요 시 커스텀 RPC URL로 교체 가능하다.
   */
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },

  /** SSR(Server-Side Rendering) 지원 활성화 */
  ssr: true,
});

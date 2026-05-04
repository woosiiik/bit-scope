import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // standalone 모드: Docker 배포 시 최소한의 파일만 포함
  output: 'standalone',

  // 모노레포 루트를 명시적으로 설정하여 빌드 경고 방지
  outputFileTracingRoot: path.join(__dirname, '../../'),

  // React strict mode 활성화
  reactStrictMode: true,

  // 공유 패키지 트랜스파일
  transpilePackages: ['@bitscope/shared'],

  // 서버사이드에서 브라우저 전용 패키지를 외부 모듈로 처리
  // MetaMask/WalletConnect SDK 의존성 중 서버에서 불필요한 패키지를 제외하여
  // 빌드 시 번들링 오류를 방지한다.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push({
          '@react-native-async-storage/async-storage': 'commonjs @react-native-async-storage/async-storage',
          'pino-pretty': 'commonjs pino-pretty',
        });
      }
    }
    return config;
  },
};

export default nextConfig;

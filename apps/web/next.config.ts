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

  // 서버사이드에서 브라우저 전용 모듈을 빈 모듈로 대체
  // MetaMask/WalletConnect SDK가 indexedDB 등 브라우저 API를 참조하여
  // SSR/SSG 시 ReferenceError가 발생하는 것을 방지
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'indexeddb': false,
      };
      // 브라우저 전용 패키지를 서버 빌드에서 제외
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

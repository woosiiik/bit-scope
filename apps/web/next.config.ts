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
};

export default nextConfig;

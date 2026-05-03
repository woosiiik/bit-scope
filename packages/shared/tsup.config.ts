import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  // tsup이 CJS용 .d.ts를 잘못 생성하는 버그 우회:
  // ESM용 .d.mts는 정상이므로 빌드 후 복사
  onSuccess: 'cp dist/index.d.mts dist/index.d.ts',
});

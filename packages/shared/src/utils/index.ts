/**
 * 공유 유틸리티 배럴 export
 *
 * 모든 공유 유틸리티 함수를 단일 진입점에서 re-export한다.
 */

// 숫자/통화 포맷 함수
export {
  formatNumber,
  formatKRW,
  formatUSD,
  formatCurrency,
  formatPercent,
  formatCoinPrice,
  formatQuantity,
  formatCompactKRW,
  formatVolume,
} from './format';

export type { CurrencyCode } from './format';

// API Key 유효성 검증 유틸리티
export {
  validateUpbitApiKeyFormat,
  validateBithumbApiKeyFormat,
  validateCoinoneApiKeyFormat,
  validateBinanceApiKeyFormat,
  validateBybitApiKeyFormat,
  validateOkxApiKeyFormat,
  validateGateApiKeyFormat,
  validateBitgetApiKeyFormat,
  validateApiKeyFormat,
  isValidWalletAddress,
  sanitizeApiKey,
  maskSecretKey,
} from './validation';

export type { ApiKeyFormatValidation } from './validation';

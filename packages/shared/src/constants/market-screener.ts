/**
 * 마켓 스크리너 정적 매핑 상수
 */

import type { MarketCapCategory, CoinSector } from '../types/market-screener';
import type { FuturesExchangeType } from '../types/futures';

/** 시가총액 분류 매핑 (Phase 1: 하드코딩) */
export const COIN_MARKET_CAP_MAP: Record<string, MarketCapCategory> = {
  // Large Cap (>$10B)
  BTC: 'large', ETH: 'large', SOL: 'large', BNB: 'large', XRP: 'large',
  DOGE: 'large', ADA: 'large', AVAX: 'large', TRX: 'large', LINK: 'large',
  DOT: 'large', SUI: 'large', SHIB: 'large', TON: 'large', XLM: 'large',
  HBAR: 'large', BCH: 'large', LTC: 'large', UNI: 'large', PEPE: 'large',

  // Mid Cap ($1B~$10B)
  NEAR: 'mid', APT: 'mid', FIL: 'mid', ARB: 'mid', OP: 'mid',
  ATOM: 'mid', RENDER: 'mid', FET: 'mid', AAVE: 'mid', MKR: 'mid',
  INJ: 'mid', SEI: 'mid', STX: 'mid', IMX: 'mid', GRT: 'mid',
  ALGO: 'mid', SAND: 'mid', MANA: 'mid', AXS: 'mid', GALA: 'mid',
  FTM: 'mid', BONK: 'mid', WIF: 'mid', FLOKI: 'mid', ENA: 'mid',
  ONDO: 'mid', TIA: 'mid', JUP: 'mid', WLD: 'mid', STRK: 'mid',
  ZK: 'mid', POL: 'mid', CRV: 'mid', COMP: 'mid', SNX: 'mid',
  DYDX: 'mid', PENDLE: 'mid', TAO: 'mid', JASMY: 'mid', RUNE: 'mid',
  EOS: 'mid', IOTA: 'mid', XMR: 'mid', ZEC: 'mid', DASH: 'mid',
  ETC: 'mid', NEO: 'mid', AEVO: 'mid', MNT: 'mid', POPCAT: 'mid',

  // 나머지는 small cap으로 처리 (getMarketCap 함수에서 기본값)
};

/** 섹터 분류 매핑 (120+ 코인) */
export const COIN_SECTOR_MAP: Record<string, CoinSector[]> = {
  // DeFi
  AAVE: ['DeFi'], UNI: ['DeFi'], MKR: ['DeFi'], CRV: ['DeFi'], COMP: ['DeFi'],
  SNX: ['DeFi'], DYDX: ['DeFi'], '1INCH': ['DeFi'], JUP: ['DeFi'], PENDLE: ['DeFi'],
  SUSHI: ['DeFi'], YFI: ['DeFi'], BAL: ['DeFi'], CAKE: ['DeFi'], RUNE: ['DeFi'],
  LQTY: ['DeFi'], GMX: ['DeFi'], AEVO: ['DeFi'], ENA: ['DeFi'], ONDO: ['DeFi'],
  JUPITER: ['DeFi'], RAY: ['DeFi'], OSMO: ['DeFi'],

  // L1
  BTC: ['L1', 'Dino'], ETH: ['L1', 'Dino'], SOL: ['L1'], BNB: ['L1'],
  ADA: ['L1'], AVAX: ['L1'], DOT: ['L1'], ATOM: ['L1'], NEAR: ['L1', 'AI'],
  APT: ['L1'], SUI: ['L1'], SEI: ['L1'], INJ: ['L1'], TON: ['L1'],
  FTM: ['L1'], ALGO: ['L1'], HBAR: ['L1'], TRX: ['L1'], TIA: ['L1'],
  ICP: ['L1'], FIL: ['L1'], EGLD: ['L1'], KAVA: ['L1'], MINA: ['L1'],
  CELO: ['L1'], FLOW: ['L1'], KAS: ['L1'], CFX: ['L1'],

  // L2
  ARB: ['L2'], OP: ['L2'], ZK: ['L2'], POL: ['L2'], STRK: ['L2'],
  MNT: ['L2'], IMX: ['L2'], STX: ['L2'], METIS: ['L2'], MANTA: ['L2'],
  BLAST: ['L2'], SCROLL: ['L2'], MODE: ['L2'],

  // Metaverse / Gaming
  SAND: ['Metaverse'], MANA: ['Metaverse'], AXS: ['Metaverse'], GALA: ['Metaverse'],
  ENJ: ['Metaverse'], RONIN: ['Metaverse'], ILV: ['Metaverse'], PIXEL: ['Metaverse'],
  YGG: ['Metaverse'], SUPER: ['Metaverse'], PORTAL: ['Metaverse'], BEAM: ['Metaverse'],
  NOT: ['Metaverse'], PRIME: ['Metaverse'],

  // Meme
  DOGE: ['Meme', 'Dino'], SHIB: ['Meme'], PEPE: ['Meme'], BONK: ['Meme'],
  WIF: ['Meme'], POPCAT: ['Meme'], FLOKI: ['Meme'], NEIRO: ['Meme'],
  TURBO: ['Meme'], PEOPLE: ['Meme'], BABYDOGE: ['Meme'], SATS: ['Meme'],
  CATS: ['Meme'], MEME: ['Meme'], MYRO: ['Meme'], MOG: ['Meme'],

  // Dino (2017 이전)
  LTC: ['Dino'], XRP: ['L1', 'Dino'], XLM: ['Dino'], XMR: ['Dino'],
  ZEC: ['Dino'], DASH: ['Dino'], ETC: ['Dino'], BCH: ['Dino'],
  NEO: ['Dino'], EOS: ['Dino'], IOTA: ['Dino'], XTZ: ['Dino'],
  QTUM: ['Dino'], ZIL: ['Dino'], BAT: ['Dino'], ONT: ['Dino'],

  // AI
  FET: ['AI'], RENDER: ['AI'], TAO: ['AI'], WLD: ['AI'],
  ARKM: ['AI'], IOTX: ['AI'], JASMY: ['AI'], OCEAN: ['AI'],
  AGIX: ['AI'], NMR: ['AI'], GRT: ['AI'],
};

/** 섹터 표시 라벨 */
export const SECTOR_LABELS: Record<CoinSector, string> = {
  DeFi: 'DeFi',
  L1: 'Layer 1',
  L2: 'Layer 2',
  Metaverse: 'Metaverse',
  Meme: 'Meme',
  Dino: 'Dino',
  AI: 'AI',
};

/** 벌크 ticker API 설정 */
export const BULK_TICKER_CONFIGS: Record<FuturesExchangeType, { url: string; method: string; body?: string }> = {
  binance: { url: 'https://fapi.binance.com/fapi/v1/ticker/24hr', method: 'GET' },
  bybit: { url: 'https://api.bybit.com/v5/market/tickers?category=linear', method: 'GET' },
  okx: { url: 'https://www.okx.com/api/v5/market/tickers?instType=SWAP', method: 'GET' },
  gate: { url: 'https://api.gateio.ws/api/v4/futures/usdt/tickers', method: 'GET' },
  bitget: { url: 'https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES', method: 'GET' },
  hyperliquid: { url: 'https://api.hyperliquid.xyz/info', method: 'POST', body: JSON.stringify({ type: 'metaAndAssetCtxs' }) },
};

/** Binance premiumIndex (펀딩비율 보충) */
export const BINANCE_PREMIUM_INDEX_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex';

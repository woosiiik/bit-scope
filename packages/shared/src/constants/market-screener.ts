/**
 * 마켓 스크리너 정적 매핑 상수
 */

import type { MarketCapCategory, CoinSector } from '../types/market-screener';
import type { FuturesExchangeType } from '../types/futures';

/**
 * 시가총액 분류 매핑 (정적 하드코딩, 근사치)
 *
 * 시가총액은 거래소 선물 API에 없어 별도 소스가 필요하므로 best-effort 정적 매핑을 사용한다.
 * 경계: Large > $10B, Mid $1B~$10B, Small < $1B. 매핑에 없는 코인은 시가총액 필터에서 제외된다.
 */
export const COIN_MARKET_CAP_MAP: Record<string, MarketCapCategory> = {
  // Large Cap (>$10B)
  BTC: 'large', ETH: 'large', SOL: 'large', BNB: 'large', XRP: 'large',
  DOGE: 'large', ADA: 'large', AVAX: 'large', TRX: 'large', LINK: 'large',
  DOT: 'large', SUI: 'large', SHIB: 'large', TON: 'large', XLM: 'large',
  HBAR: 'large', BCH: 'large', LTC: 'large', UNI: 'large', PEPE: 'large',
  TAO: 'large', NEAR: 'large', APT: 'large', ICP: 'large', AAVE: 'large',

  // Mid Cap ($1B~$10B)
  FIL: 'mid', ARB: 'mid', OP: 'mid', ATOM: 'mid', RENDER: 'mid',
  FET: 'mid', MKR: 'mid', INJ: 'mid', SEI: 'mid', STX: 'mid',
  IMX: 'mid', GRT: 'mid', ALGO: 'mid', SAND: 'mid', MANA: 'mid',
  AXS: 'mid', GALA: 'mid', FTM: 'mid', BONK: 'mid', WIF: 'mid',
  FLOKI: 'mid', ENA: 'mid', ONDO: 'mid', TIA: 'mid', JUP: 'mid',
  WLD: 'mid', STRK: 'mid', ZK: 'mid', POL: 'mid', CRV: 'mid',
  COMP: 'mid', SNX: 'mid', DYDX: 'mid', PENDLE: 'mid', JASMY: 'mid',
  RUNE: 'mid', EOS: 'mid', IOTA: 'mid', XMR: 'mid', ZEC: 'mid',
  DASH: 'mid', ETC: 'mid', NEO: 'mid', AEVO: 'mid', MNT: 'mid',
  POPCAT: 'mid', KAS: 'mid', VET: 'mid', THETA: 'mid', LDO: 'mid',
  QNT: 'mid', EGLD: 'mid', FLOW: 'mid', AR: 'mid', ENS: 'mid',
  GMX: 'mid', CFX: 'mid', NOT: 'mid', BRETT: 'mid', PYTH: 'mid',
  W: 'mid', MEW: 'mid', PEOPLE: 'mid', CKB: 'mid', ORDI: 'mid',

  // Small Cap (<$1B)
  '1INCH': 'small', SUSHI: 'small', YFI: 'small', BAL: 'small', CAKE: 'small',
  LQTY: 'small', RAY: 'small', OSMO: 'small', KAVA: 'small', MINA: 'small',
  CELO: 'small', METIS: 'small', MANTA: 'small', BLAST: 'small', MODE: 'small',
  ENJ: 'small', RONIN: 'small', ILV: 'small', PIXEL: 'small', YGG: 'small',
  SUPER: 'small', PORTAL: 'small', BEAM: 'small', PRIME: 'small', NEIRO: 'small',
  TURBO: 'small', BABYDOGE: 'small', SATS: 'small', MEME: 'small', MYRO: 'small',
  MOG: 'small', XTZ: 'small', QTUM: 'small', ZIL: 'small', BAT: 'small',
  ONT: 'small', ARKM: 'small', IOTX: 'small', OCEAN: 'small', AGIX: 'small',
  NMR: 'small', UMA: 'small', API3: 'small', BAND: 'small', RSR: 'small',
  ASTR: 'small', GLMR: 'small', ROSE: 'small', ONE: 'small', ZRX: 'small',
  KSM: 'small', WAVES: 'small', CHZ: 'small', ANKR: 'small', SKL: 'small',
  STORJ: 'small', CTSI: 'small', LRC: 'small', DENT: 'small', HOT: 'small',
  CVX: 'small', SPELL: 'small', TRU: 'small', BICO: 'small', MAGIC: 'small',
  HIGH: 'small', ID: 'small', ACE: 'small', AI: 'small', ZRO: 'small',
  OMNI: 'small', SAGA: 'small', REZ: 'small', BB: 'small', LISTA: 'small',
  ZETA: 'small', G: 'small', DEGEN: 'small', CAT: 'small', PONKE: 'small',
};

/** 섹터 분류 매핑 (250+ 코인) */
export const COIN_SECTOR_MAP: Record<string, CoinSector[]> = {
  // DeFi
  AAVE: ['DeFi'], UNI: ['DeFi'], MKR: ['DeFi'], CRV: ['DeFi'], COMP: ['DeFi'],
  SNX: ['DeFi'], DYDX: ['DeFi'], '1INCH': ['DeFi'], JUP: ['DeFi'], PENDLE: ['DeFi'],
  SUSHI: ['DeFi'], YFI: ['DeFi'], BAL: ['DeFi'], CAKE: ['DeFi'], RUNE: ['DeFi'],
  LQTY: ['DeFi'], GMX: ['DeFi'], AEVO: ['DeFi'], ENA: ['DeFi'], ONDO: ['DeFi'],
  RAY: ['DeFi'], OSMO: ['DeFi'], LDO: ['DeFi'], CVX: ['DeFi'], SPELL: ['DeFi'],
  UMA: ['DeFi'], BAND: ['DeFi'], API3: ['DeFi'], RSR: ['DeFi'], ZRX: ['DeFi'],
  LRC: ['DeFi'], KAVA: ['DeFi'], LISTA: ['DeFi'], ETHFI: ['DeFi'], EIGEN: ['DeFi'],
  MORPHO: ['DeFi'], AERO: ['DeFi'], DRIFT: ['DeFi'],

  // L1
  BTC: ['L1', 'Dino'], ETH: ['L1', 'Dino'], SOL: ['L1'], BNB: ['L1'],
  ADA: ['L1'], AVAX: ['L1'], DOT: ['L1'], ATOM: ['L1'], NEAR: ['L1', 'AI'],
  APT: ['L1'], SUI: ['L1'], SEI: ['L1'], INJ: ['L1'], TON: ['L1'],
  FTM: ['L1'], ALGO: ['L1'], HBAR: ['L1'], TRX: ['L1'], TIA: ['L1'],
  ICP: ['L1'], FIL: ['L1'], EGLD: ['L1'], MINA: ['L1'],
  CELO: ['L1'], FLOW: ['L1'], KAS: ['L1'], CFX: ['L1'], VET: ['L1'],
  THETA: ['L1'], AR: ['L1'], QNT: ['L1'], ROSE: ['L1'], ASTR: ['L1'],
  GLMR: ['L1'], KSM: ['L1'], WAVES: ['L1'], ONE: ['L1'], SAGA: ['L1'],
  DYM: ['L1'], OMNI: ['L1'], ZETA: ['L1'],

  // L2
  ARB: ['L2'], OP: ['L2'], ZK: ['L2'], POL: ['L2'], STRK: ['L2'],
  MNT: ['L2'], IMX: ['L2'], STX: ['L2'], METIS: ['L2'], MANTA: ['L2'],
  BLAST: ['L2'], MODE: ['L2'], ZRO: ['L2'], CKB: ['L2'],

  // Metaverse / Gaming
  SAND: ['Metaverse'], MANA: ['Metaverse'], AXS: ['Metaverse'], GALA: ['Metaverse'],
  ENJ: ['Metaverse'], RONIN: ['Metaverse'], ILV: ['Metaverse'], PIXEL: ['Metaverse'],
  YGG: ['Metaverse'], SUPER: ['Metaverse'], PORTAL: ['Metaverse'], BEAM: ['Metaverse'],
  NOT: ['Metaverse'], PRIME: ['Metaverse'], MAGIC: ['Metaverse'], ACE: ['Metaverse'],
  CHZ: ['Metaverse'], APE: ['Metaverse'],

  // Meme
  DOGE: ['Meme', 'Dino'], SHIB: ['Meme'], PEPE: ['Meme'], BONK: ['Meme'],
  WIF: ['Meme'], POPCAT: ['Meme'], FLOKI: ['Meme'], NEIRO: ['Meme'],
  TURBO: ['Meme'], PEOPLE: ['Meme'], BABYDOGE: ['Meme'], SATS: ['Meme'],
  CATS: ['Meme'], MEME: ['Meme'], MYRO: ['Meme'], MOG: ['Meme'],
  BRETT: ['Meme'], MEW: ['Meme'], DEGEN: ['Meme'], PONKE: ['Meme'],
  CAT: ['Meme'], DOGS: ['Meme'], PNUT: ['Meme'], GOAT: ['Meme'], ACT: ['Meme'],

  // Dino (2017 이전)
  LTC: ['Dino'], XRP: ['L1', 'Dino'], XLM: ['Dino'], XMR: ['Dino'],
  ZEC: ['Dino'], DASH: ['Dino'], ETC: ['Dino'], BCH: ['Dino'],
  NEO: ['Dino'], EOS: ['Dino'], IOTA: ['Dino'], XTZ: ['Dino'],
  QTUM: ['Dino'], ZIL: ['Dino'], BAT: ['Dino'], ONT: ['Dino'],
  DGB: ['Dino'], SC: ['Dino'], DCR: ['Dino'], RVN: ['Dino'],

  // AI
  FET: ['AI'], RENDER: ['AI'], TAO: ['AI'], WLD: ['AI'],
  ARKM: ['AI'], IOTX: ['AI'], JASMY: ['AI'], OCEAN: ['AI'],
  AGIX: ['AI'], NMR: ['AI'], GRT: ['AI'], AI: ['AI'],
  AIXBT: ['AI'], VIRTUAL: ['AI'],
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

/**
 * 코인 심볼 → 풀네임 매핑 (검색용)
 *
 * 테이블/스크리너에서 심볼뿐 아니라 코인 이름("Bitcoin")으로도 검색할 수 있도록 한다.
 * 매핑에 없는 코인은 심볼로만 검색된다.
 */
export const COIN_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB', XRP: 'Ripple',
  DOGE: 'Dogecoin', ADA: 'Cardano', AVAX: 'Avalanche', TRX: 'Tron', LINK: 'Chainlink',
  DOT: 'Polkadot', SUI: 'Sui', SHIB: 'Shiba Inu', TON: 'Toncoin', XLM: 'Stellar',
  HBAR: 'Hedera', BCH: 'Bitcoin Cash', LTC: 'Litecoin', UNI: 'Uniswap', PEPE: 'Pepe',
  NEAR: 'Near Protocol', APT: 'Aptos', FIL: 'Filecoin', ARB: 'Arbitrum', OP: 'Optimism',
  ATOM: 'Cosmos', RENDER: 'Render', FET: 'Fetch.ai', AAVE: 'Aave', MKR: 'Maker',
  INJ: 'Injective', SEI: 'Sei', STX: 'Stacks', IMX: 'Immutable', GRT: 'The Graph',
  ALGO: 'Algorand', SAND: 'The Sandbox', MANA: 'Decentraland', AXS: 'Axie Infinity', GALA: 'Gala',
  FTM: 'Fantom', BONK: 'Bonk', WIF: 'dogwifhat', FLOKI: 'Floki', ENA: 'Ethena',
  ONDO: 'Ondo', TIA: 'Celestia', JUP: 'Jupiter', WLD: 'Worldcoin', STRK: 'Starknet',
  ZK: 'zkSync', POL: 'Polygon', CRV: 'Curve', COMP: 'Compound', SNX: 'Synthetix',
  DYDX: 'dYdX', PENDLE: 'Pendle', TAO: 'Bittensor', JASMY: 'JasmyCoin', RUNE: 'THORChain',
  EOS: 'EOS', IOTA: 'IOTA', XMR: 'Monero', ZEC: 'Zcash', DASH: 'Dash',
  ETC: 'Ethereum Classic', NEO: 'Neo', AEVO: 'Aevo', MNT: 'Mantle', POPCAT: 'Popcat',
  ICP: 'Internet Computer', KAS: 'Kaspa', VET: 'VeChain', THETA: 'Theta', LDO: 'Lido DAO',
  QNT: 'Quant', EGLD: 'MultiversX', FLOW: 'Flow', AR: 'Arweave', ENS: 'Ethereum Name Service',
  GMX: 'GMX', CFX: 'Conflux', NOT: 'Notcoin', BRETT: 'Brett', PYTH: 'Pyth Network',
  W: 'Wormhole', MEW: 'cat in a dogs world', PEOPLE: 'ConstitutionDAO', ORDI: 'Ordinals',
  '1INCH': '1inch', SUSHI: 'SushiSwap', YFI: 'yearn.finance', CAKE: 'PancakeSwap',
  OSMO: 'Osmosis', KAVA: 'Kava', MINA: 'Mina', CELO: 'Celo', METIS: 'Metis',
  MANTA: 'Manta Network', ENJ: 'Enjin Coin', RONIN: 'Ronin', YGG: 'Yield Guild Games',
  TURBO: 'Turbo', MEME: 'Memecoin', MOG: 'Mog Coin', XTZ: 'Tezos', ZIL: 'Zilliqa',
  BAT: 'Basic Attention Token', ARKM: 'Arkham', IOTX: 'IoTeX', OCEAN: 'Ocean Protocol',
  NMR: 'Numeraire', UMA: 'UMA', BAND: 'Band Protocol', RSR: 'Reserve Rights', ASTR: 'Astar',
  ROSE: 'Oasis', ONE: 'Harmony', ZRX: '0x', KSM: 'Kusama', WAVES: 'Waves',
  CHZ: 'Chiliz', CVX: 'Convex', MAGIC: 'Magic', ZRO: 'LayerZero', SAGA: 'Saga',
  APE: 'ApeCoin', RVN: 'Ravencoin', DCR: 'Decred', EIGEN: 'EigenLayer', ETHFI: 'Ether.fi',
  AERO: 'Aerodrome', MORPHO: 'Morpho', VIRTUAL: 'Virtuals Protocol', AIXBT: 'aixbt',
  PNUT: 'Peanut the Squirrel', GOAT: 'Goatseus Maximus', DEGEN: 'Degen', DOGS: 'Dogs',
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

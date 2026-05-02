/**
 * English locale messages
 *
 * English text resource for BitScope service.
 * Structured identically to the Korean locale (ko.ts) so that
 * all keys are guaranteed to exist in both languages.
 *
 * @see requirement NF5.1 (multi-language support preparation)
 * @see requirement 9.9 (Korean and English language support)
 */

import type { Messages } from './ko';

const en: Messages = {
  /** Common */
  common: {
    appName: 'BitScope',
    appDescription: 'Integrated Korean Crypto Exchange Portfolio Viewer',
    loading: 'Loading',
    loadingWithEllipsis: 'Loading...',
    retry: 'Retry',
    retrying: 'Retrying...',
    retryAction: 'Try again',
    retryActionLong: 'Try again',
    cancel: 'Cancel',
    confirm: 'OK',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    search: 'Search',
    filter: 'Filter',
    sort: 'Sort',
    export: 'Export',
    import: 'Import',
    download: 'Download',
    upload: 'Upload',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    yes: 'Yes',
    no: 'No',
    unknown: 'Unknown',
    lastUpdate: 'Last update',
  },

  /** Navigation */
  nav: {
    dashboard: 'Dashboard',
    market: 'Market',
    premium: 'Kimchi Premium',
    premiumShort: 'Premium',
    analytics: 'Analytics',
    alerts: 'Alerts',
    reports: 'Reports',
    watchlist: 'Watchlist',
    settings: 'Settings',
    mainNavigation: 'Main navigation',
    sidebarMenu: 'Sidebar menu',
    mobileNavigation: 'Mobile navigation',
  },

  /** Navigation accessibility labels */
  navAria: {
    dashboard: 'Portfolio dashboard',
    market: 'Real-time market prices',
    premium: 'Kimchi premium analysis between exchanges',
    analytics: 'Portfolio performance analytics',
    alerts: 'Price alert management',
    reports: 'Reports and data export',
    watchlist: 'Watchlist',
    settings: 'API key management and settings',
  },

  /** Theme */
  theme: {
    toggle: 'Change theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },

  /** Error messages */
  errors: {
    network: {
      title: 'Network Error',
      message: 'Please check your internet connection. If the connection is unstable, please try again later.',
    },
    timeout: {
      title: 'Request Timeout',
      message: 'The exchange server response is delayed. Please try again later.',
    },
    auth: {
      title: 'Authentication Error',
      message: 'The API key is invalid or does not have sufficient permissions. Please check your API key.',
    },
    rateLimit: {
      title: 'Rate Limit Exceeded',
      message: 'The exchange API request limit has been reached. It will automatically retry shortly.',
    },
    exchangeMaintenance: {
      title: 'Exchange Under Maintenance',
      message: 'The exchange is under maintenance. Showing the last fetched data.',
    },
    general: {
      title: 'An Error Occurred',
      message: 'A temporary error has occurred. Please try again later.',
    },
    exchangeDataDelayed: (exchangeName: string, time: string) =>
      `${exchangeName} data delayed. Last update: ${time}`,
  },

  /** Exchanges */
  exchange: {
    upbit: 'Upbit',
    bithumb: 'Bithumb',
    coinone: 'Coinone',
  },

  /** Settings */
  settings: {
    title: 'Settings',
    language: 'Language',
    themeMode: 'Theme mode',
    refreshInterval: 'Auto-refresh interval',
    premiumThreshold: 'Premium alert threshold',
    seconds: 'sec',
    percent: '%',
  },

  /** Dashboard */
  dashboard: {
    totalEvaluation: 'Total Evaluation',
    totalInvestment: 'Total Investment',
    totalProfitLoss: 'Total P&L',
    totalProfitLossRate: 'Total Return',
    refresh: 'Refresh',
    autoRefresh: 'Auto-refresh',
    holdings: 'Holdings',
    noHoldings: 'No holdings registered.',
    loadingAssets: 'Loading asset information...',
  },

  /** Portfolio */
  portfolio: {
    coinName: 'Coin',
    quantity: 'Quantity',
    avgBuyPrice: 'Avg. Buy Price',
    currentPrice: 'Current Price',
    evaluationAmount: 'Evaluation',
    profitLossRate: 'Return',
    exchangeDistribution: 'Exchange Distribution',
    coinDistribution: 'Coin Distribution',
  },

  /** Market */
  market: {
    price: 'Price',
    changeRate24h: '24h Change',
    volume24h: 'Volume (24h)',
    topVolume: 'Top Volume',
    topGainers: 'Top Gainers',
    topLosers: 'Top Losers',
    searchPlaceholder: 'Search by coin name or ticker',
  },

  /** Kimchi Premium */
  premiumAnalysis: {
    priceDifference: 'Price Difference',
    premiumRate: 'Premium Rate',
    period24h: '24 hours',
    period7d: '7 days',
    period30d: '30 days',
    history: 'Premium History',
  },

  /** Alerts */
  alert: {
    priceAlert: 'Price Alert',
    premiumAlert: 'Premium Alert',
    active: 'Active',
    inactive: 'Inactive',
    history: 'Alert History',
    conditionAbove: 'above',
    conditionBelow: 'below',
    targetPrice: 'Target Price',
    noAlerts: 'No alerts configured.',
  },

  /** Reports */
  report: {
    generate: 'Generate Report',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    custom: 'Custom',
    reportHistory: 'Report History',
    exportCsv: 'Export CSV',
    exportJson: 'Export JSON',
    exportPdf: 'Export PDF',
    settingsBackup: 'Backup Settings',
    settingsRestore: 'Restore Settings',
  },

  /** Watchlist */
  watchlist: {
    addCoin: 'Add Coin',
    removeCoin: 'Remove Coin',
    noCoinInList: 'No coins in watchlist.',
  },

  /** Onboarding */
  onboarding: {
    welcome: 'Welcome to BitScope',
    step1: 'Select Exchange',
    step2: 'Enter API Key',
    step3: 'Verify Assets',
    skip: 'Skip',
    complete: 'Complete',
    demoMode: 'Try Demo Mode',
  },

  /** Wallet connection */
  wallet: {
    connect: 'Connect Wallet',
    disconnect: 'Disconnect Wallet',
    connected: 'Connected',
    notConnected: 'Wallet not connected',
    installMetamask: 'Please install MetaMask',
    walletChanged: 'Wallet changed. Please re-register your API keys.',
    signRequest: 'Requesting signature',
    /** Connect page */
    connectPage: {
      title: 'Connect Your Wallet',
      description:
        'Connect a Web3 wallet like MetaMask to start using BitScope. No registration required — authenticate securely with your wallet address.',
      connectButton: 'Connect Wallet',
      connecting: 'Connecting...',
      securityNotice: 'Secure Service',
      securityDescription:
        'API Keys are encrypted in your browser and never sent to the server.',
      noWalletTitle: 'Web3 Wallet Required',
      noWalletDescription:
        'BitScope requires a Web3 wallet such as MetaMask. Click the button below to install MetaMask.',
      installMetamask: 'Install MetaMask',
      features: {
        portfolio: 'Unified Portfolio',
        portfolioDesc: 'View your Upbit, Bithumb, and Coinone assets at a glance.',
        realtime: 'Real-time Prices',
        realtimeDesc: 'Monitor live exchange prices and kimchi premium.',
        secure: 'Secure by Design',
        secureDesc: 'Zero-Knowledge architecture — API Keys never leave your browser.',
      },
    },
    /** Auth required message for protected routes */
    authRequired: {
      title: 'Wallet Connection Required',
      description: 'Please connect your Web3 wallet to access this page.',
      connectButton: 'Go to Connect Wallet',
    },
  },

  /** API key management */
  apiKey: {
    register: 'Register API Key',
    registerDescription: "Register your exchange's Read-Only API key.",
    accessKey: 'Access Key',
    secretKey: 'Secret Key',
    registeredAt: 'Registered',
    connectionStatus: 'Status',
    deleteConfirm: 'Are you sure you want to delete this API key?',
    securityWarning: 'Please reissue with Read-Only permissions.',
    guideLink: 'API Key Guide',
    validating: 'Validating...',
    valid: 'Valid key',
    invalid: 'Invalid key',
    /** Settings page */
    settingsPage: {
      title: 'API Key Management',
      description: 'Register and manage exchange API keys. Only register Read-Only API keys.',
      registerNew: 'Register New API Key',
      selectExchange: 'Select Exchange',
      accessKeyPlaceholder: 'Enter Access Key',
      secretKeyPlaceholder: 'Enter Secret Key',
      registerButton: 'Register',
      cancelButton: 'Cancel',
      deleteButton: 'Delete',
      confirmDelete: 'Confirm Deletion',
      confirmDeleteDescription: 'All data related to this API key will be immediately deleted. This action cannot be undone.',
      connected: 'Connected',
      disconnected: 'Disconnected',
      error: 'Error',
      noKeys: 'No API keys registered.',
      noKeysDescription: 'Register exchange API keys to view your portfolio.',
      signatureRequired: 'Signature Required',
      signatureDescription: 'A wallet signature is required to securely encrypt your API keys.',
      signButton: 'Sign',
      registering: 'Registering...',
      registerSuccess: 'API key registered successfully.',
      registerFailed: 'Failed to register API key.',
      deleteSuccess: 'API key deleted.',
      securityNotice: 'Security Notice',
      securityNoticeDescription: 'API keys are encrypted in your browser and never sent to the server. Only register Read-Only API keys.',
      readOnlyWarning: 'Warning: Non-Read-Only API key detected.',
      readOnlyWarningDescription: 'For security, we strongly recommend reissuing with Read-Only (view-only) permissions.',
      guideTitle: 'How to Get API Keys',
      guideDescription: 'Learn how to generate API keys for each exchange.',
      guides: {
        upbit: 'https://upbit.com/mypage/open_api_management',
        bithumb: 'https://www.bithumb.com/api_support/management_api',
        coinone: 'https://coinone.co.kr/developer/app',
      },
      guideSteps: {
        upbit: 'Upbit > My Page > Open API Management',
        bithumb: 'Bithumb > Customer Center > API Management',
        coinone: 'Coinone > Developer Center > App Management',
      },
    },
  },
} as const;

export default en;

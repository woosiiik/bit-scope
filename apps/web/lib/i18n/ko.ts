/**
 * 한국어 로케일 메시지
 *
 * BitScope 서비스의 한국어 텍스트 리소스이다.
 * 기본 언어(NF5.1)로서 모든 UI 텍스트의 원본이 된다.
 *
 * @see 요구사항 NF5.1 (한국어 기본 언어)
 */

const ko = {
  /** 공통 */
  common: {
    appName: 'BitScope',
    appDescription: '한국 암호화폐 거래소 포트폴리오 통합 조회 서비스',
    loading: '로딩 중',
    loadingWithEllipsis: '로딩 중...',
    retry: '재시도',
    retrying: '재시도 중...',
    retryAction: '다시 시도',
    retryActionLong: '다시 시도하기',
    cancel: '취소',
    confirm: '확인',
    save: '저장',
    delete: '삭제',
    edit: '수정',
    close: '닫기',
    search: '검색',
    filter: '필터',
    sort: '정렬',
    export: '내보내기',
    import: '가져오기',
    download: '다운로드',
    upload: '업로드',
    back: '뒤로',
    next: '다음',
    previous: '이전',
    yes: '예',
    no: '아니오',
    unknown: '알 수 없음',
    lastUpdate: '마지막 업데이트',
  },

  /** 네비게이션 */
  nav: {
    dashboard: '대시보드',
    market: '마켓',
    premium: '김치 프리미엄',
    premiumShort: '김프',
    analytics: '성과 분석',
    alerts: '알림',
    reports: '리포트',
    watchlist: '워치리스트',
    settings: '설정',
    mainNavigation: '메인 네비게이션',
    sidebarMenu: '사이드바 메뉴',
    mobileNavigation: '모바일 네비게이션',
  },

  /** 네비게이션 접근성 레이블 */
  navAria: {
    dashboard: '포트폴리오 대시보드',
    market: '실시간 마켓 시세',
    premium: '거래소 간 김치 프리미엄 분석',
    analytics: '포트폴리오 성과 분석',
    alerts: '가격 알림 관리',
    reports: '리포트 및 데이터 내보내기',
    watchlist: '관심 코인 목록',
    settings: 'API 키 관리 및 설정',
  },

  /** 테마 */
  theme: {
    toggle: '테마 변경',
    light: '라이트',
    dark: '다크',
    system: '시스템',
  },

  /** 오류 메시지 */
  errors: {
    network: {
      title: '네트워크 오류',
      message: '인터넷 연결을 확인해주세요. 연결이 불안정한 경우 잠시 후 다시 시도해주세요.',
    },
    timeout: {
      title: '응답 시간 초과',
      message: '거래소 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.',
    },
    auth: {
      title: '인증 오류',
      message: 'API 키가 유효하지 않거나 권한이 부족합니다. API 키를 확인해주세요.',
    },
    rateLimit: {
      title: '요청 제한 초과',
      message: '거래소 API 요청 한도에 도달했습니다. 잠시 후 자동으로 재시도됩니다.',
    },
    exchangeMaintenance: {
      title: '거래소 점검 중',
      message: '거래소가 점검 중입니다. 마지막으로 조회된 데이터를 표시합니다.',
    },
    general: {
      title: '오류가 발생했습니다',
      message: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    },
    exchangeDataDelayed: (exchangeName: string, time: string) =>
      `${exchangeName} 데이터 지연 중. 마지막 업데이트: ${time}`,
  },

  /** 거래소 */
  exchange: {
    upbit: '업비트',
    bithumb: '빗썸',
    coinone: '코인원',
  },

  /** 설정 */
  settings: {
    title: '설정',
    language: '언어',
    themeMode: '테마 모드',
    refreshInterval: '자동 갱신 주기',
    premiumThreshold: '김프 알림 임계값',
    seconds: '초',
    percent: '%',
  },

  /** 대시보드 */
  dashboard: {
    totalEvaluation: '총 평가금액',
    totalInvestment: '총 투자금액',
    totalProfitLoss: '총 손익',
    totalProfitLossRate: '총 수익률',
    refresh: '새로고침',
    autoRefresh: '자동 갱신',
    holdings: '보유 자산',
    noHoldings: '등록된 보유 자산이 없습니다.',
    loadingAssets: '자산 정보를 불러오는 중...',
  },

  /** 포트폴리오 */
  portfolio: {
    coinName: '코인명',
    quantity: '수량',
    avgBuyPrice: '매수 평균가',
    currentPrice: '현재가',
    evaluationAmount: '평가금액',
    profitLossRate: '수익률',
    exchangeDistribution: '거래소별 비중',
    coinDistribution: '코인별 비중',
  },

  /** 마켓 */
  market: {
    price: '현재가',
    changeRate24h: '24시간 변동률',
    volume24h: '거래량 (24h)',
    topVolume: '거래량 상위',
    topGainers: '상승률 상위',
    topLosers: '하락률 상위',
    searchPlaceholder: '코인명 또는 티커 검색',
  },

  /** 김치 프리미엄 */
  premiumAnalysis: {
    priceDifference: '가격 차이',
    premiumRate: '프리미엄 비율',
    period24h: '24시간',
    period7d: '7일',
    period30d: '30일',
    history: '김프 추이',
  },

  /** 알림 */
  alert: {
    priceAlert: '가격 알림',
    premiumAlert: '김프 알림',
    active: '활성',
    inactive: '비활성',
    history: '알림 이력',
    conditionAbove: '이상',
    conditionBelow: '이하',
    targetPrice: '목표 가격',
    noAlerts: '설정된 알림이 없습니다.',
  },

  /** 리포트 */
  report: {
    generate: '리포트 생성',
    daily: '일간',
    weekly: '주간',
    monthly: '월간',
    custom: '사용자 지정',
    reportHistory: '리포트 이력',
    exportCsv: 'CSV 내보내기',
    exportJson: 'JSON 내보내기',
    exportPdf: 'PDF 내보내기',
    settingsBackup: '설정 백업',
    settingsRestore: '설정 복원',
  },

  /** 워치리스트 */
  watchlist: {
    addCoin: '코인 추가',
    removeCoin: '코인 제거',
    noCoinInList: '관심 코인이 없습니다.',
  },

  /** 온보딩 */
  onboarding: {
    welcome: 'BitScope에 오신 것을 환영합니다',
    step1: '거래소 선택',
    step2: 'API 키 입력',
    step3: '자산 조회 확인',
    skip: '건너뛰기',
    complete: '완료',
    demoMode: '데모 모드로 체험하기',
  },

  /** 지갑 연결 */
  wallet: {
    connect: '지갑 연결',
    disconnect: '지갑 연결 해제',
    connected: '연결됨',
    notConnected: '지갑이 연결되지 않았습니다',
    installMetamask: 'MetaMask를 설치해주세요',
    walletChanged: '지갑이 변경되었습니다. API 키를 다시 등록해주세요.',
    signRequest: '서명을 요청합니다',
    /** 지갑 연결 페이지 전용 */
    connectPage: {
      title: '지갑을 연결하세요',
      description:
        'MetaMask 등 Web3 지갑을 연결하여 BitScope를 시작하세요. 별도의 회원가입이 필요 없으며, 지갑 주소로 안전하게 인증됩니다.',
      connectButton: '지갑 연결하기',
      connecting: '연결 중...',
      securityNotice: '안전한 서비스',
      securityDescription:
        'API Key는 브라우저에서 암호화되어 저장되며, 서버로 전송되지 않습니다.',
      noWalletTitle: 'Web3 지갑이 필요합니다',
      noWalletDescription:
        'BitScope를 사용하려면 MetaMask와 같은 Web3 지갑이 필요합니다. 아래 버튼을 클릭하여 MetaMask를 설치해주세요.',
      installMetamask: 'MetaMask 설치하기',
      features: {
        portfolio: '통합 포트폴리오',
        portfolioDesc: '업비트, 빗썸, 코인원의 자산을 한눈에 확인하세요.',
        realtime: '실시간 시세',
        realtimeDesc: '거래소 실시간 시세와 김치 프리미엄을 모니터링하세요.',
        secure: '안전한 보안',
        secureDesc: 'API Key가 서버에 전송되지 않는 Zero-Knowledge 구조입니다.',
      },
    },
    /** 보호된 라우트에서 미인증 시 표시 */
    authRequired: {
      title: '지갑 연결이 필요합니다',
      description: '이 페이지를 이용하려면 Web3 지갑을 연결해주세요.',
      connectButton: '지갑 연결하러 가기',
    },
  },

  /** API 키 관리 */
  apiKey: {
    register: 'API 키 등록',
    registerDescription: '거래소의 Read-Only API 키를 등록하세요.',
    accessKey: 'Access Key',
    secretKey: 'Secret Key',
    registeredAt: '등록일',
    connectionStatus: '연결 상태',
    deleteConfirm: '이 API 키를 삭제하시겠습니까?',
    securityWarning: 'Read-Only 권한의 API 키로 재발급해주세요.',
    guideLink: 'API 키 발급 가이드',
    validating: '유효성 검증 중...',
    valid: '유효한 키',
    invalid: '유효하지 않은 키',
    /** 설정 페이지 전용 */
    settingsPage: {
      title: 'API 키 관리',
      description: '거래소 API 키를 등록하고 관리합니다. Read-Only 권한의 API 키만 등록하세요.',
      registerNew: '새 API 키 등록',
      selectExchange: '거래소 선택',
      accessKeyPlaceholder: 'Access Key를 입력하세요',
      secretKeyPlaceholder: 'Secret Key를 입력하세요',
      registerButton: '등록',
      cancelButton: '취소',
      deleteButton: '삭제',
      confirmDelete: '정말 삭제하시겠습니까?',
      confirmDeleteDescription: '이 API 키와 관련된 모든 데이터가 즉시 삭제됩니다. 이 작업은 되돌릴 수 없습니다.',
      connected: '연결됨',
      disconnected: '연결 해제',
      error: '오류',
      noKeys: '등록된 API 키가 없습니다.',
      noKeysDescription: '거래소 API 키를 등록하면 포트폴리오를 조회할 수 있습니다.',
      signatureRequired: '서명이 필요합니다',
      signatureDescription: 'API 키를 안전하게 암호화하기 위해 지갑 서명이 필요합니다.',
      signButton: '서명하기',
      registering: '등록 중...',
      registerSuccess: 'API 키가 성공적으로 등록되었습니다.',
      registerFailed: 'API 키 등록에 실패했습니다.',
      deleteSuccess: 'API 키가 삭제되었습니다.',
      securityNotice: '보안 안내',
      securityNoticeDescription: 'API 키는 브라우저에서 암호화되어 저장되며, 서버로 전송되지 않습니다. Read-Only 권한의 API 키만 등록하세요.',
      readOnlyWarning: '주의: Read-Only 권한이 아닌 API 키가 감지되었습니다.',
      readOnlyWarningDescription: '보안을 위해 Read-Only(조회 전용) 권한의 API 키로 재발급하는 것을 강력히 권장합니다.',
      guideTitle: 'API 키 발급 방법',
      guideDescription: '각 거래소의 API 키 발급 방법을 확인하세요.',
      /** 거래소별 API 키 발급 가이드 URL */
      guides: {
        upbit: 'https://upbit.com/mypage/open_api_management',
        bithumb: 'https://www.bithumb.com/api_support/management_api',
        coinone: 'https://coinone.co.kr/developer/app',
      },
      guideSteps: {
        upbit: '업비트 > 마이페이지 > Open API 관리에서 발급할 수 있습니다.',
        bithumb: '빗썸 > 고객센터 > API 관리에서 발급할 수 있습니다.',
        coinone: '코인원 > 개발자 센터 > 앱 관리에서 발급할 수 있습니다.',
      },
    },
  },
} as const;

/**
 * 재귀적으로 모든 리터럴 문자열 타입을 string으로 변환하는 유틸리티 타입.
 * 이를 통해 영어 로케일이 동일한 키 구조를 가지면서
 * 다른 문자열 값을 사용할 수 있다.
 */
type DeepStringify<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R extends string ? string : DeepStringify<R>
  : T extends string
    ? string
    : T extends object
      ? { [K in keyof T]: DeepStringify<T[K]> }
      : T;

export type Messages = DeepStringify<typeof ko>;
export default ko;

/**
 * Next.js 서버 시작 전 preload 스크립트
 *
 * MetaMask/WalletConnect SDK가 서버사이드에서 indexedDB를
 * 참조하여 ReferenceError가 발생하는 것을 방지한다.
 * 빈 stub을 글로벌에 등록하여 에러를 무시한다.
 *
 * 주의: localStorage/sessionStorage stub은 추가하지 않는다.
 * SSR에서 값을 반환하면 CSR과 hydration 불일치(React #418)가 발생한다.
 */

// indexedDB stub (MetaMask SDK가 참조)
if (typeof globalThis.indexedDB === 'undefined') {
  globalThis.indexedDB = /** @type {any} */ ({
    open: () => ({
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      result: {
        transaction: () => ({
          objectStore: () => ({
            get: () => ({ onsuccess: null, onerror: null }),
            put: () => ({ onsuccess: null, onerror: null }),
            delete: () => ({ onsuccess: null, onerror: null }),
          }),
        }),
        close: () => {},
      },
    }),
    deleteDatabase: () => ({ onsuccess: null, onerror: null }),
  });
}

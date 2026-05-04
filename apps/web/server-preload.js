/**
 * Next.js 서버 시작 전 preload 스크립트
 *
 * MetaMask/WalletConnect SDK가 서버사이드에서 indexedDB 등
 * 브라우저 전용 API를 참조하여 ReferenceError가 발생하는 것을 방지한다.
 * 빈 stub을 글로벌에 등록하여 에러를 무시한다.
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

// localStorage stub
if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = /** @type {any} */ ({
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
  });
}

// sessionStorage stub
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = {};
  globalThis.sessionStorage = /** @type {any} */ ({
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
  });
}

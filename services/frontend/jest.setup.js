import '@testing-library/jest-dom';

// Mock pretty-print-json
jest.mock('pretty-print-json', () => ({
  prettyPrintJson: {
    toHtml: jest.fn(() => '<div>mocked pretty print</div>'),
  },
}));

// Mock i18n so components can use translations without an I18nProvider wrapper.
// Resolves real English messages from the actual config (default locale = 'en').
jest.mock('@/i18n', () => {
  const actual = jest.requireActual('@/i18n');
  const { messages, defaultLocale } = actual;
  const getNested = (obj, path) =>
    path.split('.').reduce((acc, key) => {
      if (acc && typeof acc === 'object' && key in acc) {
        return acc[key];
      }
      return undefined;
    }, obj);
  const t = (key) => {
    const value = getNested(messages[defaultLocale], key);
    return typeof value === 'string' ? value : key;
  };
  return {
    ...actual,
    I18nProvider: ({ children = null }) => children,
    useI18n: () => ({
      locale: defaultLocale,
      messages: messages[defaultLocale],
      setLocale: () => {},
      t,
    }),
    useLocale: () => defaultLocale,
    useTranslations: () => t,
  };
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Polyfill structuredClone (not exposed in the jsdom test environment).
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}

// Treat the test environment as a secure (HTTPS) context, matching production.
Object.defineProperty(window, 'isSecureContext', {
  writable: true,
  value: true,
});

// Use a desktop viewport so useMobileDetection() renders the desktop layout.
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  configurable: true,
  value: 1280,
});
Object.defineProperty(window, 'innerHeight', {
  writable: true,
  configurable: true,
  value: 900,
});

// Mock MediaDevices API
Object.defineProperty(window.navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn(),
  },
});

// Mock AudioContext
global.AudioContext = jest.fn().mockImplementation(() => ({
  createMediaStreamSource: jest.fn(),
  createScriptProcessor: jest.fn(),
  destination: {},
  sampleRate: 44100,
  connect: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock WebSocket
global.WebSocket = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
}));

// Mock authUtils to avoid authentication in tests
jest.mock('@/auth/authUtils', () => ({
  BEARER_COOKIE: 'bearerToken',
  addAuthHeaders: (headers = {}) => headers,
  getAuthHeaders: () => ({}),
  getBearerToken: () => undefined,
  setBearerToken: () => {},
  clearBearerToken: () => {},
}));

// Mock fetch function with proper blob support
global.fetch = jest.fn().mockImplementation((url) => {
  if (url.includes('/v1/health')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, connected: 'yes_request_ok' }),
    });
  }
  if (url.includes('/v1/tts')) {
    return Promise.resolve({
      ok: true,
      blob: () =>
        Promise.resolve(new Blob(['mock-audio'], { type: 'audio/wav' })),
    });
  }
  if (url.includes('/v1/user/')) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          user_id: '12345678-1234-4234-8234-123456789012',
          user_settings: {
            name: 'Test User',
            prompt: 'Test prompt',
            additional_keywords: ['test', 'keyword'],
            friends: ['friend1', 'friend2'],
            documents: [],
          },
          conversations: [],
        }),
    });
  }
  return Promise.reject(new Error('Fetch not mocked properly'));
});

// Suppress console.error for failed fetch calls during tests
const originalError = console.error;
console.error = (...args) => {
  // Only suppress specific userData fetch error messages and TTS cache errors
  if (
    args[0] === 'Failed to fetch user data:' &&
    args[1] === 'Network error: Fetch not mocked properly'
  ) {
    return;
  }
  if (
    args[0] === 'Failed to fetch user data:' &&
    args[1] === 'Network error: Unknown URL'
  ) {
    return;
  }
  if (typeof args[0] === 'string' && args[0].includes('Failed to pre-cache')) {
    return;
  }
  if (typeof args[0] === 'string' && args[0].includes('Failed to pre-fetch TTS')) {
    return;
  }
  originalError.apply(console, args);
};

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock Audio constructor
global.Audio = jest.fn().mockImplementation(() => ({
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// Mock MediaStream
global.MediaStream = jest.fn().mockImplementation(() => ({
  getTracks: () => [],
  getAudioTracks: () => [],
  getVideoTracks: () => [],
}));

// Mock requestAnimationFrame and cancelAnimationFrame for animations
global.requestAnimationFrame = jest.fn((callback) => {
  return setTimeout(() => callback(Date.now()), 0);
});
global.cancelAnimationFrame = jest.fn((id) => {
  clearTimeout(id);
});

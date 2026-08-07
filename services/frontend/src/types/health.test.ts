import { hasInternetConnectivity } from './health';

describe('hasInternetConnectivity', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });

  test('returns undefined when navigator is missing', () => {
    Object.defineProperty(global, 'navigator', {
      value: undefined,
      configurable: true,
    });
    expect(hasInternetConnectivity()).toBeUndefined();
  });

  test('returns navigator.onLine when available', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      configurable: true,
    });
    expect(hasInternetConnectivity()).toBe(true);

    Object.defineProperty(global, 'navigator', {
      value: { onLine: false },
      configurable: true,
    });
    expect(hasInternetConnectivity()).toBe(false);
  });
});

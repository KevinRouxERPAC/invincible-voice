import {
  isLocalMode,
  isLocalModeEnabled,
  isLocalOnlyMode,
  setLocalModeEnabled,
} from '../localMode';

jest.mock('@/utils/platform', () => ({
  isNativeApp: jest.fn(() => true),
}));

const { isNativeApp } = jest.requireMock('@/utils/platform');

describe('localMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete process.env.NEXT_PUBLIC_LOCAL_MODE;
    isNativeApp.mockReturnValue(true);
  });

  it('defaults to enabled so the app survives losing the network', () => {
    expect(isLocalModeEnabled()).toBe(true);
  });

  it('stays disabled once the user turns it off in Settings', () => {
    setLocalModeEnabled(false);
    expect(isLocalModeEnabled()).toBe(false);
  });

  it('can be turned back on', () => {
    setLocalModeEnabled(false);
    setLocalModeEnabled(true);
    expect(isLocalModeEnabled()).toBe(true);
  });

  it('is forced on by the build flag, ignoring storage', () => {
    setLocalModeEnabled(false);
    process.env.NEXT_PUBLIC_LOCAL_MODE = '1';
    expect(isLocalModeEnabled()).toBe(true);
  });

  it('is forced off by the build flag, ignoring storage', () => {
    setLocalModeEnabled(true);
    process.env.NEXT_PUBLIC_LOCAL_MODE = '0';
    expect(isLocalModeEnabled()).toBe(false);
  });

  it('never engages on the web build', () => {
    isNativeApp.mockReturnValue(false);
    expect(isLocalMode()).toBe(false);
  });
});

describe('isLocalOnlyMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete process.env.NEXT_PUBLIC_LOCAL_MODE;
    isNativeApp.mockReturnValue(true);
  });

  // Local-only disables the login flow, so it must never be inferred from the
  // fallback being enabled — only an explicit build flag turns it on.
  it('is off by default even though the fallback is on', () => {
    expect(isLocalModeEnabled()).toBe(true);
    expect(isLocalOnlyMode()).toBe(false);
  });

  it('is not turned on by the Settings switch', () => {
    setLocalModeEnabled(true);
    expect(isLocalOnlyMode()).toBe(false);
  });

  it('is on only with the build flag, on native', () => {
    process.env.NEXT_PUBLIC_LOCAL_MODE = '1';
    expect(isLocalOnlyMode()).toBe(true);

    isNativeApp.mockReturnValue(false);
    expect(isLocalOnlyMode()).toBe(false);
  });
});

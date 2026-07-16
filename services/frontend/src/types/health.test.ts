import { shouldUseLocalFallback, type HealthStatus } from './health';

describe('shouldUseLocalFallback', () => {
  test('uses local mode before the first probe resolves', () => {
    expect(shouldUseLocalFallback(true, null)).toBe(true);
  });

  test('uses cloud mode when the backend is healthy', () => {
    const healthStatus: HealthStatus = {
      connected: 'yes_request_ok',
      ok: true,
      mode: 'cloud',
      internet_up: true,
      backend_up: true,
      llm_up: true,
    };

    expect(shouldUseLocalFallback(true, healthStatus)).toBe(false);
  });

  test('keeps local mode when the fallback is selected', () => {
    const healthStatus: HealthStatus = {
      connected: 'no',
      ok: true,
      mode: 'local',
      internet_up: false,
      backend_up: false,
      llm_up: true,
      stt_up: true,
      tts_up: true,
    };

    expect(shouldUseLocalFallback(true, healthStatus)).toBe(true);
  });

  test('never uses local mode when the device is not local-capable', () => {
    const healthStatus: HealthStatus = {
      connected: 'no',
      ok: false,
      mode: 'local',
    };

    expect(shouldUseLocalFallback(false, healthStatus)).toBe(false);
  });
});

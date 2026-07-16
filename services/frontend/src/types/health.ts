export type HealthStatus = {
  connected: 'no' | 'yes_request_ok' | 'yes_request_fail';
  ok: boolean;
  internet_up?: boolean;
  backend_up?: boolean;
  tts_up?: boolean;
  stt_up?: boolean;
  llm_up?: boolean;
  backend_url?: string;
  mode?: 'cloud' | 'local';
};

export const hasInternetConnectivity = (): boolean | undefined => {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
  return typeof navigator.onLine === 'boolean' ? navigator.onLine : undefined;
};

export const shouldUseLocalFallback = (
  localCapable: boolean,
  healthStatus: HealthStatus | null,
): boolean => {
  if (!localCapable) {
    return false;
  }
  // Before the first probe resolves, default to local so the native app still
  // works in airplane mode and during backend cold starts.
  if (!healthStatus) {
    return true;
  }
  return healthStatus.mode === 'local';
};

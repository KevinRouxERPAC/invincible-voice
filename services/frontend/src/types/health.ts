export type HealthStatus = {
  connected: 'no' | 'yes_request_ok' | 'yes_request_fail';
  ok: boolean;
  internet_up?: boolean;
  backend_up?: boolean;
  tts_up?: boolean;
  stt_up?: boolean;
  llm_up?: boolean;
  backend_url?: string;
};

export const hasInternetConnectivity = (): boolean | undefined => {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
  return typeof navigator.onLine === 'boolean' ? navigator.onLine : undefined;
};

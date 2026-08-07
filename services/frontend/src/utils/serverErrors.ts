const LEGACY_SERVER_ERRORS: Record<string, string> = {
  'Internal server error :( Complain to Kyutai':
    'Le serveur a rencontré une erreur. Réessayez dans un instant.',
};

/** Map legacy / English backend fatal messages to user-facing French copy. */
export function humanizeServerError(message: string): string {
  return LEGACY_SERVER_ERRORS[message] ?? message;
}

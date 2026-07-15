import { parseSuggestions } from '../localLlm';

// The native plugin import inside localLlm pulls Capacitor; neutralize it.
jest.mock('@/plugins/llamaCpp', () => ({ LlamaCpp: {} }));

describe('parseSuggestions keyword cleanup', () => {
  it('dedupes keywords case- and accent-insensitively (live S25+ outputs)', () => {
    // Both duplicates were produced verbatim by the on-device 1.5B model.
    const result = parseSuggestions(
      JSON.stringify({
        suggested_answers: ['Oui.', 'Non.', 'Je ne sais pas.'],
        suggested_keywords: [
          'sélection',
          'peux-tu',
          'menu',
          'selection',
          'Peux-tu',
          'options',
        ],
      }),
    );
    expect(result.suggested_keywords).toEqual([
      'sélection',
      'peux-tu',
      'menu',
      'options',
    ]);
  });

  it('drops empty/whitespace keywords and caps the list', () => {
    const result = parseSuggestions(
      JSON.stringify({
        suggested_answers: [],
        suggested_keywords: ['', '  ', 'a', 'b', 'c', 'd', 'e', 'f', 'g'],
      }),
    );
    expect(result.suggested_keywords).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('keeps answers untouched and bounded', () => {
    const result = parseSuggestions(
      JSON.stringify({
        suggested_answers: ['Un.', 'Deux.', 'Trois.', 'Quatre.'],
        suggested_keywords: [],
      }),
    );
    expect(result.suggested_answers).toEqual(['Un.', 'Deux.', 'Trois.']);
  });
});

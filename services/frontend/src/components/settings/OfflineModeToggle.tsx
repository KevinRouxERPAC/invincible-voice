'use client';

import { useCallback, useEffect, useState, FC } from 'react';
import { useTranslations } from '@/i18n';
import { isLocalModeEnabled, setLocalModeEnabled } from '@/utils/localMode';
import { deleteDownloadedModel } from '@/utils/modelManager';
import { isNativeApp } from '@/utils/platform';

/**
 * Lets the user keep or drop the on-device fallback model. Only meaningful in
 * the native app: the web build always talks to the backend.
 *
 * Turning it off deletes the ~1 GB model, which is the whole point of the
 * switch — a user on a small phone may prefer the space over offline support.
 */
const OfflineModeToggle: FC = () => {
  const t = useTranslations();
  const [enabled, setEnabled] = useState(true);

  // localStorage is not available during SSR, so read it after mount.
  useEffect(() => {
    setEnabled(isLocalModeEnabled());
  }, []);

  const onToggle = useCallback((next: boolean) => {
    setEnabled(next);
    setLocalModeEnabled(next);
    if (!next) {
      deleteDownloadedModel().catch(() => {
        // Reclaiming the space is best-effort; the flag is what matters.
      });
    }
  }, []);

  if (!isNativeApp()) {
    return null;
  }

  return (
    <div>
      <label className='flex items-center justify-between gap-2 cursor-pointer px-2'>
        <span className='text-sm font-medium text-ink'>
          {t('model.offlineFallback')}
        </span>
        <input
          type='checkbox'
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className='size-5 accent-green'
        />
      </label>
      <p className='mt-1 px-2 text-xs text-muted'>
        {t('model.offlineFallbackHelp')}
      </p>
    </div>
  );
};

export default OfflineModeToggle;

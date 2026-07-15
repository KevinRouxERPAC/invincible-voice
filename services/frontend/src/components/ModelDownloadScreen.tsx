'use client';

import { FC } from 'react';
import { useTranslations } from '@/i18n';

interface ModelDownloadScreenProps {
  receivedBytes: number;
  totalBytes: number | null;
}

const formatMegabytes = (bytes: number): string =>
  `${Math.round(bytes / (1024 * 1024))} Mo`;

/**
 * Shown on first run when the backend is unreachable and the offline model is
 * still being fetched. Without it the user would see the "cannot connect"
 * screen and assume the app is broken.
 */
const ModelDownloadScreen: FC<ModelDownloadScreenProps> = ({
  receivedBytes,
  totalBytes,
}) => {
  const t = useTranslations();
  const percent =
    totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100))
      : null;

  return (
    <div className='flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center'>
      <h1 className='text-xl text-ink'>{t('model.downloadTitle')}</h1>
      <p className='text-sm text-muted max-w-sm'>
        {t('model.downloadExplanation')}
      </p>

      <div
        className='w-full max-w-sm h-2 bg-surface-2 rounded-full overflow-hidden'
        role='progressbar'
        aria-valuenow={percent ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('model.downloadTitle')}
      >
        <div
          className='h-full bg-sage transition-[width] duration-300'
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>

      <p className='text-sm text-ink-2'>
        {percent !== null && totalBytes
          ? `${percent}% — ${formatMegabytes(receivedBytes)} / ${formatMegabytes(totalBytes)}`
          : formatMegabytes(receivedBytes)}
      </p>
    </div>
  );
};

export default ModelDownloadScreen;

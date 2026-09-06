import { FC } from 'react';
import { useTranslations } from '@/i18n';

interface ServerWakingProps {
  /** Current retry attempt (1-based). */
  attempt: number;
  /** Total number of attempts before giving up and showing the fallback. */
  total: number;
}

/**
 * Full-screen "server is waking up" screen shown while health-check retries
 * are spaced out to absorb a Cloud Run cold start (~70 s measured). The user
 * must understand the app is NOT broken: the backend was idle and is starting,
 * and the page recovers by itself once the server answers.
 */
const ServerWaking: FC<ServerWakingProps> = ({ attempt, total }) => {
  const t = useTranslations();

  return (
    <div className='w-full min-h-screen flex flex-col items-center justify-center gap-6 px-6 bg-paper text-ink'>
      <div className='relative flex items-center justify-center w-32 h-32'>
        <div
          className='absolute w-28 h-28 rounded-full bg-blue-tint animate-ping'
          aria-hidden='true'
        />
        <div
          className='w-20 h-20 rounded-full bg-blue-tint border-2 border-blue flex items-center justify-center'
          aria-hidden='true'
        >
          <svg
            viewBox='0 0 24 24'
            className='w-10 h-10 text-blue'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.8'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            {/* Server stack icon */}
            <rect
              x='3'
              y='4'
              width='18'
              height='6'
              rx='2'
            />
            <rect
              x='3'
              y='14'
              width='18'
              height='6'
              rx='2'
            />
            <circle
              cx='7'
              cy='7'
              r='0.6'
              fill='currentColor'
              stroke='none'
            />
            <circle
              cx='7'
              cy='17'
              r='0.6'
              fill='currentColor'
              stroke='none'
            />
          </svg>
        </div>
      </div>

      <h1 className='text-3xl text-center'>{t('connection.wakingTitle')}</h1>
      <p className='max-w-md text-center text-ink-2'>
        {t('connection.wakingHelp')}
      </p>

      <p
        className='text-sm text-ink-2 font-medium'
        role='status'
        aria-live='polite'
      >
        {t('connection.wakingAttempt')
          .replace('{attempt}', String(attempt))
          .replace('{total}', String(total))}
      </p>
    </div>
  );
};

export default ServerWaking;

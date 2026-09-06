import { FC } from 'react';
import { useTranslations } from '@/i18n';

export interface StartupStep {
  /** Translation key of the step label. */
  label: string;
  /** True once the step has completed successfully. */
  done: boolean;
}

interface StartupProgressProps {
  /** Ordered steps with their completion flag. */
  steps: StartupStep[];
  /** 0..100 progress percentage (drives the bar width). */
  percent: number;
}

/**
 * Startup progress screen shown while the app connects at launch. A progress
 * bar plus a step list tell the user exactly what is happening (server wake,
 * authentication, profile) — a Cloud Run cold start takes ~70 s and without
 * this feedback the app just looks frozen or broken.
 */
const StartupProgress: FC<StartupProgressProps> = ({ steps, percent }) => {
  const t = useTranslations();
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className='w-full min-h-screen flex flex-col items-center justify-center gap-8 px-8 bg-paper text-ink'>
      <div className='w-full max-w-md flex flex-col gap-3'>
        {/* Progress bar */}
        <div
          className='w-full h-3 rounded-full bg-hairline overflow-hidden'
          role='progressbar'
          aria-label={t('connection.wakingTitle')}
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className='h-full rounded-full bg-blue transition-all duration-700 ease-out'
            style={{ width: `${clamped}%` }}
          />
        </div>

        {/* Step list */}
        <ul
          className='flex flex-col gap-2.5 mt-2'
          aria-live='polite'
        >
          {steps.map((step) => (
            <li
              key={step.label}
              className='flex items-center gap-3 text-base'
            >
              <span
                className={`size-5 shrink-0 rounded-full flex items-center justify-center border-2 ${
                  step.done
                    ? 'bg-sage border-sage'
                    : 'border-hairline-2 bg-surface'
                }`}
                aria-hidden='true'
              >
                {step.done && (
                  <svg
                    viewBox='0 0 24 24'
                    className='w-3.5 h-3.5 text-white'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='3'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                  >
                    <path d='M5 13l4 4L19 7' />
                  </svg>
                )}
              </span>
              <span className={step.done ? 'text-ink' : 'text-muted'}>
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className='text-sm text-muted text-center max-w-md'>
        {t('connection.wakingHelp')}
      </p>
    </div>
  );
};

export default StartupProgress;

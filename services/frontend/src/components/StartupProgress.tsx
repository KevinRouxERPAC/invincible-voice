import { FC } from 'react';
import BrandLogos from '@/components/ui/BrandLogos';
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
  /** Current health-check attempt, 1-based. */
  attempt: number;
  /** Total attempts in the retry schedule. */
  total: number;
}

/**
 * Startup progress screen shown while the app connects at launch. A title, a
 * progress bar, the attempt counter and a step list tell the user exactly what
 * is happening (server wake, authentication, profile) — a Cloud Run cold start
 * takes ~70 s and without this feedback the app just looks frozen or broken.
 */
const StartupProgress: FC<StartupProgressProps> = ({
  steps,
  percent,
  attempt,
  total,
}) => {
  const t = useTranslations();
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  // A step is shown as done only once every step before it is done. Callers
  // report each step independently, and the profile one completes early from
  // the local cache: ticking it while "server wake" was still pending made the
  // list read as broken rather than as a sequence.
  let previousDone = true;
  const orderedSteps = steps.map((step) => {
    const done = previousDone && step.done;
    previousDone = done;
    return { ...step, done };
  });

  return (
    <div className='w-full min-h-screen flex flex-col items-center justify-center gap-8 px-8 bg-paper text-ink'>
      <BrandLogos className='h-9' />

      <div className='w-full max-w-md flex flex-col gap-3'>
        <h1 className='text-center text-xl font-bold mb-1'>
          {t('connection.wakingTitle')}
        </h1>

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

        <p
          className='text-xs text-muted text-center'
          aria-live='polite'
        >
          {t('connection.wakingAttempt')
            .replace('{attempt}', String(attempt))
            .replace('{total}', String(total))}
        </p>

        {/* Step list */}
        <ul
          className='flex flex-col gap-2.5 mt-2'
          aria-live='polite'
        >
          {orderedSteps.map((step) => (
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

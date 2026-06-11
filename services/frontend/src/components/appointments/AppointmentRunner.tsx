'use client';

import { ChevronLeft, ChevronRight, Volume2, X } from 'lucide-react';
import { FC, Fragment, useCallback, useState } from 'react';
import { useTranslations } from '@/i18n';
import { cn } from '@/utils/cn';
import { playQuickPhrase } from '@/utils/phraseAudio';
import { Appointment } from '@/utils/userData';

interface AppointmentRunnerProps {
  appointment: Appointment;
  voiceName?: string | null;
  lang?: string | null;
  onClose: () => void;
}

/**
 * Full-screen "run" mode for a prepared appointment: the user steps through the
 * phrases one by one, each spoken instantly via the pre-cached cloned voice
 * (falling back to browser synthesis offline, like the quick phrases).
 */
const AppointmentRunner: FC<AppointmentRunnerProps> = ({
  appointment,
  voiceName = null,
  lang = null,
  onClose,
}) => {
  const t = useTranslations();
  const [index, setIndex] = useState(0);
  const phrases = appointment.phrases.filter((p) => p.trim());

  const speak = useCallback(
    (i: number) => {
      if (i < 0 || i >= phrases.length) {
        return;
      }
      setIndex(i);
      playQuickPhrase({
        text: phrases[i],
        voiceName,
        lang: lang ?? undefined,
      }).catch(console.error);
    },
    [phrases, voiceName, lang],
  );

  return (
    <div className='fixed inset-0 z-50 flex flex-col items-center gap-6 px-4 py-10 overflow-y-auto bg-[#121212] text-white'>
      <div className='w-full max-w-2xl flex flex-row items-center justify-between'>
        <h1 className='text-2xl font-bold truncate'>{appointment.title}</h1>
        <button
          onClick={onClose}
          aria-label={t('appointments.close')}
          className='size-10 shrink-0 flex items-center justify-center rounded-2xl bg-[#101010]'
        >
          <X
            size={24}
            className='text-white'
          />
        </button>
      </div>

      {phrases.length === 0 ? (
        <p className='text-sm text-gray-400'>{t('appointments.empty')}</p>
      ) : (
        <Fragment>
          <div className='w-full max-w-2xl flex flex-col gap-2'>
            {phrases.map((phrase, i) => (
              <button
                // eslint-disable-next-line react/no-array-index-key
                key={`${i}|${phrase}`}
                data-scan-item
                onClick={() => speak(i)}
                className={cn(
                  'w-full text-left px-5 py-4 rounded-2xl border text-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500',
                  i === index
                    ? 'bg-green text-black border-green font-semibold'
                    : 'bg-[#181818] text-white border-white/30 hover:bg-[#222]',
                )}
              >
                {phrase}
              </button>
            ))}
          </div>

          <div className='w-full max-w-2xl flex flex-row items-stretch gap-3'>
            <button
              onClick={() => speak(index - 1)}
              data-scan-item
              disabled={index === 0}
              aria-label={t('appointments.previous')}
              className='flex-1 h-16 flex items-center justify-center gap-2 rounded-2xl bg-[#1B1B1B] border border-white/40 disabled:opacity-40'
            >
              <ChevronLeft size={28} />
            </button>
            <button
              onClick={() => speak(index)}
              data-scan-item
              data-scan-order={-1}
              className='flex-[2] h-16 flex items-center justify-center gap-3 rounded-2xl bg-green text-black font-bold text-lg'
            >
              <Volume2 size={28} />
              {t('appointments.speak')}
            </button>
            <button
              onClick={() => speak(index + 1)}
              data-scan-item
              disabled={index >= phrases.length - 1}
              aria-label={t('appointments.next')}
              className='flex-1 h-16 flex items-center justify-center gap-2 rounded-2xl bg-[#1B1B1B] border border-white/40 disabled:opacity-40'
            >
              <ChevronRight size={28} />
            </button>
          </div>

          <p className='text-sm text-gray-400 tabular-nums'>
            {index + 1} / {phrases.length}
          </p>
        </Fragment>
      )}
    </div>
  );
};

export default AppointmentRunner;

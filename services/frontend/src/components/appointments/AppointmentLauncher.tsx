'use client';

import { CalendarClock } from 'lucide-react';
import { FC, Fragment, useState } from 'react';
import AppointmentRunner from '@/components/appointments/AppointmentRunner';
import { useTranslations } from '@/i18n';
import { Appointment } from '@/utils/userData';

interface AppointmentLauncherProps {
  appointments: Appointment[];
  voiceName?: string | null;
  lang?: string | null;
  /** Icon-only trigger for tight headers. */
  compact?: boolean;
}

/**
 * Entry point for the prepared appointments: a trigger that lets the user pick
 * an appointment and run it (stepping through its phrases one by one). Renders
 * nothing when the user has no appointments configured.
 */
const AppointmentLauncher: FC<AppointmentLauncherProps> = ({
  appointments,
  voiceName = null,
  lang = null,
  compact = false,
}) => {
  const t = useTranslations();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [running, setRunning] = useState<Appointment | null>(null);

  const usable = appointments.filter(
    (a) => a.title.trim() && a.phrases.some((p) => p.trim()),
  );
  if (usable.length === 0) {
    return null;
  }

  return (
    <Fragment>
      <button
        onClick={() => setPickerOpen(true)}
        data-scan-item
        aria-label={t('appointments.title')}
        title={t('appointments.title')}
        className={`shrink-0 flex flex-row items-center justify-center gap-2 font-medium text-white bg-[#1B1B1B] border border-white/40 rounded-2xl hover:bg-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors ${
          compact ? 'h-11 px-3' : 'h-12 px-5'
        }`}
      >
        <CalendarClock
          width={compact ? 20 : 24}
          height={compact ? 20 : 24}
          className='shrink-0'
        />
        {!compact && t('appointments.title')}
      </button>

      {pickerOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4'>
          <div className='w-full max-w-md bg-[#1B1B1B] border border-white rounded-3xl p-6 flex flex-col gap-3'>
            <h2 className='text-lg font-bold text-white'>
              {t('appointments.choose')}
            </h2>
            <div className='flex flex-col gap-2 max-h-80 overflow-y-auto'>
              {usable.map((appointment) => (
                <button
                  key={appointment.title}
                  data-scan-item
                  onClick={() => {
                    setRunning(appointment);
                    setPickerOpen(false);
                  }}
                  className='w-full text-left px-4 py-3 rounded-2xl bg-[#101010] border border-white/30 text-white hover:bg-[#222] focus:outline-none focus:ring-2 focus:ring-green-500'
                >
                  <span className='block font-medium'>{appointment.title}</span>
                  <span className='block text-xs text-gray-400'>
                    {appointment.phrases.filter((p) => p.trim()).length}{' '}
                    {t('appointments.phrasesCount')}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPickerOpen(false)}
              className='self-end px-6 py-2 text-sm text-white bg-[#101010] border border-white rounded-2xl hover:bg-[#2B2B2B]'
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {running && (
        <AppointmentRunner
          appointment={running}
          voiceName={voiceName}
          lang={lang}
          onClose={() => setRunning(null)}
        />
      )}
    </Fragment>
  );
};

export default AppointmentLauncher;

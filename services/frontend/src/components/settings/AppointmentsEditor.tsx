'use client';

import { Plus, Trash2, X } from 'lucide-react';
import { FC, KeyboardEvent, useCallback, useState } from 'react';
import { useTranslations } from '@/i18n';
import { Appointment } from '@/utils/userData';

interface AppointmentsEditorProps {
  appointments: Appointment[];
  onChange: (appointments: Appointment[]) => void;
}

/**
 * Editor for prepared appointments (a title + an ordered list of phrases the
 * user will step through during the appointment). Mirrors the quick-phrases
 * editor pattern in SettingsPopup.
 */
const AppointmentsEditor: FC<AppointmentsEditorProps> = ({
  appointments,
  onChange,
}) => {
  const t = useTranslations();
  const [newTitle, setNewTitle] = useState('');
  const [phraseDrafts, setPhraseDrafts] = useState<Record<number, string>>({});

  const addAppointment = useCallback(() => {
    const title = newTitle.trim();
    if (!title || appointments.some((a) => a.title === title)) {
      return;
    }
    onChange([...appointments, { title, phrases: [] }]);
    setNewTitle('');
  }, [appointments, newTitle, onChange]);

  const removeAppointment = useCallback(
    (index: number) => {
      onChange(appointments.filter((_, i) => i !== index));
    },
    [appointments, onChange],
  );

  const renameAppointment = useCallback(
    (index: number, title: string) => {
      onChange(appointments.map((a, i) => (i === index ? { ...a, title } : a)));
    },
    [appointments, onChange],
  );

  const addPhrase = useCallback(
    (index: number) => {
      const text = (phraseDrafts[index] ?? '').trim();
      if (!text) {
        return;
      }
      onChange(
        appointments.map((a, i) =>
          i === index ? { ...a, phrases: [...a.phrases, text] } : a,
        ),
      );
      setPhraseDrafts((prev) => ({ ...prev, [index]: '' }));
    },
    [appointments, onChange, phraseDrafts],
  );

  const removePhrase = useCallback(
    (index: number, phraseIndex: number) => {
      onChange(
        appointments.map((a, i) =>
          i === index
            ? { ...a, phrases: a.phrases.filter((_, j) => j !== phraseIndex) }
            : a,
        ),
      );
    },
    [appointments, onChange],
  );

  return (
    <div className='flex flex-col gap-3'>
      <div className='text-sm font-medium text-white'>
        {t('appointments.title')}
      </div>
      <p className='text-xs text-white/60'>{t('appointments.help')}</p>

      {appointments.map((appointment, index) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className='flex flex-col gap-2 p-3 rounded-2xl bg-[#181818] border border-white/20'
        >
          <div className='flex gap-2'>
            <input
              type='text'
              value={appointment.title}
              onChange={(e) => renameAppointment(index, e.target.value)}
              placeholder={t('appointments.titlePlaceholder')}
              className='flex-1 px-3 py-2 text-sm text-white bg-[#1B1B1B] border border-white rounded-xl focus:outline-none focus:border-green'
            />
            <button
              type='button'
              onClick={() => removeAppointment(index)}
              aria-label={t('common.delete')}
              className='size-9 shrink-0 flex items-center justify-center rounded-xl bg-[#101010]'
            >
              <Trash2
                size={18}
                className='text-[#FF6459]'
              />
            </button>
          </div>

          <div className='flex flex-wrap gap-1.5'>
            {appointment.phrases.map((phrase, phraseIndex) => (
              <span
                // eslint-disable-next-line react/no-array-index-key
                key={phraseIndex}
                className='flex items-center gap-1 pl-3 pr-1 py-1 text-sm text-white bg-[#101010] rounded-full'
              >
                {phrase}
                <button
                  type='button'
                  onClick={() => removePhrase(index, phraseIndex)}
                  aria-label={t('common.delete')}
                  className='size-5 flex items-center justify-center rounded-full hover:bg-[#FF6459]/30'
                >
                  <X
                    size={12}
                    className='text-gray-300'
                  />
                </button>
              </span>
            ))}
          </div>

          <div className='flex gap-2'>
            <input
              type='text'
              value={phraseDrafts[index] ?? ''}
              onChange={(e) =>
                setPhraseDrafts((prev) => ({
                  ...prev,
                  [index]: e.target.value,
                }))
              }
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addPhrase(index);
                }
              }}
              placeholder={t('appointments.phrasePlaceholder')}
              className='flex-1 px-3 py-2 text-sm text-white bg-[#1B1B1B] border border-white rounded-xl focus:outline-none focus:border-green'
            />
            <button
              type='button'
              onClick={() => addPhrase(index)}
              className='px-3 shrink-0 flex items-center gap-1 text-sm text-white bg-[#101010] border border-white/40 rounded-xl hover:bg-[#222]'
            >
              {t('common.add')}
              <Plus size={16} />
            </button>
          </div>
        </div>
      ))}

      <div className='flex gap-2'>
        <input
          type='text'
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addAppointment();
            }
          }}
          placeholder={t('appointments.newPlaceholder')}
          className='flex-1 px-3 py-2 text-sm text-white bg-[#1B1B1B] border border-white rounded-xl focus:outline-none focus:border-green'
        />
        <button
          type='button'
          onClick={addAppointment}
          className='px-3 shrink-0 flex items-center gap-1 text-sm text-white bg-[#101010] border border-white/40 rounded-xl hover:bg-[#222]'
        >
          {t('common.add')}
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
};

export default AppointmentsEditor;

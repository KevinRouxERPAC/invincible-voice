'use client';

import { FC } from 'react';
import { useTranslations } from '@/i18n';

interface TermsOfServiceModalProps {
  onAccept: () => void;
  onRefuse: () => void;
}

const TermsOfServiceModal: FC<TermsOfServiceModalProps> = ({
  onAccept,
  onRefuse,
}) => {
  const t = useTranslations();

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm'>
      <div className='flex flex-col gap-4 max-w-3xl w-[90%] max-h-[90vh] bg-surface border border-hairline shadow-[var(--sh-lg)] text-ink px-6 py-6 rounded-4xl overflow-hidden'>
        <h2 className='text-xl font-bold text-center pt-2'>
          {t('common.termsOfService')}
        </h2>
        <div className='px-4 py-4 text-center text-base leading-relaxed'>
          {t('common.termsOfServiceMessage')}{' '}
          <a
            href='https://kyutai.org/privacy-policy'
            target='_blank'
            rel='noopener noreferrer'
            className='underline text-blue hover:text-blue-600'
          >
            {t('common.termsOfService')}
          </a>
        </div>
        <div className='flex gap-4 pt-2'>
          <button
            onClick={onRefuse}
            className='flex-1 shrink-0 font-bold cursor-pointer pointer-events-auto rounded-2xl h-14 flex flex-row items-center justify-center gap-2 text-sm px-4 bg-red-tint border border-red text-red hover:brightness-95 transition'
          >
            {t('common.refuse')}
          </button>
          <button
            onClick={onAccept}
            className='flex-1 shrink-0 font-bold cursor-pointer pointer-events-auto rounded-2xl h-14 flex flex-row items-center justify-center gap-2 text-sm px-4 bg-blue hover:bg-blue-600 transition-colors text-white'
          >
            {t('common.accept')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsOfServiceModal;

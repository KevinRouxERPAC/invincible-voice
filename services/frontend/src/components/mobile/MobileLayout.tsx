'use client';

import { History, Settings } from 'lucide-react';
import { FC } from 'react';
import EmergencyButton from '@/components/EmergencyButton';
import StartConversationButton from '@/components/ui/StartConversationButton';
import { useTranslations } from '@/i18n';
import { isNativeApp } from '@/utils/platform';

interface MobileNoConversationProps {
  onConnectButtonPress: () => void;
  onSettingsPress: () => void;
  onHistoryPress?: () => void;
  hasHistory?: boolean;
}

export const MobileNoConversation: FC<MobileNoConversationProps> = ({
  onConnectButtonPress,
  onSettingsPress,
  onHistoryPress = undefined,
  hasHistory = false,
}) => {
  const t = useTranslations();

  return (
    <div className='w-full h-dvh flex flex-col text-ink relative'>
      {/* Safe area spacer for notch/status bar */}
      <div
        style={{ height: 'var(--safe-area-inset-top)' }}
        className='shrink-0'
      />

      <div
        className='absolute top-4 left-4 z-10'
        style={{ top: 'calc(1rem + var(--safe-area-inset-top))' }}
      >
        <EmergencyButton compact />
      </div>
      <div
        className='absolute top-4 right-4 z-10'
        style={{ top: 'calc(1rem + var(--safe-area-inset-top))' }}
      >
        <button
          className='shrink-0 h-11 px-3 cursor-pointer bg-surface border border-hairline-2 hover:bg-paper transition-colors shadow-[var(--sh-sm)] rounded-2xl flex flex-row items-center justify-center text-ink-2'
          onClick={onSettingsPress}
          title={t('settings.changeSettings')}
        >
          <Settings size={20} />
        </button>
      </div>
      <div className='flex-1 flex flex-col items-center justify-center gap-4'>
        <img
          src='/logo_invincible.png'
          alt='InvincibleVoice'
          className='logo-themed h-10 mb-2'
        />
        <StartConversationButton
          onClick={onConnectButtonPress}
          label={t('conversation.startChatting')}
        />
        {hasHistory && onHistoryPress && (
          <button
            className='flex items-center gap-2 px-6 min-h-[44px] bg-surface border border-hairline-2 rounded-2xl text-sm text-ink-2 hover:bg-paper transition-colors'
            onClick={onHistoryPress}
          >
            <History size={16} />
            {t('conversation.history')}
          </button>
        )}
      </div>
      {!isNativeApp() && (
        <div
          className='absolute bottom-0 right-0 p-6 pointer-events-none'
          style={{ bottom: 'var(--safe-area-inset-bottom)' }}
        >
          <div className='flex flex-col items-end pointer-events-auto'>
            <p className='w-full text-xs text-muted text-right'>
              {t('common.textToSpeechProvider')}
            </p>
            <img
              src='/gradium.svg'
              alt='Gradium'
              className='h-6 mt-1'
            />
          </div>
        </div>
      )}

      {/* Safe area spacer for home indicator */}
      <div
        style={{ height: 'var(--safe-area-inset-bottom)' }}
        className='shrink-0'
      />
    </div>
  );
};

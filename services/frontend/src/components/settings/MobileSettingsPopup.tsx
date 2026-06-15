'use client';

import { FC, useCallback, useState } from 'react';
import { useAuthContext } from '@/auth/authContext';
import { useTranslations } from '@/i18n';
import { updateUserSettings } from '@/utils/userData';
import type { UserSettings } from '@/utils/userData';
import AccessibilitySettings from './AccessibilitySettings';
import EmailField from './EmailField';
import NameField from './NameField';
import SettingsHeader from './SettingsHeader';
import SpeechRateSlider from './SpeechRateSlider';

interface MobileSettingsPopupProps {
  userSettings: UserSettings;
  email: string;
  onSave: (settings: UserSettings) => void;
  onCancel: () => void;
}

const MobileSettingsPopup: FC<MobileSettingsPopupProps> = ({
  userSettings,
  email,
  onSave,
  onCancel,
}) => {
  const t = useTranslations();
  const { signOut } = useAuthContext();
  const [name, setName] = useState(userSettings.name || '');

  const handleSave = useCallback(async () => {
    const updatedSettings: UserSettings = {
      ...userSettings,
      name,
    };
    const result = await updateUserSettings(updatedSettings);

    if (!result.error) {
      onSave(updatedSettings);
    }
  }, [name, userSettings, onSave]);

  const handleSignOut = useCallback(() => {
    signOut();
    onCancel();
  }, [signOut, onCancel]);

  return (
    <div className='flex flex-col w-full h-full text-ink p-4'>
      <SettingsHeader
        title={t('settings.changeSettings')}
        onCancel={onCancel}
      />

      <div className='flex flex-col gap-4 flex-1'>
        <EmailField email={email} />
        <NameField
          value={name}
          onChange={setName}
          placeholder={t('settings.yourNamePlaceholder')}
        />
        <div className='w-full px-4 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-3xl'>
          <SpeechRateSlider />
        </div>
        <div className='w-full px-4 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-3xl'>
          <AccessibilitySettings />
        </div>
        <p className='text-xs text-muted text-center mt-1'>
          {t('settings.moreSettingsAvailable')}
        </p>
      </div>

      <div className='flex flex-col gap-3 mt-6'>
        <div className='w-full flex justify-center'>
          <a
            href='https://kyutai.org/privacy-policy'
            target='_blank'
            rel='noopener noreferrer'
            className='text-sm underline text-blue hover:text-blue-600 transition-colors'
          >
            {t('common.termsOfService')}
          </a>
        </div>
        <button
          className='w-full px-6 py-3 text-red bg-red-tint border border-red rounded-2xl font-medium'
          onClick={handleSignOut}
        >
          {t('settings.signOut')}
        </button>
        <button
          className='w-full px-6 py-3 text-white bg-sage rounded-2xl font-medium'
          onClick={handleSave}
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  );
};

export default MobileSettingsPopup;

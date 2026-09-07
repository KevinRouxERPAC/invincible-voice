'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useAuthContext } from '@/auth/authContext';
import { useTranslations } from '@/i18n';
import { privacyHref } from '@/utils/platform';
import { updateUserSettings } from '@/utils/userData';
import type { QuickPhrase, UserSettings } from '@/utils/userData';
import AccessibilitySettings from './AccessibilitySettings';
import AdminPanel from './AdminPanel';
import EmailField from './EmailField';
import NameField from './NameField';
import QuickPhrasesEditor from './QuickPhrasesEditor';
import SettingsHeader from './SettingsHeader';
import SpeechRateSlider from './SpeechRateSlider';

export type MobileSettingsPanel = 'main' | 'phrases' | 'admin';

interface MobileSettingsPopupProps {
  userSettings: UserSettings;
  email: string;
  isAdmin?: boolean;
  initialPanel?: MobileSettingsPanel;
  onOpenPhrasesPanel?: () => void;
  onPanelChange?: (panel: MobileSettingsPanel) => void;
  onSave: (settings: UserSettings) => void;
  onCancel: () => void;
}

const MobileSettingsPopup: FC<MobileSettingsPopupProps> = ({
  userSettings,
  email,
  isAdmin = false,
  initialPanel = 'main',
  onOpenPhrasesPanel = undefined,
  onPanelChange = undefined,
  onSave,
  onCancel,
}) => {
  const t = useTranslations();
  const { signOut } = useAuthContext();
  const [activePanel, setActivePanel] =
    useState<MobileSettingsPanel>(initialPanel);
  const [name, setName] = useState(userSettings.name || '');
  const [prompt, setPrompt] = useState(userSettings.prompt || '');
  const [learnStyle, setLearnStyle] = useState(
    userSettings.learn_style ?? true,
  );
  const [quickPhrases, setQuickPhrases] = useState<QuickPhrase[]>(
    userSettings.quick_phrases || [],
  );
  // Empty string = "let the STT guess" (auto). Persisted as null, like desktop.
  const [language, setLanguage] = useState(
    userSettings.expected_transcription_language || '',
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const goToPanel = useCallback(
    (panel: MobileSettingsPanel) => {
      setActivePanel(panel);
      onPanelChange?.(panel);
    },
    [onPanelChange],
  );

  useEffect(() => {
    setActivePanel(initialPanel);
  }, [initialPanel]);

  useEffect(() => {
    setName(userSettings.name || '');
    setPrompt(userSettings.prompt || '');
    setLearnStyle(userSettings.learn_style ?? true);
    setQuickPhrases(userSettings.quick_phrases || []);
    setLanguage(userSettings.expected_transcription_language || '');
  }, [userSettings]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const updatedSettings: UserSettings = {
      ...userSettings,
      name,
      prompt,
      learn_style: learnStyle,
      quick_phrases: quickPhrases,
      expected_transcription_language: language || null,
    };
    const result = await updateUserSettings(updatedSettings);

    if (!result.error) {
      onSave(updatedSettings);
      return;
    }
    setSaveError(result.error);
  }, [name, prompt, learnStyle, quickPhrases, language, userSettings, onSave]);

  const handleSignOut = useCallback(() => {
    signOut();
    onCancel();
  }, [signOut, onCancel]);

  if (activePanel === 'admin' && isAdmin) {
    return (
      <div className='flex flex-col w-full h-full min-h-0 text-ink'>
        <div className='shrink-0 px-4 pt-4'>
          <SettingsHeader
            title={t('admin.tabTitle')}
            onCancel={onCancel}
            onBack={() => goToPanel('main')}
            backLabel={t('common.back')}
          />
        </div>
        <div className='flex-1 min-h-0 overflow-y-auto px-4 pb-4'>
          <AdminPanel currentUserEmail={email} />
        </div>
      </div>
    );
  }

  if (activePanel === 'phrases') {
    return (
      <div className='flex flex-col w-full h-full min-h-0 text-ink'>
        <div className='shrink-0 px-4 pt-4'>
          <SettingsHeader
            title={t('settings.quickPhrases')}
            onCancel={onCancel}
            onBack={() => goToPanel('main')}
            backLabel={t('common.back')}
          />
        </div>
        <div className='flex-1 min-h-0 overflow-y-auto px-4 py-4'>
          <QuickPhrasesEditor
            phrases={quickPhrases}
            onChange={setQuickPhrases}
          />
        </div>
        <div className='shrink-0 flex flex-col gap-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] border-t border-hairline bg-surface'>
          {saveError ? (
            <p
              className='text-sm text-red text-center'
              role='alert'
            >
              {saveError}
            </p>
          ) : null}
          <button
            className='w-full px-6 py-3 text-white bg-sage rounded-2xl font-medium'
            onClick={handleSave}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col w-full h-full min-h-0 text-ink'>
      <div className='shrink-0 px-4 pt-4'>
        <SettingsHeader
          title={t('settings.changeSettings')}
          onCancel={onCancel}
        />
      </div>

      <div className='flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto px-4 py-4'>
        <EmailField email={email} />
        <NameField
          value={name}
          onChange={setName}
          placeholder={t('settings.yourNamePlaceholder')}
        />
        <div className='w-full px-4 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-3xl flex flex-col gap-2'>
          <label
            htmlFor='mobile-settings-language-select'
            className='text-sm font-medium text-ink'
          >
            {t('settings.expectedTranscriptionLanguage')}
          </label>
          <select
            id='mobile-settings-language-select'
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            title={language ? undefined : t('settings.letSpeechToTextGuess')}
            className='w-full min-h-11 px-4 py-3 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue'
          >
            <option value=''>{t('settings.letSpeechToTextGuess')}</option>
            <option value='en'>English</option>
            <option value='fr'>Français</option>
            <option value='de'>Deutsch</option>
            <option value='es'>Español</option>
            <option value='pt'>Português</option>
          </select>
        </div>
        <div className='w-full px-4 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-3xl'>
          <SpeechRateSlider />
        </div>
        <div className='w-full px-4 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-3xl flex flex-col gap-2'>
          <label
            htmlFor='mobile-persona'
            className='font-medium text-ink text-sm'
          >
            {t('settings.configureAssistant')}
          </label>
          <p className='text-xs text-muted'>{t('settings.personaHint')}</p>
          <textarea
            id='mobile-persona'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder={t('settings.promptPlaceholder')}
            className='w-full min-h-24 px-3 py-2 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl resize-none focus:outline-none focus:border-blue'
          />
        </div>
        <button
          type='button'
          role='switch'
          aria-checked={learnStyle}
          onClick={() => setLearnStyle((v) => !v)}
          className='w-full px-4 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-3xl flex items-center justify-between gap-4 text-left'
        >
          <span className='flex flex-col'>
            <span className='font-medium text-ink'>
              {t('settings.learnStyle')}
            </span>
            <span className='mt-1 text-xs text-muted'>
              {t('settings.learnStyleHint')}
            </span>
          </span>
          <span
            className={`shrink-0 w-12 h-7 rounded-full p-1 transition-colors ${
              learnStyle ? 'bg-sage' : 'bg-hairline-2'
            }`}
          >
            <span
              className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                learnStyle ? 'translate-x-5' : ''
              }`}
            />
          </span>
        </button>
        <div className='w-full px-4 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-3xl'>
          <AccessibilitySettings />
        </div>
        <p className='text-xs text-muted text-center mt-1'>
          {t('settings.moreSettingsAvailable')}
        </p>
        {isAdmin && (
          <button
            type='button'
            onClick={() => goToPanel('admin')}
            className='w-full px-4 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-3xl text-sm font-medium text-blue'
          >
            {t('admin.openPanel')}
          </button>
        )}
        <button
          type='button'
          onClick={() =>
            onOpenPhrasesPanel ? onOpenPhrasesPanel() : goToPanel('phrases')
          }
          className='w-full px-4 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-3xl text-sm font-medium text-blue'
        >
          {t('conversation.editQuickPhrases')}
        </button>
      </div>

      <div className='shrink-0 flex flex-col gap-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] border-t border-hairline bg-surface'>
        {saveError ? (
          <p
            className='text-sm text-red text-center'
            role='alert'
          >
            {saveError}
          </p>
        ) : null}
        <div className='w-full flex justify-center'>
          <a
            href={privacyHref()}
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

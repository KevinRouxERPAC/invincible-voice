/* eslint-disable react/no-array-index-key */
import { CheckIcon, LoaderCircleIcon, Play, X, XCircle } from 'lucide-react';
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  FC,
  KeyboardEvent,
  ChangeEvent,
} from 'react';
import { useAuthContext } from '@/auth/authContext';
import Edit from '@/components/icons/Edit';
import Plus from '@/components/icons/Plus';
import Trash from '@/components/icons/Trash';
import OfflineModeToggle from '@/components/settings/OfflineModeToggle';
import { useTranslations } from '@/i18n';
import { estimateTokens, formatTokenCount } from '@/utils/tokenUtils';
import { playTTSStream } from '@/utils/ttsUtil';
import {
  updateUserSettings,
  Appointment,
  Document,
  QuickPhrase,
  getVoices,
  createVoice,
  deleteVoice,
} from '@/utils/userData';
import type { UserSettings } from '@/utils/userData';
import AccessibilitySettings from './AccessibilitySettings';
import AppointmentsEditor from './AppointmentsEditor';
import DocumentEditorPopup from './DocumentEditorPopup';
import EmailField from './EmailField';
import SpeechRateSlider from './SpeechRateSlider';

interface SettingsPopupProps {
  userSettings: UserSettings;
  email: string;
  onSave: (settings: UserSettings) => void;
  onCancel: () => void;
}

type SettingsTab =
  | 'profile'
  | 'voice'
  | 'accessibility'
  | 'assistant'
  | 'content';

const SettingsPopup: FC<SettingsPopupProps> = ({
  userSettings,
  email,
  onSave,
  onCancel,
}) => {
  const t = useTranslations();
  const { signOut } = useAuthContext();
  const [formData, setFormData] = useState<UserSettings>(userSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [newFriendInput, setNewFriendInput] = useState<string>('');
  const [newKeywordInput, setNewKeywordInput] = useState<string>('');
  const [newPhraseInput, setNewPhraseInput] = useState<string>('');
  const [newPhraseCategoryInput, setNewPhraseCategoryInput] =
    useState<string>('');
  const [isDocumentEditorOpen, setIsDocumentEditorOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editingDocumentIndex, setEditingDocumentIndex] = useState<
    number | null
  >(null);
  const [availableVoices, setAvailableVoices] = useState<Record<
    string,
    string
  > | null>(null);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [isCreatingVoice, setIsCreatingVoice] = useState(false);
  const [showVoiceUpload, setShowVoiceUpload] = useState(false);
  const [voiceUploadFile, setVoiceUploadFile] = useState<File | null>(null);
  const [voiceUploadName, setVoiceUploadName] = useState<string>('');
  const [voiceUploadError, setVoiceUploadError] = useState<string | null>(null);
  const [showDeleteVoiceConfirm, setShowDeleteVoiceConfirm] = useState(false);
  const [voiceToDelete, setVoiceToDelete] = useState<string | null>(null);
  const [isDeletingVoice, setIsDeletingVoice] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const promptTokenCount = useMemo(
    () => estimateTokens(formData.prompt),
    [formData.prompt],
  );

  const handleInputChange = useCallback(
    (
      field: keyof UserSettings,
      value:
        | string
        | string[]
        | Document[]
        | QuickPhrase[]
        | Appointment[]
        | boolean
        | null,
    ) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [],
  );
  const handleAddFriend = useCallback(() => {
    if (
      newFriendInput.trim() &&
      !formData.friends.includes(newFriendInput.trim())
    ) {
      handleInputChange('friends', [
        ...formData.friends,
        newFriendInput.trim(),
      ]);
      setNewFriendInput('');
    }
  }, [formData.friends, handleInputChange, newFriendInput]);
  const handleRemoveFriend = useCallback(
    (friendToRemove: string) => {
      handleInputChange(
        'friends',
        formData.friends.filter((friend) => friend !== friendToRemove),
      );
    },
    [formData.friends, handleInputChange],
  );
  const handleFriendInputKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleAddFriend();
      }
    },
    [handleAddFriend],
  );
  const handleAddKeyword = useCallback(() => {
    if (
      newKeywordInput.trim() &&
      !formData.additional_keywords.includes(newKeywordInput.trim())
    ) {
      handleInputChange('additional_keywords', [
        ...formData.additional_keywords,
        newKeywordInput.trim(),
      ]);
      setNewKeywordInput('');
    }
  }, [formData.additional_keywords, handleInputChange, newKeywordInput]);
  const handleRemoveKeyword = useCallback(
    (keywordToRemove: string) => {
      handleInputChange(
        'additional_keywords',
        formData.additional_keywords.filter(
          (keyword) => keyword !== keywordToRemove,
        ),
      );
    },
    [formData.additional_keywords, handleInputChange],
  );
  const handleKeywordInputKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleAddKeyword();
      }
    },
    [handleAddKeyword],
  );
  const handleAddPhrase = useCallback(() => {
    const text = newPhraseInput.trim();
    const phrases = formData.quick_phrases || [];
    if (text && !phrases.some((phrase) => phrase.text === text)) {
      handleInputChange('quick_phrases', [
        ...phrases,
        { text, category: newPhraseCategoryInput.trim() },
      ]);
      setNewPhraseInput('');
    }
  }, [
    formData.quick_phrases,
    handleInputChange,
    newPhraseInput,
    newPhraseCategoryInput,
  ]);
  const handleRemovePhrase = useCallback(
    (phraseToRemove: QuickPhrase) => {
      handleInputChange(
        'quick_phrases',
        (formData.quick_phrases || []).filter(
          (phrase) => phrase.text !== phraseToRemove.text,
        ),
      );
    },
    [formData.quick_phrases, handleInputChange],
  );
  const handlePhraseInputKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleAddPhrase();
      }
    },
    [handleAddPhrase],
  );
  const handleAddDocument = useCallback(() => {
    setEditingDocument(null);
    setEditingDocumentIndex(null);
    setIsDocumentEditorOpen(true);
  }, []);
  const handleEditDocument = useCallback(
    (index: number) => {
      const doc = formData.documents?.[index];
      if (doc) {
        setEditingDocument(doc);
        setEditingDocumentIndex(index);
        setIsDocumentEditorOpen(true);
      }
    },
    [formData.documents],
  );
  const handleRemoveDocument = useCallback(
    (index: number) => {
      const newDocuments = [...(formData.documents || [])];
      newDocuments.splice(index, 1);
      handleInputChange('documents', newDocuments);
    },
    [formData.documents, handleInputChange],
  );
  const handleSaveDocument = useCallback(
    (document: Document) => {
      const newDocuments = [...(formData.documents || [])];
      if (editingDocumentIndex !== null) {
        newDocuments[editingDocumentIndex] = document;
      } else {
        newDocuments.push(document);
      }
      handleInputChange('documents', newDocuments);
      setIsDocumentEditorOpen(false);
      setEditingDocument(null);
      setEditingDocumentIndex(null);
    },
    [editingDocumentIndex, formData.documents, handleInputChange],
  );
  const handleCancelDocument = useCallback(() => {
    setIsDocumentEditorOpen(false);
    setEditingDocument(null);
    setEditingDocumentIndex(null);
  }, []);

  // Fetch available voices
  useEffect(() => {
    const fetchVoices = async () => {
      setIsLoadingVoices(true);
      const result = await getVoices();
      if (result.data) {
        setAvailableVoices(result.data);
      } else {
        console.error('Failed to fetch voices:', result.error);
      }
      setIsLoadingVoices(false);
    };
    fetchVoices();
  }, []);

  // Handle voice selection
  const handleVoiceChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      handleInputChange('voice', event.target.value);
    },
    [handleInputChange],
  );

  // Handle test voice button click
  const handleTestVoice = useCallback(async () => {
    if (!formData.voice) return;
    setIsPlayingVoice(true);
    try {
      const testText = t('settings.testVoiceMessage');
      await playTTSStream({
        text: testText,
        messageId: crypto.randomUUID(),
        voiceName: formData.voice,
      });
    } catch (error) {
      console.error('Failed to play test voice:', error);
    } finally {
      setIsPlayingVoice(false);
    }
  }, [formData.voice, t]);

  // Handle voice creation
  const handleCreateVoice = useCallback(async () => {
    if (!voiceUploadFile || !voiceUploadName.trim()) {
      setVoiceUploadError(t('settings.voiceUploadError'));
      return;
    }

    setIsCreatingVoice(true);
    setVoiceUploadError(null);

    try {
      const result = await createVoice(voiceUploadFile, voiceUploadName);

      if (result.error) {
        setVoiceUploadError(result.error);
        return;
      }

      if (result.data) {
        // Refresh the voices list with a small delay to allow the API to process the new voice
        setIsLoadingVoices(true);
        // Wait a bit for the API to index the new voice
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 500);
        });
        const voicesResult = await getVoices();
        if (voicesResult.data) {
          setAvailableVoices(voicesResult.data);
          // Select the newly created voice
          handleInputChange('voice', result.data.name);
        } else {
          console.error('Failed to fetch voices:', voicesResult.error);
        }
        setIsLoadingVoices(false);

        // Reset the upload form
        setVoiceUploadFile(null);
        setVoiceUploadName('');
        setShowVoiceUpload(false);
      }
    } catch (err) {
      setVoiceUploadError(
        err instanceof Error ? err.message : 'An error occurred',
      );
    } finally {
      setIsCreatingVoice(false);
    }
  }, [voiceUploadFile, voiceUploadName, handleInputChange, t]);

  // Handle voice file selection
  const handleVoiceFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        const validExtensions = ['.mp3', '.wav'];
        const fileName = file.name.toLowerCase();
        if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
          setVoiceUploadError(t('settings.voiceUploadInvalidFile'));
          return;
        }
        setVoiceUploadFile(file);
        setVoiceUploadError(null);
      }
    },
    [t],
  );

  // Handle voice deletion
  const handleDeleteVoice = useCallback(async () => {
    if (!voiceToDelete) return;

    setIsDeletingVoice(true);
    try {
      const result = await deleteVoice(voiceToDelete);

      if (result.error) {
        console.error('Failed to delete voice:', result.error);
        return;
      }

      // Refresh the voices list
      setIsLoadingVoices(true);
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 500);
      });
      const voicesResult = await getVoices();
      if (voicesResult.data) {
        setAvailableVoices(voicesResult.data);
        // If the deleted voice was selected, reset to default
        if (formData.voice === voiceToDelete) {
          handleInputChange('voice', '');
        }
      } else {
        console.error('Failed to fetch voices:', voicesResult.error);
      }
      setIsLoadingVoices(false);

      // Close the confirmation dialog
      setShowDeleteVoiceConfirm(false);
      setVoiceToDelete(null);
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsDeletingVoice(false);
    }
  }, [voiceToDelete, formData.voice, handleInputChange]);

  const handleSave = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await updateUserSettings(formData);

      if (result.error) {
        // Handle error silently for now
        console.error(result.error);
      } else {
        onSave(formData);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [formData, onSave]);
  const onChangeName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleInputChange('name', event.target.value);
    },
    [handleInputChange],
  );
  const onChangePrompt = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange('prompt', event.target.value);
    },
    [handleInputChange],
  );
  const onChangeNewKeywordInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setNewKeywordInput(event.target.value);
    },
    [],
  );
  const onChangeNewFriendInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setNewFriendInput(event.target.value);
    },
    [],
  );

  const handleLanguageChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      handleInputChange(
        'expected_transcription_language',
        event.target.value === '' ? null : event.target.value,
      );
    },
    [handleInputChange],
  );

  useEffect(() => {
    setFormData({
      ...userSettings,
      documents: userSettings.documents || [],
      quick_phrases: userSettings.quick_phrases || [],
      appointments: userSettings.appointments || [],
      learn_style: userSettings.learn_style ?? true,
    });
  }, [userSettings]);

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'profile', label: t('settings.tabProfile') },
    { id: 'voice', label: t('common.voice') },
    { id: 'accessibility', label: t('settings.tabAccessibility') },
    { id: 'assistant', label: t('settings.tabAssistant') },
    { id: 'content', label: t('settings.tabContent') },
  ];

  const tabButtonClass = (tab: SettingsTab) =>
    `px-4 py-2 -mb-px text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue rounded-t-lg ${
      activeTab === tab
        ? 'border-blue text-blue'
        : 'border-transparent text-muted hover:text-ink'
    }`;

  return (
    <div className='flex flex-col w-full h-full gap-y-2'>
      <div className='flex flex-row justify-between w-full'>
        <h2 className='text-base font-medium text-ink'>
          {t('settings.title')}
        </h2>

        <div className='flex flex-row items-center gap-2 -mr-5 -mt-2'>
          <button
            className='text-red underline text-xs'
            onClick={signOut}
          >
            {t('settings.signOut')}
          </button>

          <button
            className='size-10 cursor-pointer flex items-center justify-center rounded-2xl bg-surface-2 border border-hairline hover:bg-paper transition-colors'
            onClick={onCancel}
          >
            <X
              size={24}
              className='text-ink-2'
            />
          </button>
        </div>
      </div>

      {/* Barre d'onglets pour réduire la charge cognitive : une famille de
          réglages à la fois. */}
      <div
        role='tablist'
        aria-label={t('settings.title')}
        className='flex flex-row gap-1 border-b border-hairline shrink-0 overflow-x-auto no-scrollbar'
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            role='tab'
            type='button'
            aria-selected={activeTab === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={tabButtonClass(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenu de l'onglet actif (zone défilante) */}
      <div className='grow w-full min-h-0 overflow-y-auto py-4'>
        <div className='flex flex-col gap-6 w-full max-w-3xl mx-auto'>
          {activeTab === 'profile' && (
            <div
              id='settings-panel-profile'
              role='tabpanel'
              aria-labelledby='settings-tab-profile'
              className='flex flex-col gap-6'
            >
              <EmailField email={email} />
              <div className='flex flex-col gap-2'>
                <label
                  htmlFor='settings-name-input'
                  className='text-sm font-medium text-ink'
                >
                  {t('settings.yourName')}
                </label>
                <input
                  id='settings-name-input'
                  type='text'
                  value={formData.name}
                  onChange={onChangeName}
                  className='w-full px-6 py-2 text-base text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue'
                  placeholder={t('settings.yourNamePlaceholder')}
                />
              </div>
              <div className='flex flex-col gap-2'>
                <label
                  htmlFor='settings-language-select'
                  className='text-sm font-medium text-ink'
                >
                  {t('settings.expectedTranscriptionLanguage')}
                </label>
                <select
                  id='settings-language-select'
                  value={formData.expected_transcription_language || ''}
                  onChange={handleLanguageChange}
                  className='w-full px-6 py-2 text-base text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue'
                >
                  <option value=''>{t('settings.letSpeechToTextGuess')}</option>
                  <option value='en'>English</option>
                  <option value='fr'>Français</option>
                  <option value='de'>Deutsch</option>
                  <option value='es'>Español</option>
                  <option value='pt'>Português</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'voice' && (
            <div
              id='settings-panel-voice'
              role='tabpanel'
              aria-labelledby='settings-tab-voice'
              className='flex flex-col gap-6'
            >
              <div className='flex flex-col gap-2'>
                <label
                  htmlFor='settings-voice-select'
                  className='text-sm font-medium text-ink'
                >
                  {t('common.voice')}
                </label>

                <div className='flex gap-2'>
                  <select
                    id='settings-voice-select'
                    value={formData.voice || ''}
                    onChange={handleVoiceChange}
                    disabled={isLoadingVoices}
                    className='flex-1 px-6 py-2 text-base text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue disabled:opacity-50'
                  >
                    <option value=''>{t('common.default')}</option>

                    {availableVoices &&
                      Object.entries(availableVoices)
                        .sort(([, langA], [, langB]) =>
                          langA.localeCompare(langB),
                        )
                        .map(([voiceName, language]) => (
                          <option
                            key={voiceName}
                            value={voiceName}
                          >
                            {voiceName.includes('/')
                              ? voiceName.substring(voiceName.indexOf('/') + 1)
                              : voiceName}
                            ({language})
                          </option>
                        ))}
                  </select>

                  <button
                    type='button'
                    onClick={handleTestVoice}
                    disabled={!formData.voice || isPlayingVoice}
                    className='px-4 py-2 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue hover:bg-paper disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap'
                  >
                    {isPlayingVoice ? (
                      <LoaderCircleIcon
                        size={16}
                        className='animate-spin'
                      />
                    ) : (
                      <Play size={16} />
                    )}
                    {t('settings.testYourVoice')}
                  </button>

                  {formData.voice &&
                    availableVoices &&
                    availableVoices[formData.voice] === 'Custom voice' && (
                      <button
                        type='button'
                        onClick={() => {
                          setVoiceToDelete(formData.voice || null);
                          setShowDeleteVoiceConfirm(true);
                        }}
                        className='px-3 py-2 text-ink-2 bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-red hover:bg-paper hover:border-red'
                        title={t('common.delete')}
                      >
                        <XCircle
                          size={16}
                          className='text-red'
                        />
                      </button>
                    )}
                </div>

                {!showVoiceUpload && (
                  <button
                    type='button'
                    onClick={() => setShowVoiceUpload(true)}
                    className='mt-2 px-4 py-2 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue hover:bg-paper'
                  >
                    {t('settings.cloneYourVoice')}
                  </button>
                )}

                {showVoiceUpload && (
                  <div className='mt-2 px-4 py-3 bg-surface-2 border border-hairline rounded-2xl'>
                    <div className='flex flex-col gap-3'>
                      <div className='flex flex-col gap-1'>
                        <label
                          htmlFor='voice-upload-name-input'
                          className='text-xs font-medium text-ink-2'
                        >
                          {t('settings.voiceName')}
                        </label>

                        <input
                          id='voice-upload-name-input'
                          type='text'
                          value={voiceUploadName}
                          onChange={(e) => setVoiceUploadName(e.target.value)}
                          className='w-full px-3 py-2 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-xl focus:outline-none focus:border-blue'
                          placeholder={t('settings.voiceNamePlaceholder')}
                        />
                      </div>

                      <div className='flex flex-col gap-1'>
                        <label
                          htmlFor='voice-upload-file-input'
                          className='text-xs font-medium text-ink-2'
                        >
                          {t('settings.audioFile')}
                        </label>

                        <input
                          id='voice-upload-file-input'
                          type='file'
                          accept='.mp3,.wav'
                          onChange={handleVoiceFileChange}
                          className='w-full px-3 py-2 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-xl focus:outline-none focus:border-blue file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:bg-sage file:text-white file:text-sm file:cursor-pointer'
                        />
                      </div>

                      {voiceUploadError && (
                        <p className='text-xs text-red'>{voiceUploadError}</p>
                      )}

                      <div className='flex gap-2'>
                        <button
                          type='button'
                          onClick={() => {
                            setShowVoiceUpload(false);
                            setVoiceUploadFile(null);
                            setVoiceUploadName('');
                            setVoiceUploadError(null);
                          }}
                          className='flex-1 px-4 py-2 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-xl focus:outline-none focus:border-blue hover:bg-paper'
                        >
                          {t('common.cancel')}
                        </button>

                        <button
                          type='button'
                          onClick={handleCreateVoice}
                          disabled={
                            isCreatingVoice ||
                            !voiceUploadFile ||
                            !voiceUploadName.trim()
                          }
                          className='flex-1 px-4 py-2 text-sm text-white bg-sage rounded-xl focus:outline-none hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                          {isCreatingVoice ? (
                            <LoaderCircleIcon
                              size={16}
                              className='animate-spin mx-auto'
                            />
                          ) : (
                            t('settings.createVoice')
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <SpeechRateSlider />
            </div>
          )}

          {activeTab === 'accessibility' && (
            <div
              id='settings-panel-accessibility'
              role='tabpanel'
              aria-labelledby='settings-tab-accessibility'
              className='flex flex-col gap-6'
            >
              <div className='w-full px-6 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-[40px]'>
                <AccessibilitySettings />
              </div>
            </div>
          )}

          {activeTab === 'assistant' && (
            <div
              id='settings-panel-assistant'
              role='tabpanel'
              aria-labelledby='settings-tab-assistant'
              className='flex flex-col gap-6'
            >
              <div>
                <label className='flex items-center justify-between gap-2 cursor-pointer px-2'>
                  <span className='text-sm font-medium text-ink'>
                    {t('settings.learnStyle')}
                  </span>
                  <input
                    type='checkbox'
                    checked={formData.learn_style ?? true}
                    onChange={(e) =>
                      handleInputChange('learn_style', e.target.checked)
                    }
                    className='size-5 accent-green'
                  />
                </label>
                <p className='mt-1 px-2 text-xs text-muted'>
                  {t('settings.learnStyleHint')}
                </p>
              </div>

              <OfflineModeToggle />

              <div className='flex flex-col gap-2'>
                <div className='flex items-center justify-between mb-1'>
                  <div className='text-sm font-medium text-ink'>
                    {t('settings.configureAssistant')}
                  </div>

                  <span className='text-sm text-muted'>
                    {formatTokenCount(promptTokenCount)}
                  </span>
                </div>

                <textarea
                  value={formData.prompt}
                  onChange={onChangePrompt}
                  className='w-full min-h-[180px] px-6 py-4 text-base text-ink bg-surface-2 border border-hairline-2 rounded-3xl resize-none focus:outline-none focus:border-blue scrollbar-hidden scrollable'
                  placeholder={t('settings.promptPlaceholder')}
                />
              </div>

              <div className='w-full px-6 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-[40px]'>
                <div className='block mb-1 text-sm font-medium text-ink'>
                  {t('settings.additionalKeywords')}
                </div>
                <div className='flex flex-col w-full gap-0.5'>
                  <div className='flex flex-wrap gap-1.5 min-h-6 max-h-28 overflow-y-auto overflow-x-hidden py-2'>
                    {formData.additional_keywords.map((keyword) => (
                      <AdditionalKeyword
                        key={keyword}
                        keyword={keyword}
                        removeKeyword={handleRemoveKeyword}
                      />
                    ))}
                    {formData.additional_keywords.length === 0 && (
                      <p className='text-sm italic text-muted'>
                        {t('settings.noKeywordsAdded')}
                      </p>
                    )}
                  </div>
                  <div className='relative flex gap-2'>
                    <input
                      type='text'
                      value={newKeywordInput}
                      onChange={onChangeNewKeywordInput}
                      onKeyDown={handleKeywordInputKeyPress}
                      className='flex-1 px-4 py-1 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue h-10'
                      placeholder={t('settings.addKeywordPlaceholder')}
                    />
                    <button
                      onClick={handleAddKeyword}
                      className='absolute shrink-0 h-8 p-px right-1 inset-y-1 w-fit bg-blue hover:bg-blue-600 transition-colors rounded-xl'
                      style={{
                        filter:
                          'drop-shadow(0rem 0.2rem 0.15rem var(--darkgray))',
                      }}
                    >
                      <div className='h-full w-full pl-4 pr-3 flex flex-row items-center justify-center gap-1 rounded-xl text-sm text-white'>
                        {t('common.add')}
                        <Plus
                          width={24}
                          height={24}
                          className='shrink-0 text-white'
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className='w-full px-6 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-[40px]'>
                <div className='block mb-1 text-sm font-medium text-ink'>
                  {t('common.friends')}
                </div>
                <div className='flex flex-col w-full gap-0.5'>
                  <div className='flex flex-wrap gap-1.5 min-h-6 max-h-28 overflow-y-auto overflow-x-hidden py-2'>
                    {formData.friends.map((friend) => (
                      <Friend
                        key={friend}
                        friend={friend}
                        removeFriend={handleRemoveFriend}
                      />
                    ))}
                    {formData.friends.length === 0 && (
                      <p className='text-sm italic text-muted'>
                        {t('settings.noFriendsAdded')}
                      </p>
                    )}
                  </div>
                  <div className='relative flex gap-2'>
                    <input
                      type='text'
                      value={newFriendInput}
                      onChange={onChangeNewFriendInput}
                      onKeyDown={handleFriendInputKeyPress}
                      className='flex-1 px-4 py-1 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue h-10'
                      placeholder={t('settings.addFriendPlaceholder')}
                    />
                    <button
                      onClick={handleAddFriend}
                      className='absolute shrink-0 h-8 p-px right-1 inset-y-1 w-fit bg-blue hover:bg-blue-600 transition-colors rounded-xl'
                      style={{
                        filter:
                          'drop-shadow(0rem 0.2rem 0.15rem var(--darkgray))',
                      }}
                    >
                      <div className='h-full w-full pl-4 pr-3 flex flex-row items-center justify-center gap-1 rounded-xl text-sm text-white'>
                        {t('common.add')}
                        <Plus
                          width={24}
                          height={24}
                          className='shrink-0 text-white'
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'content' && (
            <div
              id='settings-panel-content'
              role='tabpanel'
              aria-labelledby='settings-tab-content'
              className='flex flex-col gap-6'
            >
              <div className='w-full px-6 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-[40px]'>
                <div className='block mb-1 text-sm font-medium text-ink'>
                  {t('settings.quickPhrases')}
                </div>
                <p className='text-xs text-muted'>
                  {t('settings.quickPhrasesHelp')}
                </p>
                <div className='flex flex-col w-full gap-0.5'>
                  <div className='flex flex-wrap gap-1.5 min-h-6 max-h-28 overflow-y-auto overflow-x-hidden py-2'>
                    {(formData.quick_phrases || []).map((phrase) => (
                      <PhraseChip
                        key={phrase.text}
                        phrase={phrase}
                        removePhrase={handleRemovePhrase}
                      />
                    ))}
                    {(!formData.quick_phrases ||
                      formData.quick_phrases.length === 0) && (
                      <p className='text-sm italic text-muted'>
                        {t('settings.noPhrasesAdded')}
                      </p>
                    )}
                  </div>
                  <div className='flex gap-2'>
                    <input
                      type='text'
                      value={newPhraseInput}
                      onChange={(e) => setNewPhraseInput(e.target.value)}
                      onKeyDown={handlePhraseInputKeyPress}
                      className='flex-1 px-4 py-1 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue h-10'
                      placeholder={t('settings.addPhrasePlaceholder')}
                    />
                    <input
                      type='text'
                      value={newPhraseCategoryInput}
                      onChange={(e) =>
                        setNewPhraseCategoryInput(e.target.value)
                      }
                      onKeyDown={handlePhraseInputKeyPress}
                      className='w-32 px-4 py-1 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue h-10'
                      placeholder={t('settings.phraseCategoryPlaceholder')}
                    />
                    <button
                      onClick={handleAddPhrase}
                      className='shrink-0 h-10 p-px w-fit bg-blue hover:bg-blue-600 transition-colors rounded-xl'
                      style={{
                        filter:
                          'drop-shadow(0rem 0.2rem 0.15rem var(--darkgray))',
                      }}
                    >
                      <div className='h-full w-full pl-4 pr-3 flex flex-row items-center justify-center gap-1 rounded-xl text-sm text-white'>
                        {t('common.add')}
                        <Plus
                          width={24}
                          height={24}
                          className='shrink-0 text-white'
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className='w-full px-6 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-[40px]'>
                <AppointmentsEditor
                  appointments={formData.appointments || []}
                  onChange={(appointments) =>
                    handleInputChange('appointments', appointments)
                  }
                />
              </div>

              <div className='w-full px-6 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-[40px]'>
                <div className='flex flex-row items-center justify-between w-full mb-2'>
                  <div className='block mb-1 text-sm font-medium text-ink'>
                    {t('common.documents')}
                  </div>
                  <button
                    onClick={handleAddDocument}
                    className='shrink-0 p-px w-fit bg-blue hover:bg-blue-600 transition-colors rounded-xl h-8 -mt-0.5 mr-1'
                    style={{
                      filter:
                        'drop-shadow(0rem 0.2rem 0.15rem var(--darkgray))',
                    }}
                  >
                    <div className='h-full w-full pl-4 pr-3 flex flex-row items-center justify-center gap-1 rounded-xl text-sm text-white'>
                      {t('settings.addDocument')}
                      <Plus
                        width={24}
                        height={24}
                        className='shrink-0 text-white'
                      />
                    </div>
                  </button>
                </div>

                <div className='flex flex-col w-full gap-0.5'>
                  <div className='flex flex-col gap-2 py-2 overflow-x-hidden overflow-y-auto max-h-40'>
                    {(formData.documents || []).map((doc, index) => (
                      <DocumentCard
                        key={index}
                        document={doc}
                        editDocument={handleEditDocument}
                        index={index}
                        removeDocument={handleRemoveDocument}
                      />
                    ))}

                    {(!formData.documents ||
                      formData.documents.length === 0) && (
                      <p className='text-sm italic text-muted'>
                        {t('settings.noDocumentsAdded')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pied de page toujours visible : mentions + actions principales. */}
      <div className='shrink-0 flex flex-row items-center justify-between gap-3 pt-3 border-t border-hairline'>
        <a
          href='https://kyutai.org/privacy-policy'
          target='_blank'
          rel='noopener noreferrer'
          className='text-sm underline text-blue hover:text-blue-600 transition-colors'
        >
          {t('common.termsOfService')}
        </a>
        <div className='flex justify-end gap-x-3'>
          <button
            className='px-8 text-sm h-14 bg-surface border border-hairline-2 text-ink-2 hover:bg-paper transition-colors rounded-2xl'
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>

          <button
            className='h-14 bg-sage hover:bg-sage-600 transition-colors rounded-2xl'
            onClick={handleSave}
          >
            <div className='flex flex-row size-full items-center justify-center gap-4 px-8 rounded-2xl text-white'>
              {t('settings.saveConfiguration')}
              {!isLoading && (
                <CheckIcon
                  size={24}
                  className='text-white'
                />
              )}
              {isLoading && (
                <LoaderCircleIcon
                  size={24}
                  className='animate-spin text-white'
                />
              )}
            </div>
          </button>
        </div>
      </div>

      <DocumentEditorPopup
        document={editingDocument}
        isOpen={isDocumentEditorOpen}
        onSave={handleSaveDocument}
        onCancel={handleCancelDocument}
      />

      {showDeleteVoiceConfirm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm'>
          <div
            role='dialog'
            aria-modal='true'
            className='bg-surface border border-hairline shadow-[var(--sh-lg)] rounded-2xl p-6 max-w-md w-full mx-4'
          >
            <h3 className='text-lg font-medium text-ink mb-2'>
              {t('settings.deleteVoiceTitle')}
            </h3>

            <p className='text-sm text-ink-2 mb-6'>
              {t('settings.deleteVoiceMessage')}
            </p>
            <div className='flex justify-end gap-3'>
              <button
                onClick={() => {
                  setShowDeleteVoiceConfirm(false);
                  setVoiceToDelete(null);
                }}
                disabled={isDeletingVoice}
                className='px-6 py-2 text-sm text-ink-2 bg-surface border border-hairline-2 rounded-2xl focus:outline-none hover:bg-paper disabled:opacity-50'
              >
                {t('common.cancel')}
              </button>

              <button
                onClick={handleDeleteVoice}
                disabled={isDeletingVoice}
                className='px-6 py-2 text-sm text-white bg-red rounded-2xl focus:outline-none hover:bg-[#a73d2f] disabled:opacity-50 flex items-center gap-2'
              >
                {isDeletingVoice ? (
                  <LoaderCircleIcon
                    size={16}
                    className='animate-spin'
                  />
                ) : (
                  t('common.delete')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPopup;

interface AdditionalKeywordProps {
  keyword: string;
  removeKeyword: (keyword: string) => void;
}

const AdditionalKeyword: FC<AdditionalKeywordProps> = ({
  keyword,
  removeKeyword,
}) => {
  const t = useTranslations();

  const onClickRemove = useCallback(() => {
    removeKeyword(keyword);
  }, [keyword, removeKeyword]);

  return (
    <div className='relative group'>
      <button
        className='h-10 transition-colors bg-sage-tint border border-sage rounded-2xl focus:outline-none focus:ring-2 focus:ring-sage'
        type='button'
      >
        <div className='flex flex-col justify-center px-3 h-full text-sm text-sage-600 font-medium rounded-2xl'>
          {keyword}
        </div>
      </button>

      <button
        type='button'
        onClick={onClickRemove}
        className='absolute flex items-center justify-center leading-none size-6 text-base text-white bg-red rounded-full -top-2 -right-2 hover:bg-[#a73d2f] focus:outline-none focus:ring-2 focus:ring-red transition-colors'
        title={t('common.delete')}
      >
        ×
      </button>
    </div>
  );
};

interface PhraseChipProps {
  phrase: QuickPhrase;
  removePhrase: (phrase: QuickPhrase) => void;
}

const PhraseChip: FC<PhraseChipProps> = ({ phrase, removePhrase }) => {
  const t = useTranslations();

  const onClickRemove = useCallback(() => {
    removePhrase(phrase);
  }, [phrase, removePhrase]);

  return (
    <div className='relative group'>
      <button
        type='button'
        className='h-10 transition-colors bg-blue-tint border border-blue-tint-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue'
      >
        <div className='flex flex-row items-center gap-2 px-3 h-full text-sm text-blue-600 font-medium rounded-2xl'>
          {phrase.text}
          {phrase.category && (
            <span className='text-[10px] text-muted'>{phrase.category}</span>
          )}
        </div>
      </button>

      <button
        type='button'
        onClick={onClickRemove}
        className='absolute flex items-center justify-center leading-none size-6 text-base text-white bg-red rounded-full -top-2 -right-2 hover:bg-[#a73d2f] focus:outline-none focus:ring-2 focus:ring-red transition-colors'
        title={t('common.delete')}
      >
        ×
      </button>
    </div>
  );
};

interface FriendProps {
  friend: string;
  removeFriend: (friend: string) => void;
}

const Friend: FC<FriendProps> = ({ friend, removeFriend }) => {
  const t = useTranslations();

  const onClickRemove = useCallback(() => {
    removeFriend(friend);
  }, [friend, removeFriend]);

  return (
    <div className='relative group'>
      <button
        type='button'
        className='h-10 transition-colors bg-blue-tint border border-blue-tint-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue'
      >
        <div className='flex flex-col justify-center px-3 h-full text-sm text-blue-600 font-medium rounded-2xl'>
          {friend}
        </div>
      </button>

      <button
        type='button'
        onClick={onClickRemove}
        className='absolute flex items-center justify-center leading-none size-6 text-base text-white bg-red rounded-full -top-2 -right-2 hover:bg-[#a73d2f] focus:outline-none focus:ring-2 focus:ring-red transition-colors'
        title={t('common.delete')}
      >
        ×
      </button>
    </div>
  );
};

interface DocumentProps {
  document: Document;
  editDocument: (index: number) => void;
  index: number;
  removeDocument: (index: number) => void;
}

const DocumentCard: FC<DocumentProps> = ({
  index,
  document,
  editDocument,
  removeDocument,
}) => {
  const t = useTranslations();

  const docTokenCount = useMemo(
    () => estimateTokens(document.content),
    [document.content],
  );
  const handleEditDocument = useCallback(() => {
    editDocument(index);
  }, [editDocument, index]);
  const handleRemoveDocument = useCallback(() => {
    removeDocument(index);
  }, [removeDocument, index]);

  return (
    <div className='flex flex-row items-center gap-x-2 justify-between bg-surface-2 border border-hairline rounded-2xl pl-5 pr-2 min-h-14'>
      <div className='grow flex flex-col gap-0.5'>
        <span className='block text-base font-medium text-ink truncate'>
          {document.title}
        </span>

        <span className='text-[10px] text-muted'>
          {formatTokenCount(docTokenCount)}
        </span>
      </div>

      <div className='flex gap-2'>
        <button
          aria-label={t('common.edit')}
          className='size-10 cursor-pointer flex items-center justify-center rounded-xl bg-paper'
          onClick={handleEditDocument}
        >
          <Edit
            width={24}
            height={24}
            className='text-ink-2'
          />
        </button>

        <button
          aria-label={t('common.delete')}
          className='size-10 cursor-pointer flex items-center justify-center rounded-xl bg-paper'
          onClick={handleRemoveDocument}
        >
          <Trash
            width={24}
            height={24}
            className='text-red'
          />
        </button>
      </div>
    </div>
  );
};

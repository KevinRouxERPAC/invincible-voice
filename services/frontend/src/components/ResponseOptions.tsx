'use client';

import { Edit2 } from 'lucide-react';
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  FC,
  ChangeEvent,
  KeyboardEvent,
  Fragment,
  MouseEvent,
} from 'react';
import { PendingResponse } from '@/components/chat/ChatInterface';
import Lock from '@/components/icons/Lock';
import Unlock from '@/components/icons/Unlock';
import {
  ORDERED_RESPONSE_SIZES,
  RESPONSES_SIZES,
  ResponseSize,
  STATIC_MESSAGE_UUIDS,
} from '@/constants';
import { useTranslations } from '@/i18n';
import { cn } from '@/utils/cn';

interface ResponseOptionsProps {
  alwaysShow?: boolean;
  currentResponseSize?: ResponseSize;
  frozenResponses?: PendingResponse[] | null;
  onEdit?: (text: string) => void;
  onEditModeChange: (
    isEditing: boolean,
    insertTextAtCursor: (text: string) => void,
  ) => void;
  onFreezeToggle?: () => void;
  onResponseSizeChange?: (newSize: ResponseSize) => void;
  onSelect: (responseId: string) => void;
  responses: PendingResponse[];
}

const ResponseOptions: FC<ResponseOptionsProps> = ({
  alwaysShow = false,
  currentResponseSize = RESPONSES_SIZES.M,
  frozenResponses = null,
  onEdit = undefined,
  onEditModeChange,
  onFreezeToggle = () => {},
  onResponseSizeChange = () => {},
  onSelect,
  responses,
}) => {
  const t = useTranslations();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const textAreaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const insertTextAtCursorPositionRef = useRef<(text: string) => void>(
    () => {},
  );

  const insertTextAtCursorPosition = useCallback(
    (text: string) => {
      if (editingIndex !== null && textAreaRefs.current[editingIndex]) {
        const textarea = textAreaRefs.current[editingIndex];
        if (textarea) {
          const startPos = textarea.selectionStart;
          const endPos = textarea.selectionEnd;

          const textWithSpaces = ` ${text} `;
          const newValue =
            editingText.substring(0, startPos) +
            textWithSpaces +
            editingText.substring(endPos);
          setEditingText(newValue);

          // Move cursor to after the inserted text (need to do this after React updates)
          setTimeout(() => {
            const newCursorPos = startPos + textWithSpaces.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
            textarea.focus();
          }, 0);
        }
      }
    },
    [editingIndex, editingText],
  );
  const onSelectResponseSize = useCallback(
    (newSize: ResponseSize) => () => {
      onResponseSizeChange(newSize);
    },
    [onResponseSizeChange],
  );

  const validResponses = useMemo(
    () => responses.filter((response) => response.text.trim()),
    [responses],
  );
  const isFrozen = useMemo(() => frozenResponses !== null, [frozenResponses]);
  const staticContextOption = useMemo(
    () => ({
      id: 'static-context-question',
      text: t('conversation.contextQuestion'),
      isComplete: true,
      messageId: STATIC_MESSAGE_UUIDS.CONTEXT_QUESTION,
    }),
    [t],
  );
  const staticRepeatOption = useMemo(
    () => ({
      id: 'static-repeat-question',
      text: t('conversation.repeatQuestion'),
      isComplete: true,
      messageId: STATIC_MESSAGE_UUIDS.REPEAT_QUESTION,
    }),
    [t],
  );
  const displayResponses = useMemo(() => {
    if (alwaysShow) {
      // When alwaysShow is true, create 4 slots for dynamic responses + 2 static
      const responsesToShow = frozenResponses || responses;
      const dynamicResponses = Array.from({ length: 4 }, (_, index) => {
        return (
          responsesToShow[index] || {
            id: `empty-${index}`,
            text: '',
            isComplete: false,
            messageId: crypto.randomUUID(),
          }
        );
      });

      return [...dynamicResponses, staticContextOption, staticRepeatOption];
    }

    return validResponses;
  }, [
    alwaysShow,
    frozenResponses,
    responses,
    validResponses,
    staticContextOption,
    staticRepeatOption,
  ]);
  const displayLoadingPlaceholder = useMemo(() => {
    return displayResponses.some((r) => r.text.trim() && !r.isComplete);
  }, [displayResponses]);

  useEffect(() => {
    insertTextAtCursorPositionRef.current = insertTextAtCursorPosition;
  }, [insertTextAtCursorPosition]);

  useEffect(() => {
    if (editingIndex !== null) {
      // Notify parent that we're in edit mode with a stable function reference
      onEditModeChange(true, (text: string) =>
        insertTextAtCursorPositionRef.current(text),
      );
    } else {
      // Notify parent that we're not in edit mode
      onEditModeChange(false, () => {});
    }
  }, [editingIndex, onEditModeChange]);

  if (!alwaysShow && validResponses.length === 0) {
    return null;
  }

  return (
    <div className='flex flex-col gap-4 pb-12'>
      {displayLoadingPlaceholder && (
        <div className='mt-2 text-xs text-center text-muted'>
          {t('settings.responsesLoading')} {t('settings.audioWillBeReady')}
        </div>
      )}
      <div className='flex flex-col gap-2'>
        {displayResponses.slice(0, 4).map((response, index) => (
          <Fragment key={response.id}>
            {editingIndex === index && (
              <EditingResponseOption
                editingText={editingText}
                onSubmit={onEdit}
                setEditingIndex={setEditingIndex}
                setEditingText={setEditingText}
              />
            )}
            {editingIndex !== index && (
              <BaseResponseOption
                id={response.id}
                index={index}
                isComplete={response.isComplete}
                isEditable={
                  Boolean(response.text.trim()) &&
                  response.isComplete &&
                  Boolean(onEdit)
                }
                onSelect={onSelect}
                responseText={response.text}
                setEditingIndex={setEditingIndex}
                setEditingText={setEditingText}
                shortcut={['A', 'Z', 'Q', 'S'][index]}
              />
            )}
          </Fragment>
        ))}
      </div>
      <div className='flex flex-row items-center justify-between'>
        <div className='flex flex-row gap-2'>
          {ORDERED_RESPONSE_SIZES.map((size) => (
            <button
              className={cn(
                'size-8 font-medium text-sm flex flex-col items-center justify-center rounded-xl transition-all duration-200 border',
                {
                  'bg-blue text-white border-blue':
                    size === currentResponseSize,
                  'bg-surface text-ink-2 border-hairline-2 hover:bg-paper':
                    size !== currentResponseSize,
                },
              )}
              key={size}
              onClick={onSelectResponseSize(size)}
            >
              {size}
            </button>
          ))}
        </div>
        <div>
          {alwaysShow && onFreezeToggle && (
            <button
              onClick={onFreezeToggle}
              className={cn(
                'h-8 px-6 font-medium text-sm flex gap-3 items-center justify-center rounded-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50',
                {
                  'bg-blue text-white border-blue': isFrozen,
                  'bg-surface text-ink-2 border-hairline-2 hover:bg-paper':
                    !isFrozen,
                },
              )}
              title={t('conversation.freezeResponses')}
            >
              {isFrozen
                ? t('conversation.unlockResponses')
                : t('conversation.lockResponses')}
              {isFrozen ? (
                <Lock className='w-4 h-4' />
              ) : (
                <Unlock className='w-4 h-4' />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResponseOptions;

interface EditingResponseOptionProps {
  editingText: string;
  onSubmit?: (text: string) => void;
  setEditingIndex: (index: number | null) => void;
  setEditingText: (text: string) => void;
}

const EditingResponseOption: FC<EditingResponseOptionProps> = ({
  editingText,
  onSubmit = () => {},
  setEditingIndex,
  setEditingText,
}) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const onChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setEditingText(event.target.value);
    },
    [setEditingText],
  );
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key === 'Escape' ||
        (event.key === 'Enter' && !event.shiftKey)
      ) {
        event.preventDefault();
        if (event.key === 'Enter' && editingText.trim()) {
          onSubmit(editingText.trim());
        }
        setEditingIndex(null);
        setEditingText('');
      }
    },
    [editingText, onSubmit, setEditingIndex, setEditingText],
  );

  // Focus textarea when editing starts and notify parent of edit mode change
  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(
        ref.current.value.length,
        ref.current.value.length,
      );
    }
  }, []);

  return (
    <div className='flex flex-col h-16 p-3 border-2 border-sage rounded-tr-sm rounded-b-2xl rounded-tl-2xl bg-sage-tint'>
      <textarea
        ref={ref}
        value={editingText}
        onChange={onChange}
        onKeyDown={onKeyDown}
        className='flex-1 text-xs text-ink bg-transparent outline-none resize-none'
        placeholder='Type your message…'
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
    </div>
  );
};

interface BaseResponseOptionProps {
  id: string;
  index: number;
  isComplete: boolean;
  isEditable: boolean;
  onSelect: (id: string) => void;
  responseText: string;
  setEditingIndex: (index: number | null) => void;
  setEditingText: (text: string) => void;
  shortcut: string;
}

const BaseResponseOption: FC<BaseResponseOptionProps> = ({
  id,
  index,
  isComplete,
  isEditable,
  onSelect,
  responseText,
  setEditingIndex,
  setEditingText,
  shortcut,
}) => {
  const t = useTranslations();
  const onClickEdit = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      setEditingIndex(index);
      setEditingText(responseText);
    },
    [index, responseText, setEditingIndex, setEditingText],
  );
  const onClickSelect = useCallback(() => {
    onSelect(id);
  }, [id, onSelect]);

  return (
    <button
      data-response-index={index}
      data-scan-item
      onClick={onClickSelect}
      className={cn(
        'glass-card p-4 text-left rounded-2xl w-full h-24 group relative focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 flex flex-row items-center gap-4',
        {
          'cursor-pointer': responseText.trim() && isComplete,
          'cursor-wait opacity-70': !responseText.trim() || !isComplete,
        },
      )}
      disabled={!responseText.trim() || !isComplete}
    >
      <div className='flex flex-col items-center gap-2'>
        <span className='flex flex-col items-center justify-center font-bold text-muted border border-hairline rounded-full size-10 font-base bg-paper'>
          {shortcut}
        </span>
        {responseText.trim() && !isComplete && (
          <div className='w-4 h-4 border-2 border-blue rounded-full border-t-transparent animate-spin' />
        )}
      </div>
      <div className='flex flex-col justify-center grow h-full overflow-y-auto pr-2'>
        <p className='text-sm md:text-base leading-snug text-ink font-medium'>
          {responseText.trim() ? (
            <Fragment>
              {responseText}
              {!isComplete && (
                <span className='inline-block w-2 h-4 ml-2 bg-blue animate-pulse rounded-sm' />
              )}
            </Fragment>
          ) : (
            <span className='italic text-muted'>
              {t('conversation.waitingForResponse')}
            </span>
          )}
        </p>
      </div>
      {isEditable && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <div
          aria-label={`Edit the response. Shortcut is Shift + ${shortcut}`}
          onClick={onClickEdit}
          className='p-2 transition-colors rounded-full cursor-pointer bg-paper hover:bg-blue-tint ml-auto'
          title={`Edit the response. Shortcut is Shift + ${shortcut}`}
        >
          <Edit2 className='w-4 h-4 text-muted group-hover:text-blue-600' />
          <div className='absolute px-2 py-1 mb-2 text-xs text-white transition-opacity transform -translate-x-1/2 bg-gray-900 rounded opacity-0 pointer-events-none bottom-full left-1/2 whitespace-nowrap group-hover:opacity-100'>
            Edit the response. Shortcut is Shift + {shortcut}
          </div>
        </div>
      )}
    </button>
  );
};

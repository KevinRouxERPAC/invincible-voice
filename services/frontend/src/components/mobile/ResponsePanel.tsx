'use client';

import { Edit2 } from 'lucide-react';
import { useMemo, useCallback, FC, MouseEvent, Fragment } from 'react';
import { PendingResponse } from '@/components/chat/ChatInterface';
import { NB_RESPONSES } from '@/constants';
import { useTranslations } from '@/i18n';
import { cn } from '@/utils/cn';

interface ResponsePanelProps {
  frozenResponses: PendingResponse[] | null;
  onFreezeToggle: () => void;
  pendingResponses: PendingResponse[];
  onResponseEdit?: (text: string) => void;
  onResponseSelect: (responseId: string) => void;
  onEditResponseInChat?: (text: string) => void;
  additionalKeywords?: string[];
}

const ResponsePanel: FC<ResponsePanelProps> = ({
  frozenResponses,
  onFreezeToggle,
  pendingResponses,
  onResponseEdit = undefined,
  onResponseSelect,
  onEditResponseInChat = undefined,
  additionalKeywords = [],
}) => {
  const t = useTranslations();
  const isFrozen = useMemo(() => frozenResponses !== null, [frozenResponses]);
  const responsesToShow = useMemo(
    () => frozenResponses || pendingResponses,
    [frozenResponses, pendingResponses],
  );

  const allResponses = useMemo(
    () =>
      Array.from({ length: NB_RESPONSES }, (_, index) => {
        const existingResponse = responsesToShow[index];
        return (
          existingResponse || {
            id: `empty-${index}`,
            text: '',
            isComplete: false,
            messageId: crypto.randomUUID(),
          }
        );
      }),
    [responsesToShow],
  );

  return (
    <div className='flex flex-col flex-1 min-h-0 overflow-hidden'>
      {/* Quick response keywords from user settings */}
      {additionalKeywords.length > 0 && (
        <div className='px-4 pt-2 pb-1 landscape:pt-1 landscape:pb-0 border-b border-hairline shrink-0 flex gap-2 overflow-x-auto no-scrollbar overscroll-x-contain'>
          {additionalKeywords.map((keyword) => (
            <button
              key={keyword}
              className='shrink-0 px-4 min-h-[36px] bg-sage-tint border border-sage rounded-full text-sm text-sage-600 hover:bg-sage-tint transition-colors'
              onClick={() => onResponseEdit?.(keyword)}
            >
              {keyword}
            </button>
          ))}
        </div>
      )}

      {/* Freeze toggle control */}
      <div className='px-4 py-2 landscape:py-1 border-b border-hairline shrink-0 flex items-center justify-end'>
        <button
          className={cn(
            'px-3 py-1.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors',
            isFrozen
              ? 'bg-blue text-white border border-blue'
              : 'bg-surface text-ink-2 border border-hairline-2 hover:bg-paper',
          )}
          onClick={onFreezeToggle}
          title={t('conversation.freezeResponses')}
        >
          {t('conversation.freezeResponses')}
        </button>
      </div>

      {/* Response cards — adaptive: cards grow to fill the available height but
          never shrink below a tappable minimum; the list scrolls when space is
          too tight (small phones, split view). Landscape stays a 2x2 grid. */}
      <div className='flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-2 flex flex-col gap-2 landscape:grid landscape:grid-cols-2 landscape:grid-rows-2 landscape:gap-1 landscape:overflow-hidden'>
        {allResponses.slice(0, 4).map((response) => (
          <div
            key={response.id}
            className='flex-1 min-h-[3.25rem] landscape:min-h-0'
          >
            <BaseResponse
              isFrozen={isFrozen}
              onResponseEdit={onResponseEdit}
              onResponseSelect={onResponseSelect}
              response={response}
              onEditResponseInChat={onEditResponseInChat}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResponsePanel;

interface BaseResponseProps {
  isFrozen: boolean;
  onResponseEdit?: (text: string) => void;
  onResponseSelect: (responseId: string) => void;
  response: PendingResponse;
  onEditResponseInChat?: (text: string) => void;
}

const BaseResponse: FC<BaseResponseProps> = ({
  isFrozen,
  onResponseEdit = undefined,
  onResponseSelect,
  response,
  onEditResponseInChat = undefined,
}) => {
  const onClickResponse = useCallback(() => {
    onResponseSelect(response.id);
  }, [onResponseSelect, response]);

  // Tapping edit fills the chat text input and switches to the Chat tab
  const onClickEdit = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (onEditResponseInChat) {
        onEditResponseInChat(response.text);
      } else if (onResponseEdit) {
        onResponseEdit(response.text);
      }
    },
    [response.text, onEditResponseInChat, onResponseEdit],
  );
  const t = useTranslations();

  return (
    <div className='relative w-full h-full'>
      <button
        data-scan-item
        className={cn(
          'w-full h-full min-h-[44px] px-4 py-3 text-left rounded-[20px] border-2 transition-all duration-200 flex flex-col items-start justify-center overflow-hidden',
          {
            'border-blue bg-surface hover:border-blue-600':
              isFrozen && response.text.trim() && response.isComplete,
            'border-sage bg-surface hover:border-sage-600':
              !isFrozen && response.text.trim() && response.isComplete,
            'border-hairline-2 bg-surface-2':
              !isFrozen && response.text.trim() && !response.isComplete,
            'border-hairline bg-surface-2':
              !isFrozen && !response.text.trim() && !response.isComplete,
            'cursor-pointer': response.text.trim() && response.isComplete,
            'cursor-default': !response.text.trim() || !response.isComplete,
          },
        )}
        disabled={!response.text.trim() || !response.isComplete}
        onClick={onClickResponse}
      >
        <div className='w-full overflow-hidden text-ellipsis line-clamp-3 pr-8'>
          <p className='text-ink leading-relaxed wrap-break-word text-base'>
            {response.text.trim() ? (
              <Fragment>
                {response.text}
                {!response.isComplete && (
                  <span className='inline-block w-1 h-4 bg-muted ml-1 animate-pulse' />
                )}
              </Fragment>
            ) : (
              <span className='text-muted italic text-base'>
                {t('conversation.waitingForResponse')}
              </span>
            )}
          </p>
        </div>
        {response.text.trim() && !response.isComplete && (
          <div className='flex justify-end mt-1'>
            <div className='w-4 h-4 border-2 border-sage border-t-transparent rounded-full animate-spin' />
          </div>
        )}
      </button>
      {response.text.trim() &&
        response.isComplete &&
        (onResponseEdit || onEditResponseInChat) && (
          <button
            className='absolute top-1 right-1 w-11 h-11 flex items-center justify-center rounded hover:bg-paper transition-colors cursor-pointer'
            onClick={onClickEdit}
            title={t('conversation.editResponse')}
          >
            <Edit2 className='w-5 h-5 text-muted' />
          </button>
        )}
    </div>
  );
};

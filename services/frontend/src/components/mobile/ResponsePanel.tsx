'use client';

import { Edit2 } from 'lucide-react';
import { useMemo, useCallback, FC, MouseEvent, Fragment } from 'react';
import { PendingResponse } from '@/components/chat/ChatInterface';
import { NB_RESPONSES } from '@/constants';
import { useTranslations } from '@/i18n';
import { cn } from '@/utils/cn';

interface ResponsePanelProps {
  frozenResponses: PendingResponse[] | null;
  pendingResponses: PendingResponse[];
  onResponseEdit?: (text: string) => void;
  onResponseSelect: (responseId: string) => void;
  onEditResponseInChat?: (text: string) => void;
}

const ResponsePanel: FC<ResponsePanelProps> = ({
  frozenResponses,
  pendingResponses,
  onResponseEdit = undefined,
  onResponseSelect,
  onEditResponseInChat = undefined,
}) => {
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
      {/* Response cards — forced 2x2 grid. Rows keep a floor and the grid
          scrolls, so a cramped viewport never truncates an answer mid-word. */}
      <div className='flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-2 auto-rows-[minmax(80px,1fr)] gap-2'>
        {allResponses.slice(0, 4).map((response) => (
          <div
            key={response.id}
            className='min-h-0'
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
              <span className='text-muted italic text-base'>...</span>
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

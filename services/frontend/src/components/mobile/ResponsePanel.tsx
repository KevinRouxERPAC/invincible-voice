'use client';

import { Edit2 } from 'lucide-react';
import { useMemo, useCallback, FC, MouseEvent, Fragment } from 'react';
import { PendingResponse } from '@/components/chat/ChatInterface';
import { NB_RESPONSES } from '@/constants';
import { useScanSettings } from '@/hooks/useScanSettings';
import { useTranslations } from '@/i18n';
import { cn } from '@/utils/cn';

interface ResponsePanelProps {
  frozenResponses: PendingResponse[] | null;
  pendingResponses: PendingResponse[];
  onResponseEdit?: (text: string) => void;
  onResponseSelect: (responseId: string) => void;
  onEditResponseInChat?: (text: string) => void;
  /** Active session: full-width suggestions stacked below the chat bubbles */
  large?: boolean;
}

const ResponsePanel: FC<ResponsePanelProps> = ({
  frozenResponses,
  pendingResponses,
  onResponseEdit = undefined,
  onResponseSelect,
  onEditResponseInChat = undefined,
  large = false,
}) => {
  const isFrozen = useMemo(() => frozenResponses !== null, [frozenResponses]);
  const responsesToShow = useMemo(
    () => frozenResponses || pendingResponses,
    [frozenResponses, pendingResponses],
  );
  const scanSettings = useScanSettings();
  const isScanMode = scanSettings.mode !== 'off';

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

  const displayResponses = allResponses.slice(0, 4);

  // Wireframe 2b: numbered full-width cards for switch scanning.
  if (large && isScanMode) {
    return (
      <div className='flex flex-col flex-1 min-h-0 overflow-hidden px-2.5 pb-2'>
        <div className='flex-1 min-h-0 flex flex-col gap-2.5'>
          {displayResponses.map((response, index) => (
            <div
              key={response.id}
              className='flex-1 min-h-0'
            >
              <BaseResponse
                isFrozen={isFrozen}
                onResponseEdit={onResponseEdit}
                onResponseSelect={onResponseSelect}
                response={response}
                onEditResponseInChat={onEditResponseInChat}
                large
                scanIndex={index + 1}
                scanLayout
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col flex-1 min-h-0 overflow-hidden'>
      <div
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overscroll-contain',
          // Session view: full-width suggestions stacked one below the other,
          // sharing the panel height. Desktop/compact keeps the 2-column grid.
          large
            ? 'flex flex-col gap-2 p-2.5'
            : 'grid grid-cols-2 gap-2 p-4 auto-rows-[minmax(80px,1fr)]',
        )}
      >
        {displayResponses.map((response) => (
          <div
            key={response.id}
            className={cn('min-h-0', large && 'flex-1 min-h-[64px]')}
          >
            <BaseResponse
              isFrozen={isFrozen}
              onResponseEdit={onResponseEdit}
              onResponseSelect={onResponseSelect}
              response={response}
              onEditResponseInChat={onEditResponseInChat}
              large={large}
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
  large?: boolean;
  scanLayout?: boolean;
  scanIndex?: number;
}

const BaseResponse: FC<BaseResponseProps> = ({
  isFrozen,
  onResponseEdit = undefined,
  onResponseSelect,
  response,
  onEditResponseInChat = undefined,
  large = false,
  scanLayout = false,
  scanIndex = 0,
}) => {
  const onClickResponse = useCallback(() => {
    onResponseSelect(response.id);
  }, [onResponseSelect, response]);

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

  const isEmpty = !response.text.trim() && !response.isComplete;
  const isLoading = response.text.trim() && !response.isComplete;
  const isReady = response.text.trim() && response.isComplete;

  return (
    <div className='relative w-full h-full'>
      <button
        data-scan-item
        className={cn(
          'w-full h-full min-h-[44px] text-left transition-all duration-200 flex overflow-hidden',
          scanLayout
            ? 'flex-row items-center gap-3 px-3 py-2 rounded-2xl border-[3.5px] border-ink bg-sage-tint'
            : cn(
                'flex-col items-start justify-center rounded-2xl border-2',
                large && 'border-[2.5px] border-sage px-3.5 py-3',
                !large && 'px-4 py-3',
                isEmpty && 'border-dashed border-hairline-2 bg-surface-2',
                isLoading && 'border-hairline-2 bg-surface-2',
                isReady &&
                  !isFrozen &&
                  'border-sage bg-surface hover:border-sage-600',
                isReady &&
                  isFrozen &&
                  'border-blue bg-surface hover:border-blue-600',
              ),
          isReady ? 'cursor-pointer' : 'cursor-default',
        )}
        disabled={!isReady}
        onClick={onClickResponse}
      >
        {scanLayout && (
          <span
            className={cn(
              'shrink-0 size-[26px] flex items-center justify-center rounded-lg text-sm font-bold text-white',
              scanIndex === 1 ? 'bg-ink' : 'bg-hairline-2 text-ink-2',
            )}
          >
            {scanIndex}
          </span>
        )}
        <div
          className={cn(
            'w-full overflow-hidden',
            scanLayout ? 'flex-1' : 'pr-8',
          )}
        >
          <p
            className={cn(
              'text-ink leading-snug wrap-break-word',
              large ? 'text-base line-clamp-4' : 'text-base line-clamp-3',
              isEmpty && 'text-muted italic text-center w-full',
            )}
          >
            {isEmpty ? (
              '…'
            ) : (
              <Fragment>
                {response.text}
                {isLoading && (
                  <span className='inline-block w-1 h-4 bg-muted ml-1 animate-pulse' />
                )}
              </Fragment>
            )}
          </p>
        </div>
        {isLoading && !scanLayout && (
          <div className='flex justify-end mt-1'>
            <div className='w-4 h-4 border-2 border-sage border-t-transparent rounded-full animate-spin' />
          </div>
        )}
      </button>
      {isReady && (onResponseEdit || onEditResponseInChat) && (
        <button
          className='absolute top-1 right-1 w-11 h-11 flex items-center justify-center rounded hover:bg-paper transition-colors cursor-pointer'
          onClick={onClickEdit}
          title={t('conversation.editResponse')}
          aria-label={t('conversation.editResponse')}
        >
          <Edit2 className='w-4 h-4 text-muted' />
        </button>
      )}
    </div>
  );
};

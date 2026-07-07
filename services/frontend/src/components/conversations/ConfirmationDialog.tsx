import { X } from 'lucide-react';
import { FC, useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from '@/i18n';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmationDialog: FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = undefined,
  cancelText = undefined,
}) => {
  const t = useTranslations();
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  // Remember what had focus before opening so we can restore it on close —
  // essential for keyboard and switch users, who otherwise lose their place.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const handleConfirm = useCallback(() => {
    onConfirm();
    onClose();
  }, [onClose, onConfirm]);

  // Move focus into the dialog on open (the safe "Cancel" action), restore it
  // on close, and close on Escape.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      // Simple focus trap: keep Tab cycling within the dialog.
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const dialogContent = (
    <div className='fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50'>
      <div
        ref={dialogRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className='bg-surface border border-hairline shadow-[var(--sh-lg)] rounded-2xl p-6 max-w-md w-full mx-4'
      >
        <div className='flex justify-between items-center mb-4'>
          <h2
            id={titleId}
            className='text-lg font-semibold text-ink'
          >
            {title}
          </h2>
          <button
            data-scan-item
            onClick={onClose}
            className='flex items-center justify-center size-10 rounded-xl text-muted hover:text-ink hover:bg-paper focus:outline-none focus:ring-2 focus:ring-blue transition-colors'
            aria-label={t('conversation.closeAriaLabel')}
          >
            <X size={20} />
          </button>
        </div>

        <p
          id={messageId}
          className='text-ink-2 mb-6'
        >
          {message}
        </p>

        <div className='flex gap-3 justify-end'>
          <button
            ref={cancelButtonRef}
            data-scan-item
            onClick={onClose}
            className='min-h-11 px-5 py-2 rounded-2xl text-ink-2 bg-surface border border-hairline-2 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-blue transition-colors'
          >
            {cancelText ?? t('common.cancel')}
          </button>
          <button
            data-scan-item
            onClick={handleConfirm}
            className='min-h-11 px-5 py-2 bg-red hover:bg-[#a73d2f] text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-red transition-colors'
          >
            {confirmText ?? t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};

export default ConfirmationDialog;

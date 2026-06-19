import { X } from 'lucide-react';
import { FC, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
  confirmText = 'Delete',
  cancelText = 'Cancel',
}) => {
  const handleConfirm = useCallback(() => {
    onConfirm();
    onClose();
  }, [onClose, onConfirm]);

  if (!isOpen) {
    return null;
  }

  const dialogContent = (
    <div className='fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50'>
      <div className='bg-surface border border-hairline shadow-[var(--sh-lg)] rounded-2xl p-6 max-w-md w-full mx-4'>
        <div className='flex justify-between items-center mb-4'>
          <h2 className='text-lg font-semibold text-ink'>{title}</h2>
          <button
            onClick={onClose}
            className='text-muted hover:text-ink transition-colors'
            aria-label='Close'
          >
            <X size={20} />
          </button>
        </div>

        <p className='text-ink-2 mb-6'>{message}</p>

        <div className='flex gap-3 justify-end'>
          <button
            onClick={onClose}
            className='px-4 py-2 text-ink-2 hover:text-ink transition-colors'
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className='px-4 py-2 bg-red hover:bg-[#a73d2f] text-white rounded-md transition-colors'
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};

export default ConfirmationDialog;

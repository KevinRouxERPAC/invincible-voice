import { ArrowLeft, X } from 'lucide-react';
import { FC } from 'react';

interface SettingsHeaderProps {
  title: string;
  onCancel: () => void;
  onBack?: () => void;
  backLabel?: string;
  onSignOut?: () => void;
  signOutLabel?: string;
  className?: string;
}

const SettingsHeader: FC<SettingsHeaderProps> = ({
  title,
  onCancel,
  onBack = undefined,
  backLabel = '',
  onSignOut = undefined,
  signOutLabel = '',
  className = '',
}) => {
  return (
    <div className={`flex flex-row items-center gap-2 w-full ${className}`}>
      {onBack ? (
        <button
          type='button'
          className='shrink-0 size-10 cursor-pointer flex items-center justify-center rounded-2xl bg-surface-2 border border-hairline hover:bg-paper transition-colors'
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
        >
          <ArrowLeft
            size={22}
            className='text-ink-2'
          />
        </button>
      ) : null}
      <h2 className='flex-1 min-w-0 text-base font-medium text-ink truncate'>
        {title}
      </h2>

      {onSignOut ? (
        <div className='flex flex-row items-center gap-2 shrink-0 -mr-5 -mt-2'>
          <button
            type='button'
            className='text-red underline text-xs'
            onClick={onSignOut}
          >
            {signOutLabel}
          </button>

          <button
            type='button'
            className='size-10 cursor-pointer flex items-center justify-center rounded-2xl bg-surface-2 border border-hairline hover:bg-paper transition-colors'
            onClick={onCancel}
            aria-label={backLabel || title}
          >
            <X
              size={24}
              className='text-ink-2'
            />
          </button>
        </div>
      ) : (
        <button
          type='button'
          className='shrink-0 size-10 cursor-pointer flex items-center justify-center rounded-2xl bg-surface-2 border border-hairline hover:bg-paper transition-colors'
          onClick={onCancel}
          aria-label={backLabel || title}
        >
          <X
            size={24}
            className='text-ink-2'
          />
        </button>
      )}
    </div>
  );
};

export default SettingsHeader;

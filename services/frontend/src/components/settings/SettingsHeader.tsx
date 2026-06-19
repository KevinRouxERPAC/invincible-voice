import { X } from 'lucide-react';
import { FC } from 'react';

interface SettingsHeaderProps {
  title: string;
  onCancel: () => void;
  onSignOut?: () => void;
  signOutLabel?: string;
  className?: string;
}

const SettingsHeader: FC<SettingsHeaderProps> = ({
  title,
  onCancel,
  onSignOut = undefined,
  signOutLabel = '',
  className = '',
}) => {
  return (
    <div className={`flex flex-row justify-between w-full ${className}`}>
      <h2 className='text-base font-medium text-ink'>{title}</h2>

      {onSignOut ? (
        <div className='flex flex-row items-center gap-2 -mr-5 -mt-2'>
          <button
            className='text-red underline text-xs'
            onClick={onSignOut}
          >
            {signOutLabel}
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
      ) : (
        <button
          className='size-10 cursor-pointer flex items-center justify-center rounded-2xl bg-surface-2 border border-hairline hover:bg-paper transition-colors'
          onClick={onCancel}
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

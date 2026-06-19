import { Settings } from 'lucide-react';

interface SettingsButtonProps {
  onClick: () => void;
  label: string;
  className?: string;
  variant?: 'full' | 'icon-only';
}

const SettingsButton = ({
  onClick,
  label,
  className = '',
  variant = 'full',
}: SettingsButtonProps) => {
  if (variant === 'icon-only') {
    return (
      <button
        onClick={onClick}
        className={`shrink-0 h-10 cursor-pointer bg-surface border border-hairline-2 hover:bg-paper transition-colors shadow-[var(--sh-sm)] rounded-2xl flex flex-row items-center justify-center p-2 text-ink-2 ${className}`}
        type='button'
      >
        <Settings size={20} />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`shrink-0 h-10 px-5 cursor-pointer bg-surface border border-hairline-2 hover:bg-paper transition-colors shadow-[var(--sh-sm)] rounded-2xl flex flex-row items-center justify-center gap-2 text-sm text-ink-2 ${className}`}
      type='button'
    >
      {label}
      <Settings size={20} />
    </button>
  );
};

export default SettingsButton;

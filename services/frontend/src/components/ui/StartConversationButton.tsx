import NewConversation from '@/components/icons/NewConversation';

interface StartConversationButtonProps {
  onClick: () => void;
  label: string;
  className?: string;
}

const StartConversationButton = ({
  onClick,
  label,
  className = '',
}: StartConversationButtonProps) => {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 cursor-pointer pointer-events-auto bg-blue hover:bg-blue-600 transition-colors rounded-2xl h-14 flex flex-row items-center justify-center gap-2 text-sm px-8 text-white ${className}`}
      type='button'
    >
      {label}
      <NewConversation
        width={24}
        height={24}
        className='shrink-0 text-white'
      />
    </button>
  );
};

export default StartConversationButton;

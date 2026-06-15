/* eslint-disable react/no-array-index-key */

'use client';

import { FC, useCallback } from 'react';
import { cn } from '@/utils/cn';

interface HorizontalScrollableListProps {
  emptyMessage: string;
  itemClassName?: string;
  items: string[];
  onItemClick: (item: string) => void;
}

const HorizontalScrollableList: FC<HorizontalScrollableListProps> = ({
  emptyMessage,
  itemClassName = '',
  items,
  onItemClick,
}) => {
  return (
    <div className='px-4'>
      {(!items || items.length === 0) && (
        <p className='text-xs text-muted italic'>{emptyMessage}</p>
      )}
      {items && items.length > 0 && (
        <div className='flex gap-2 overflow-x-auto scrollbar-hidden'>
          {items.map((item, index) => (
            <HorizontalScrollableListItem
              key={`${item}-${index}`}
              item={item}
              itemClassName={itemClassName}
              onClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HorizontalScrollableList;

interface HorizontalScrollableListItemProps {
  item: string;
  itemClassName: string;
  onClick: (item: string) => void;
}

const HorizontalScrollableListItem: FC<HorizontalScrollableListItemProps> = ({
  item,
  itemClassName,
  onClick,
}) => {
  const onItemClick = useCallback(() => {
    onClick(item);
  }, [onClick, item]);

  return (
    <button
      onClick={onItemClick}
      className={cn(
        'px-4 py-2 text-ink text-sm rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 whitespace-nowrap shrink-0',
        itemClassName,
      )}
    >
      {item}
    </button>
  );
};

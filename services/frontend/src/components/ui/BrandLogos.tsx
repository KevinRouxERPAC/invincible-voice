'use client';

import Image from 'next/image';
import { FC } from 'react';
import { cn } from '@/utils/cn';

interface BrandLogosProps {
  /** Show the “by” label between Invincible and Kyutai (login screen). */
  showBy?: boolean;
  className?: string;
  invincibleWidth?: number;
  kyutaiWidth?: number;
}

/**
 * Invincible + Kyutai brand marks. Uses `.logo-themed` so the white PNG/SVG
 * assets invert in light mode and stay light on dark backgrounds.
 */
const BrandLogos: FC<BrandLogosProps> = ({
  showBy = false,
  className = '',
  invincibleWidth = 185,
  kyutaiWidth = 53,
}) => (
  <div
    className={cn(
      'flex flex-row items-center justify-center shrink gap-2',
      className,
    )}
  >
    <Image
      src='/logo_invincible.png'
      alt='Invincible Logo'
      width={invincibleWidth}
      height={22}
      className='logo-themed'
    />
    {showBy && <span className='text-xs text-ink-2'>by</span>}
    <Image
      src='/logo_kyutai.svg'
      alt='Kyutai Logo'
      width={kyutaiWidth}
      height={22}
      className='logo-themed'
    />
  </div>
);

export default BrandLogos;

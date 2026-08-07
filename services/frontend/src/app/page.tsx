/* eslint-disable react/function-component-definition */
import AuthWrapper from '@/auth/AuthWrapper';
import InvincibleVoice from '@/components/InvincibleVoice';

export default function Home() {
  return (
    // Fixed app shell: the page itself never scrolls — only designated inner
    // panels do. A scrollable root made swipes drag the whole app around and
    // fight the inner lists (history, chat) via scroll chaining.
    <div className='relative flex flex-col w-full h-dvh overflow-hidden'>
      <div className='orb-soft-blue absolute left-80 -bottom-73.75 -z-10 size-147.5 rounded-full blur-3xl animate-orb-breathe' />
      <div className='orb-soft-sage absolute -right-20 -top-36 -z-10 size-147.5 rounded-full blur-3xl animate-orb-breathe-reverse' />
      <div className='flex flex-row grow'>
        <AuthWrapper>
          <InvincibleVoice />
        </AuthWrapper>
      </div>
    </div>
  );
}

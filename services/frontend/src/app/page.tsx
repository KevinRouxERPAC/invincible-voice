/* eslint-disable react/function-component-definition */
import AuthWrapper from '@/auth/AuthWrapper';
import InvincibleVoice from '@/components/InvincibleVoice';

export default function Home() {
  return (
    // Fixed app shell: the page itself never scrolls — only designated inner
    // panels do. A scrollable root made swipes drag the whole app around and
    // fight the inner lists (history, chat) via scroll chaining.
    <div
      data-app-shell
      className='relative flex flex-col w-full h-dvh overflow-hidden'
    >
      {/* The halos are deliberately positioned past the shell's edges. They
          live in their own clipping layer: left as direct children they made
          the shell's scrollHeight ~300px taller than its box, and a browser
          scrolling a focused input into view (virtual keyboard) then pushed
          the header and the chat permanently off-screen — an overflow-hidden
          shell can be scrolled programmatically but not scrolled back. */}
      <div
        aria-hidden='true'
        className='absolute inset-0 -z-10 overflow-hidden pointer-events-none'
      >
        <div className='orb-soft-blue absolute left-80 -bottom-73.75 size-147.5 rounded-full blur-3xl animate-orb-breathe' />
        <div className='orb-soft-sage absolute -right-20 -top-36 size-147.5 rounded-full blur-3xl animate-orb-breathe-reverse' />
      </div>
      <div className='flex flex-row grow'>
        <AuthWrapper>
          <InvincibleVoice />
        </AuthWrapper>
      </div>
    </div>
  );
}

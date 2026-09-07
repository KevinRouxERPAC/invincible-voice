'use client';

import { useEffect } from 'react';

// The app shell (`page.tsx`) is a fixed, non-scrolling container: only inner
// panels scroll. But an `overflow-hidden` element can still be scrolled
// *programmatically* — and the browser does exactly that when it brings a
// focused input into view for the virtual keyboard. Nothing scrolls it back
// when the keyboard closes: there is no scrollbar and no touch gesture on a
// clipped container, so the header (Fin, SOS) and the top of the conversation
// stay off-screen for the rest of the session.
//
// Found on device 07/09/26: after opening the writer or the quick-phrase
// editor, the shell kept scrollTop=247 with the keyboard already gone.
//
// The halos that made the shell overflow are now clipped (see page.tsx), so
// this guard is the second line of defence: any future content that overflows
// the shell can no longer strand the user. It only fires once the keyboard is
// gone, so it never fights the browser while the field is being typed into.

const KEYBOARD_SLACK_PX = 8;

function isKeyboardOpen(): boolean {
  const visual = window.visualViewport?.height ?? window.innerHeight;
  return visual < window.innerHeight - KEYBOARD_SLACK_PX;
}

export const useAppShellScrollGuard = (): void => {
  useEffect(() => {
    const resetShellScroll = () => {
      if (isKeyboardOpen()) {
        return;
      }
      const shell = document.querySelector<HTMLElement>('[data-app-shell]');
      if (shell && shell.scrollTop !== 0) {
        shell.scrollTop = 0;
      }
    };

    window.visualViewport?.addEventListener('resize', resetShellScroll);
    window.addEventListener('resize', resetShellScroll);
    window.addEventListener('orientationchange', resetShellScroll);
    // focusout covers the case where the field is blurred without the viewport
    // changing size (Android sometimes keeps the layout viewport stable).
    window.addEventListener('focusout', resetShellScroll);

    return () => {
      window.visualViewport?.removeEventListener('resize', resetShellScroll);
      window.removeEventListener('resize', resetShellScroll);
      window.removeEventListener('orientationchange', resetShellScroll);
      window.removeEventListener('focusout', resetShellScroll);
    };
  }, []);
};

export default useAppShellScrollGuard;

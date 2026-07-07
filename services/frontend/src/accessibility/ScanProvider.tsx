'use client';

import {
  FC,
  Fragment,
  PropsWithChildren,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslations } from '@/i18n';
import {
  DEFAULT_SCAN_SETTINGS,
  getScanSettings,
  SCAN_SETTINGS_CHANGED_EVENT,
  ScanSettings,
} from '@/utils/scanSettings';

// Motor-accessibility engine: switch scanning (auto / step) and dwell selection.
//
// Every interactive target in the app is already a real <button> with a working
// onClick. So instead of rewiring each component's selection logic, this engine
// drives the DOM: it collects the elements marked with `data-scan-item`, moves a
// high-contrast highlight across them, and calls `.click()` on the chosen one —
// the same trick the existing keyboard shortcuts use. This keeps it agnostic to
// the desktop / mobile / offline layouts. See utils/scanSettings.ts for config.

const SCAN_ITEM_SELECTOR = '[data-scan-item]';

function isInputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return Boolean(
    el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.getAttribute('contenteditable') === 'true'),
  );
}

// In a real browser we can use layout to skip hidden panels (the desktop/mobile
// split hides one side with display:none). jsdom implements no layout, so when
// the body has no measurable size we fall back to logical checks only — that
// keeps the engine fully testable.
function hasLayout(): boolean {
  return (
    typeof document !== 'undefined' &&
    !!document.body &&
    document.body.getBoundingClientRect().width > 0
  );
}

function isSelectable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) {
    return false;
  }
  if (el.getAttribute('aria-disabled') === 'true') {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  if (hasLayout()) {
    if (el.offsetParent === null && style.position !== 'fixed') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
  }
  return true;
}

// When a modal dialog is open, scanning must stay inside it — otherwise the
// highlight walks buttons behind the (merely blurred) backdrop, which is
// disorienting and lets the user trigger hidden actions. Dialogs are mounted
// only while open, so the last one present is the active one.
function getScanRoot(): ParentNode {
  const dialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [aria-modal="true"]',
  );
  const last = dialogs[dialogs.length - 1];
  return last ?? document;
}

function collectScanItems(): HTMLElement[] {
  const els = Array.from(
    getScanRoot().querySelectorAll<HTMLElement>(SCAN_ITEM_SELECTOR),
  ).filter(isSelectable);
  return els.sort((a, b) => {
    const orderA = Number(a.dataset.scanOrder ?? '0') || 0;
    const orderB = Number(b.dataset.scanOrder ?? '0') || 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    const position = a.compareDocumentPosition(b);
    // eslint-disable-next-line no-bitwise
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    // eslint-disable-next-line no-bitwise
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    return 0;
  });
}

const ScanProvider: FC<PropsWithChildren> = ({ children = null }) => {
  const t = useTranslations();
  const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [highlightEl, setHighlightEl] = useState<HTMLElement | null>(null);
  // Bumped each time a new dwell target is acquired, to remount (and so restart)
  // the fill animation from zero.
  const [dwellKey, setDwellKey] = useState(0);
  // Forces a re-render so the highlight rect is recomputed on scroll/resize.
  const [, setReposition] = useState(0);

  // The on-screen touch zone shares the engine's switch logic via these refs,
  // which the active mode rebinds.
  const onSwitchDownRef = useRef<() => void>(() => {});
  const onSwitchUpRef = useRef<() => void>(() => {});

  // Load persisted settings on mount and follow live changes.
  useEffect(() => {
    setSettings(getScanSettings());
    const onChange = (event: Event) => {
      const { detail } = event as CustomEvent<ScanSettings>;
      setSettings(detail ?? getScanSettings());
    };
    window.addEventListener(SCAN_SETTINGS_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(SCAN_SETTINGS_CHANGED_EVENT, onChange);
    };
  }, []);

  // Enlarge hit targets when requested.
  useEffect(() => {
    const className = 'scan-big-targets';
    document.documentElement.classList.toggle(className, settings.bigTargets);
    return () => {
      document.documentElement.classList.remove(className);
    };
  }, [settings.bigTargets]);

  // Keep the highlight glued to its target as the page scrolls or resizes.
  useEffect(() => {
    if (!highlightEl) {
      return undefined;
    }
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setReposition((n) => n + 1));
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [highlightEl]);

  // The engine itself: re-armed whenever the settings change.
  useEffect(() => {
    if (settings.mode === 'off') {
      setHighlightEl(null);
      onSwitchDownRef.current = () => {};
      onSwitchUpRef.current = () => {};
      return undefined;
    }

    let items: HTMLElement[] = [];
    let index = 0;

    const showActive = () => {
      setHighlightEl(items[index] ?? null);
    };
    const refresh = (resetIndex: boolean) => {
      const previous = items[index];
      items = collectScanItems();
      if (resetIndex) {
        index = 0;
      } else if (previous) {
        const found = items.indexOf(previous);
        index =
          found >= 0 ? found : Math.min(index, Math.max(0, items.length - 1));
      } else {
        index = Math.min(index, Math.max(0, items.length - 1));
      }
      showActive();
    };
    const advance = () => {
      items = collectScanItems();
      if (items.length === 0) {
        setHighlightEl(null);
        return;
      }
      index = (index + 1) % items.length;
      showActive();
    };
    const selectActive = () => {
      const el = items[index];
      if (el && isSelectable(el)) {
        el.click();
      }
      // Selecting usually changes the UI (a response is sent, a panel closes);
      // recollect and restart the cycle.
      refresh(true);
    };

    const cleanups: Array<() => void> = [];

    // In scanning modes, keep the highlight glued to the same logical element
    // across re-renders. Not in dwell mode, where the pointer drives the target.
    if (settings.mode !== 'dwell') {
      const observer = new MutationObserver(() => refresh(false));
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled'],
      });
      cleanups.push(() => observer.disconnect());
    }

    if (settings.mode === 'auto') {
      refresh(true);
      const interval = window.setInterval(() => {
        if (isInputFocused()) {
          return;
        }
        advance();
      }, settings.scanIntervalMs);
      cleanups.push(() => window.clearInterval(interval));
      onSwitchDownRef.current = () => {
        if (isInputFocused()) {
          return;
        }
        selectActive();
      };
      onSwitchUpRef.current = () => {};
    } else if (settings.mode === 'step') {
      refresh(true);
      let pressStart = 0;
      let holdTimer = 0;
      onSwitchDownRef.current = () => {
        if (isInputFocused() || pressStart !== 0) {
          return;
        }
        pressStart = Date.now();
        holdTimer = window.setTimeout(() => {
          selectActive();
          pressStart = 0;
        }, settings.holdToSelectMs);
      };
      onSwitchUpRef.current = () => {
        if (pressStart === 0) {
          // Already selected by the hold timer.
          return;
        }
        window.clearTimeout(holdTimer);
        pressStart = 0;
        advance();
      };
      cleanups.push(() => window.clearTimeout(holdTimer));
    } else {
      // dwell
      onSwitchDownRef.current = () => {};
      onSwitchUpRef.current = () => {};
      let candidate: HTMLElement | null = null;
      let dwellTimer = 0;
      const clearDwell = () => {
        if (dwellTimer) {
          window.clearTimeout(dwellTimer);
          dwellTimer = 0;
        }
      };
      const onPointerMove = (event: PointerEvent) => {
        const target = event.target as HTMLElement | null;
        const el = target?.closest<HTMLElement>(SCAN_ITEM_SELECTOR) ?? null;
        if (!el || !isSelectable(el)) {
          if (candidate) {
            candidate = null;
            clearDwell();
            setHighlightEl(null);
          }
          return;
        }
        if (el === candidate) {
          return;
        }
        candidate = el;
        clearDwell();
        setHighlightEl(el);
        setDwellKey((k) => k + 1);
        dwellTimer = window.setTimeout(() => {
          dwellTimer = 0;
          if (isSelectable(el)) {
            el.click();
          }
          candidate = null;
          setHighlightEl(null);
        }, settings.dwellMs);
      };
      window.addEventListener('pointermove', onPointerMove, true);
      cleanups.push(() => {
        window.removeEventListener('pointermove', onPointerMove, true);
        clearDwell();
      });
    }

    // Keyboard switch (ignored while typing). Only auto/step use the keyboard.
    if (settings.mode === 'auto' || settings.mode === 'step') {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== settings.switchKey || event.repeat) {
          return;
        }
        if (isInputFocused()) {
          return;
        }
        event.preventDefault();
        onSwitchDownRef.current();
      };
      const onKeyUp = (event: KeyboardEvent) => {
        if (event.key !== settings.switchKey) {
          return;
        }
        if (isInputFocused()) {
          return;
        }
        event.preventDefault();
        onSwitchUpRef.current();
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      cleanups.push(() => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      });
    }

    return () => {
      cleanups.forEach((fn) => fn());
      setHighlightEl(null);
    };
  }, [settings]);

  const rect = highlightEl?.getBoundingClientRect();
  const showSwitchBar = settings.mode === 'auto' || settings.mode === 'step';

  const onBarPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onSwitchDownRef.current();
  };
  const onBarPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onSwitchUpRef.current();
  };

  return (
    <Fragment>
      {children}
      {highlightEl && rect && (
        <div
          className='scan-highlight'
          aria-hidden='true'
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        >
          {settings.mode === 'dwell' && (
            <span
              key={dwellKey}
              className='scan-dwell-fill'
              style={{
                animation: `scan-dwell-fill-anim ${settings.dwellMs}ms linear forwards`,
              }}
            />
          )}
        </div>
      )}
      {showSwitchBar && (
        <button
          type='button'
          className='scan-switch-bar'
          aria-label={t('accessibility.scanBarLabel')}
          onPointerDown={onBarPointerDown}
          onPointerUp={onBarPointerUp}
        >
          {t('accessibility.scanBarLabel')}
        </button>
      )}
    </Fragment>
  );
};

export default ScanProvider;

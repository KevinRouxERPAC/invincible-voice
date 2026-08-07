'use client';

import { useEffect, useState } from 'react';
import {
  getScanSettings,
  SCAN_SETTINGS_CHANGED_EVENT,
  type ScanSettings,
} from '@/utils/scanSettings';

/** Live motor-accessibility settings (scan / dwell). */
export function useScanSettings(): ScanSettings {
  const [settings, setSettings] = useState<ScanSettings>(() =>
    getScanSettings(),
  );

  useEffect(() => {
    const onChange = (event: Event) => {
      const { detail } = event as CustomEvent<ScanSettings>;
      setSettings(detail ?? getScanSettings());
    };
    window.addEventListener(SCAN_SETTINGS_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(SCAN_SETTINGS_CHANGED_EVENT, onChange);
    };
  }, []);

  return settings;
}

// Download-on-first-run + load of the on-device GGUF model (native app only).
//
// The model is deliberately NOT bundled in the APK: it is ~1 GB, which would
// blow past the Play Store limit and force every user to pay the cost even when
// they only ever use the cloud backend. Instead it is fetched once, into the
// app's internal storage, and loaded from there.
//
// The internal directory (`Directory.Data` = /data/data/<pkg>/files on Android)
// is not a choice of taste: the native side cannot open a path on the FUSE-backed
// external storage (SELinux denies untrusted_app), and mmap fails there too.

import { Directory, Filesystem } from '@capacitor/filesystem';

import { loadNativeModel } from '@/utils/localLlm';
import { isNativeApp } from '@/utils/platform';

export const MODEL_FILENAME = 'model.gguf';

/**
 * A partially-written file (interrupted download) would make llama.cpp fail at
 * load time with an opaque error. Anything smaller than this is treated as
 * corrupt and re-downloaded.
 */
const MIN_PLAUSIBLE_MODEL_BYTES = 100 * 1024 * 1024;

export type ModelState =
  | { status: 'absent' }
  | { status: 'downloading'; receivedBytes: number; totalBytes: number | null }
  | { status: 'ready'; path: string }
  | { status: 'error'; message: string };

/** Where the GGUF is fetched from. Overridable so a build can pin its own copy. */
export function getModelUrl(): string {
  return (
    process.env.NEXT_PUBLIC_LOCAL_MODEL_URL ??
    'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true'
  );
}

/** Absolute on-device path of the model, or null when it is not downloaded. */
export async function getDownloadedModelPath(): Promise<string | null> {
  try {
    const stat = await Filesystem.stat({
      path: MODEL_FILENAME,
      directory: Directory.Data,
    });
    if (stat.size < MIN_PLAUSIBLE_MODEL_BYTES) {
      return null;
    }
    return stat.uri.replace(/^file:\/\//, '');
  } catch {
    return null;
  }
}

/** Delete the downloaded model (frees ~1 GB). */
export async function deleteDownloadedModel(): Promise<void> {
  try {
    await Filesystem.deleteFile({
      path: MODEL_FILENAME,
      directory: Directory.Data,
    });
  } catch {
    // Already gone: nothing to do.
  }
}

/**
 * Download the model if needed, then load it into the native engine.
 *
 * Resolves with the absolute model path on success. `onState` reports progress
 * so the UI can show a download bar. Safe to call on every startup: when the
 * file is already present it only loads it.
 */
export async function ensureLocalModelReady(
  onState?: (state: ModelState) => void,
): Promise<string | null> {
  if (!isNativeApp()) {
    return null;
  }

  let path = await getDownloadedModelPath();

  if (!path) {
    onState?.({ status: 'downloading', receivedBytes: 0, totalBytes: null });

    const listener = await Filesystem.addListener(
      'progress',
      ({ bytes, contentLength }) => {
        onState?.({
          status: 'downloading',
          receivedBytes: bytes,
          totalBytes: contentLength > 0 ? contentLength : null,
        });
      },
    );

    try {
      const { path: downloadedPath } = await Filesystem.downloadFile({
        url: getModelUrl(),
        path: MODEL_FILENAME,
        directory: Directory.Data,
        progress: true,
      });
      path = downloadedPath?.replace(/^file:\/\//, '') ?? null;
    } catch (error) {
      // A half-written file would be picked up as "present" on the next run.
      await deleteDownloadedModel();
      const message = error instanceof Error ? error.message : String(error);
      onState?.({ status: 'error', message });
      return null;
    } finally {
      await listener.remove();
    }
  }

  if (!path) {
    onState?.({ status: 'error', message: 'download produced no path' });
    return null;
  }

  try {
    const loaded = await loadNativeModel(path);
    if (!loaded) {
      onState?.({ status: 'error', message: 'model failed to load' });
      return null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onState?.({ status: 'error', message });
    return null;
  }

  onState?.({ status: 'ready', path });
  return path;
}

import {
  deleteDownloadedModel,
  ensureLocalModelReady,
  getDownloadedModelPath,
  MODEL_FILENAME,
} from '../modelManager';

jest.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: {
    stat: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: jest.fn(),
    addListener: jest.fn(),
  },
}));

jest.mock('@/utils/platform', () => ({
  isNativeApp: jest.fn(() => true),
}));

jest.mock('@/utils/localLlm', () => ({
  loadNativeModel: jest.fn(),
}));

const { Filesystem } = jest.requireMock('@capacitor/filesystem');
const { isNativeApp } = jest.requireMock('@/utils/platform');
const { loadNativeModel } = jest.requireMock('@/utils/localLlm');

const ONE_GB = 1024 * 1024 * 1024;
const removeListener = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  isNativeApp.mockReturnValue(true);
  Filesystem.addListener.mockResolvedValue({ remove: removeListener });
  Filesystem.deleteFile.mockResolvedValue(undefined);
  loadNativeModel.mockResolvedValue(true);
});

describe('getDownloadedModelPath', () => {
  it('returns the path of an already-downloaded model, without the file:// scheme', async () => {
    Filesystem.stat.mockResolvedValue({
      size: ONE_GB,
      uri: `file:///data/user/0/app/files/${MODEL_FILENAME}`,
    });

    await expect(getDownloadedModelPath()).resolves.toBe(
      `/data/user/0/app/files/${MODEL_FILENAME}`,
    );
  });

  it('reports absent when the file does not exist', async () => {
    Filesystem.stat.mockRejectedValue(new Error('not found'));

    await expect(getDownloadedModelPath()).resolves.toBeNull();
  });

  it('treats a truncated file as absent so a failed download is retried', async () => {
    Filesystem.stat.mockResolvedValue({
      size: 4096,
      uri: `file:///data/user/0/app/files/${MODEL_FILENAME}`,
    });

    await expect(getDownloadedModelPath()).resolves.toBeNull();
  });
});

describe('ensureLocalModelReady', () => {
  it('does nothing on the web build', async () => {
    isNativeApp.mockReturnValue(false);

    await expect(ensureLocalModelReady()).resolves.toBeNull();
    expect(Filesystem.downloadFile).not.toHaveBeenCalled();
  });

  it('loads an existing model without re-downloading it', async () => {
    Filesystem.stat.mockResolvedValue({
      size: ONE_GB,
      uri: `file:///data/files/${MODEL_FILENAME}`,
    });
    const states: string[] = [];

    const path = await ensureLocalModelReady((s) => states.push(s.status));

    expect(Filesystem.downloadFile).not.toHaveBeenCalled();
    expect(loadNativeModel).toHaveBeenCalledWith(
      `/data/files/${MODEL_FILENAME}`,
    );
    expect(path).toBe(`/data/files/${MODEL_FILENAME}`);
    expect(states).toEqual(['ready']);
  });

  it('downloads the model on first run, then loads it', async () => {
    Filesystem.stat.mockRejectedValue(new Error('not found'));
    Filesystem.downloadFile.mockResolvedValue({
      path: `/data/files/${MODEL_FILENAME}`,
    });
    const states: string[] = [];

    const path = await ensureLocalModelReady((s) => states.push(s.status));

    expect(Filesystem.downloadFile).toHaveBeenCalledTimes(1);
    expect(path).toBe(`/data/files/${MODEL_FILENAME}`);
    expect(states).toEqual(['downloading', 'ready']);
    expect(removeListener).toHaveBeenCalled();
  });

  it('reports download progress', async () => {
    Filesystem.stat.mockRejectedValue(new Error('not found'));
    Filesystem.downloadFile.mockImplementation(async () => {
      const onProgress = Filesystem.addListener.mock.calls[0][1];
      onProgress({ bytes: 50, contentLength: 200 });
      return { path: `/data/files/${MODEL_FILENAME}` };
    });
    const states: unknown[] = [];

    await ensureLocalModelReady((s) => states.push(s));

    expect(states).toContainEqual({
      status: 'downloading',
      receivedBytes: 50,
      totalBytes: 200,
    });
  });

  it('deletes the partial file when the download fails, so it is retried next run', async () => {
    Filesystem.stat.mockRejectedValue(new Error('not found'));
    Filesystem.downloadFile.mockRejectedValue(new Error('network down'));
    const states: unknown[] = [];

    const path = await ensureLocalModelReady((s) => states.push(s));

    expect(path).toBeNull();
    expect(Filesystem.deleteFile).toHaveBeenCalledWith({
      path: MODEL_FILENAME,
      directory: 'DATA',
    });
    expect(states).toContainEqual({
      status: 'error',
      message: 'network down',
    });
    expect(removeListener).toHaveBeenCalled();
  });

  it('reports an error when the engine refuses the model', async () => {
    Filesystem.stat.mockResolvedValue({
      size: ONE_GB,
      uri: `file:///data/files/${MODEL_FILENAME}`,
    });
    loadNativeModel.mockResolvedValue(false);
    const states: unknown[] = [];

    const path = await ensureLocalModelReady((s) => states.push(s));

    expect(path).toBeNull();
    expect(states).toContainEqual({
      status: 'error',
      message: 'model failed to load',
    });
  });
});

describe('deleteDownloadedModel', () => {
  it('swallows the error when there is nothing to delete', async () => {
    Filesystem.deleteFile.mockRejectedValue(new Error('not found'));

    await expect(deleteDownloadedModel()).resolves.toBeUndefined();
  });
});

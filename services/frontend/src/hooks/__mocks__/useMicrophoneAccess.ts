export const useMicrophoneAccess = jest.fn(() => ({
  microphoneAccess: 'unknown',
  askMicrophoneAccess: jest.fn().mockResolvedValue(new MediaStream()),
  mediaStream: { current: null },
}));

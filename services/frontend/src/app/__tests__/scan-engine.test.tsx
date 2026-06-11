import { act, fireEvent, render } from '@testing-library/react';
import { ReactNode } from 'react';
import ScanProvider from '../../accessibility/ScanProvider';
import { setScanSettings } from '../../utils/scanSettings';

function renderTargets(clicks: jest.Mock[], extra?: ReactNode) {
  return render(
    <ScanProvider>
      <button
        type="button"
        data-scan-item
        onClick={clicks[0]}
      >
        Zero
      </button>
      <button
        type="button"
        data-scan-item
        onClick={clicks[1]}
      >
        One
      </button>
      {extra}
    </ScanProvider>,
  );
}

describe('scan engine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('auto scan: switch selects the highlighted item, interval advances', () => {
    setScanSettings({ mode: 'auto', scanIntervalMs: 1000, switchKey: ' ' });
    const clicks = [jest.fn(), jest.fn()];
    renderTargets(clicks);

    // Highlight starts on item 0 → a switch press selects it.
    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
    });
    expect(clicks[0]).toHaveBeenCalledTimes(1);
    expect(clicks[1]).not.toHaveBeenCalled();

    // After one interval the highlight is on item 1.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
    });
    expect(clicks[1]).toHaveBeenCalledTimes(1);
  });

  test('auto scan: data-scan-order puts the emergency target first', () => {
    setScanSettings({ mode: 'auto', scanIntervalMs: 1000, switchKey: ' ' });
    const clicks = [jest.fn(), jest.fn()];
    const urgent = jest.fn();
    renderTargets(
      clicks,
      <button
        type="button"
        data-scan-item
        data-scan-order={-1}
        onClick={urgent}
      >
        Urgent
      </button>,
    );

    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
    });
    expect(urgent).toHaveBeenCalledTimes(1);
    expect(clicks[0]).not.toHaveBeenCalled();
  });

  test('step scan: short press advances, long press selects', () => {
    setScanSettings({
      mode: 'step',
      holdToSelectMs: 600,
      switchKey: ' ',
    });
    const clicks = [jest.fn(), jest.fn()];
    renderTargets(clicks);

    // Short press: down then up before the hold threshold → advance to item 1.
    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
      fireEvent.keyUp(window, { key: ' ' });
    });
    expect(clicks[0]).not.toHaveBeenCalled();

    // Long press: hold past the threshold → select the highlighted item 1.
    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
    });
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(clicks[1]).toHaveBeenCalledTimes(1);
  });

  test('dwell: resting on a target selects it; moving away resets the timer', () => {
    setScanSettings({ mode: 'dwell', dwellMs: 1000 });
    const clicks = [jest.fn(), jest.fn()];
    const { getByText } = renderTargets(clicks);
    const zero = getByText('Zero');
    const one = getByText('One');

    // Rest on item 0 for half the dwell time, then move to item 1.
    act(() => {
      fireEvent.pointerMove(zero);
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    act(() => {
      fireEvent.pointerMove(one);
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    // Item 0 never reached its full dwell, so it was not selected.
    expect(clicks[0]).not.toHaveBeenCalled();

    // Item 1 completes its dwell → selected.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(clicks[1]).toHaveBeenCalledTimes(1);
  });

  test('off mode: the switch key does nothing', () => {
    setScanSettings({ mode: 'off' });
    const clicks = [jest.fn(), jest.fn()];
    renderTargets(clicks);

    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
    });
    expect(clicks[0]).not.toHaveBeenCalled();
  });
});

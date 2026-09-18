import { render, screen } from '@testing-library/react';
import React from 'react';
import StartupProgress from '@/components/StartupProgress';

const steps = (profileDone: boolean) => [
  { label: 'Waking the server', done: false },
  { label: 'Signing your account in', done: false },
  { label: 'Loading your profile', done: profileDone },
  { label: 'Ready to chat', done: false },
];

const doneLabels = () =>
  screen
    .getAllByRole('listitem')
    .filter((li) => li.querySelector('svg'))
    .map((li) => li.textContent);

describe('StartupProgress', () => {
  it('names the screen and shows which attempt is running', () => {
    render(
      <StartupProgress
        percent={25}
        attempt={2}
        total={8}
        steps={steps(false)}
      />,
    );

    expect(screen.getByText('The server is starting…')).toBeInTheDocument();
    expect(screen.getByText('Attempt 2 of 8')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
  });

  it('shows the brand mark', () => {
    render(
      <StartupProgress
        percent={0}
        attempt={1}
        total={8}
        steps={steps(false)}
      />,
    );

    expect(screen.getByAltText('Invincible Logo')).toBeInTheDocument();
  });

  // The profile completes early from the local cache. Ticking it while the
  // server step was still pending made the list read as broken rather than as
  // a sequence, so a step only counts as done once every earlier one is.
  it('never ticks a step before the ones above it', () => {
    render(
      <StartupProgress
        percent={40}
        attempt={3}
        total={8}
        steps={steps(true)}
      />,
    );

    expect(doneLabels()).toEqual([]);
  });

  it('ticks steps once the sequence really is complete', () => {
    render(
      <StartupProgress
        percent={100}
        attempt={8}
        total={8}
        steps={[
          { label: 'Waking the server', done: true },
          { label: 'Signing your account in', done: true },
          { label: 'Loading your profile', done: false },
          { label: 'Ready to chat', done: false },
        ]}
      />,
    );

    expect(doneLabels()).toEqual([
      'Waking the server',
      'Signing your account in',
    ]);
  });
});

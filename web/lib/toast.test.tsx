import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { ToastProvider, useToast, type ToastInput } from './toast';

function Trigger({ toast }: { toast: ToastInput }) {
  const show = useToast();
  return <button onClick={() => show(toast)}>go</button>;
}

describe('toasts', () => {
  it('runs the action once and closes', () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <Trigger toast={{ message: 'Marked as completed', action: { label: 'Undo', onAction }, countdown: 60 }} />
      </ToastProvider>,
    );
    act(() => screen.getByText('go').click());
    act(() => screen.getByRole('button', { name: 'Undo' }).click());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Marked as completed')).toBeNull();
  });

  it('goes away on its own', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger toast={{ message: 'Saved' }} />
      </ToastProvider>,
    );
    act(() => screen.getByText('go').click());
    expect(screen.getByText('Saved')).toBeTruthy();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText('Saved')).toBeNull();
    vi.useRealTimers();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useConfirm } from './confirm';

function Harness({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [confirm, dialog] = useConfirm();
  return (
    <>
      <button
        onClick={() =>
          confirm({ title: 'Delete Bugs?', description: 'It goes for good.', action: 'Delete', onConfirm })
        }
      >
        ask
      </button>
      {dialog}
    </>
  );
}

describe('useConfirm', () => {
  it('runs the action only when confirmed', async () => {
    const onConfirm = vi.fn(async () => {});
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByText('ask'));
    expect(screen.getByRole('dialog', { name: 'Delete Bugs?' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByText('ask'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

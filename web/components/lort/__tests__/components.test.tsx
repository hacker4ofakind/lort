import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Composer, FloatingBar, StatusIcon, StatusText, TriageBar, VoteSticker } from '@/components/lort';

describe('VoteSticker', () => {
  it('slaps on and peels off, counting the viewer', async () => {
    const onVotedChange = vi.fn();
    render(<VoteSticker count={4} subject="Dark mode" onVotedChange={onVotedChange} />);
    const button = screen.getByRole('button', { name: 'Upvote Dark mode, 4 votes' });
    await userEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toBe('5');
    expect(onVotedChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(button);
    expect(button.textContent).toBe('4');
  });

  it('is plain text when read-only', () => {
    render(<VoteSticker count={48} readOnly />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByLabelText('48 votes')).toBeTruthy();
  });
});

describe('Status label rule', () => {
  it('names an icon-only status and shows the label once otherwise', () => {
    const { container, rerender } = render(<StatusIcon status="progress" />);
    expect(screen.getByRole('img', { name: 'In progress' })).toBeTruthy();
    rerender(<StatusIcon status="progress" showLabel />);
    expect(container.textContent).toBe('In progress');
    rerender(<StatusText status="completed" />);
    expect(screen.getByText('Completed').getAttribute('style')).toContain('--status-completed-text');
  });
});

describe('TriageBar', () => {
  it('offers the actions for the status, forward action last', async () => {
    const onAction = vi.fn();
    render(<TriageBar status="reviewing" onAction={onAction} />);
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Close', 'Merge', 'Skip', 'Add to roadmap']);
    await userEvent.click(screen.getByRole('button', { name: 'Add to roadmap' }));
    expect(onAction.mock.calls[0][0]).toMatchObject({ id: 'roadmap', next: 'planned' });
  });
});

describe('FloatingBar', () => {
  it('hides the board filter when there is one board', () => {
    const { rerender } = render(<FloatingBar boards={[{ value: 'b1', label: 'Features' }]} />);
    expect(screen.queryByRole('button', { name: /All boards/ })).toBeNull();
    rerender(
      <FloatingBar
        boards={[
          { value: 'b1', label: 'Features' },
          { value: 'b2', label: 'Bugs' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /All boards/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open ideas/ })).toBeTruthy();
  });
});

describe('Composer', () => {
  it('locks while sending and keeps the draft when sending fails', async () => {
    let fail: (e: Error) => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    render(<Composer onSubmit={onSubmit} />);
    const field = screen.getByRole('textbox');
    await userEvent.type(field, 'Same on iOS');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith({ text: 'Same on iOS', images: [], visibility: 'public' });
    expect(field.hasAttribute('readonly')).toBe(true);
    fail(new Error('You are going too fast. Try again in a minute.'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('going too fast'));
    expect((field as HTMLTextAreaElement).value).toBe('Same on iOS');
  });

  it('clears after a successful send', async () => {
    render(<Composer onSubmit={async () => {}} />);
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(field, 'Thanks!');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(field.value).toBe(''));
  });

  it('shows the visibility switch only to admins', () => {
    const { rerender } = render(<Composer />);
    expect(screen.queryByRole('button', { name: /Visibility/ })).toBeNull();
    rerender(<Composer canUseInternal />);
    expect(screen.getByRole('button', { name: /Visibility: Public/ })).toBeTruthy();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Toggle } from './toggle';

describe('Toggle', () => {
  it('is a labelled switch that shows its state', () => {
    const onChange = vi.fn();
    const { container } = render(<Toggle label="Bugs is public" checked onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Bugs is public' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    // Guards against class strings glued together (e.g. "lt-switchis-on").
    expect(container.querySelector('.lt-switch.is-on')).not.toBeNull();
    sw.click();
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

import { describe, expect, it } from 'vitest';

import { orderChanges } from './sortable-rows';

describe('orderChanges', () => {
  it('saves only the rows that moved', () => {
    expect(
      orderChanges([
        { id: 'b', order: 1 },
        { id: 'a', order: 0 },
        { id: 'c', order: 2 },
      ]),
    ).toEqual([
      { id: 'b', order: 0 },
      { id: 'a', order: 1 },
    ]);
  });
});

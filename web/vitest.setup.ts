import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library only cleans up on its own when Vitest globals are on; they're off here.
afterEach(cleanup);

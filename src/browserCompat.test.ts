import { afterEach, expect, it, vi } from 'vitest';
import { createRequestId, timeoutSignal } from './browserCompat';

afterEach(() => vi.unstubAllGlobals());

it('creates a valid request id when randomUUID is unavailable', () => {
  vi.stubGlobal('crypto', {});
  const id = createRequestId();
  expect(id).toMatch(/^[a-zA-Z0-9-]{16,80}$/);
});

it('allows requests without a timeout signal on older browsers', () => {
  vi.stubGlobal('AbortSignal', undefined);
  expect(timeoutSignal(1000)).toBeUndefined();
});

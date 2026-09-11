import { describe, expect, it } from 'vitest';
import { createScreenLockConfig, matchesPin, parseScreenLockConfig, validPin } from './screenLock';

describe('screen lock', () => {
  it('accepts only numeric PINs with four to six digits', () => {
    expect(validPin('1234')).toBe(true);
    expect(validPin('123456')).toBe(true);
    expect(validPin('123')).toBe(false);
    expect(validPin('12a4')).toBe(false);
  });

  it('stores a salted fingerprint and verifies the PIN', async () => {
    const config = await createScreenLockConfig('4826');
    expect(config.hash).not.toContain('4826');
    expect(parseScreenLockConfig(JSON.stringify(config))).toEqual(config);
    await expect(matchesPin('4826', config)).resolves.toBe(true);
    await expect(matchesPin('4827', config)).resolves.toBe(false);
  });
});

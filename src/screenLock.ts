export interface ScreenLockConfig {
  version: 1;
  salt: string;
  hash: string;
  pinLength: number;
}

export const SCREEN_LOCK_CONFIG_KEY = 'rasp.screen-lock.config.v1';
export const SCREEN_LOCK_STATE_KEY = 'rasp.screen-lock.locked.v1';

export function validPin(value: string) {
  return /^\d{4,6}$/.test(value);
}

export function parseScreenLockConfig(raw: string): ScreenLockConfig | null {
  try {
    const value = JSON.parse(raw) as ScreenLockConfig;
    if (value.version !== 1 || !/^[a-f0-9]{32}$/.test(value.salt) || !/^[a-f0-9]{64}$/.test(value.hash) || ![4, 5, 6].includes(value.pinLength)) return null;
    return value;
  } catch { return null; }
}

function toHex(value: Uint8Array) {
  return [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string) {
  return new Uint8Array(value.match(/.{2}/g)?.map(byte => Number.parseInt(byte, 16)) ?? []);
}

export function createSalt() {
  const value = new Uint8Array(16);
  crypto.getRandomValues(value);
  return toHex(value);
}

export async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(salt), iterations: 80_000, hash: 'SHA-256' }, key, 256);
  return toHex(new Uint8Array(bits));
}

export async function createScreenLockConfig(pin: string): Promise<ScreenLockConfig> {
  if (!validPin(pin)) throw new Error('El PIN debe tener entre 4 y 6 números.');
  const salt = createSalt();
  return { version: 1, salt, hash: await hashPin(pin, salt), pinLength: pin.length };
}

export async function matchesPin(pin: string, config: ScreenLockConfig) {
  if (!validPin(pin)) return false;
  const candidate = await hashPin(pin, config.salt);
  let difference = candidate.length ^ config.hash.length;
  for (let index = 0; index < Math.min(candidate.length, config.hash.length); index += 1) difference |= candidate.charCodeAt(index) ^ config.hash.charCodeAt(index);
  return difference === 0;
}

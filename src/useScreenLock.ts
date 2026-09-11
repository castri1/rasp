import { useEffect, useState } from 'react';
import { createScreenLockConfig, matchesPin, parseScreenLockConfig, SCREEN_LOCK_CONFIG_KEY, SCREEN_LOCK_STATE_KEY, validPin } from './screenLock';
import type { ScreenLockConfig } from './screenLock';

function loadConfig() {
  try { return parseScreenLockConfig(localStorage.getItem(SCREEN_LOCK_CONFIG_KEY) || ''); }
  catch { return null; }
}

export function useScreenLock() {
  const [config, setConfig] = useState<ScreenLockConfig | null>(loadConfig);
  const [locked, setLocked] = useState(() => { try { return Boolean(loadConfig() && localStorage.getItem(SCREEN_LOCK_STATE_KEY) === 'true'); } catch { return false; } });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === SCREEN_LOCK_CONFIG_KEY) setConfig(parseScreenLockConfig(event.newValue || ''));
      if (event.key === SCREEN_LOCK_STATE_KEY) setLocked(event.newValue === 'true');
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function persistLocked(value: boolean) {
    try { localStorage.setItem(SCREEN_LOCK_STATE_KEY, String(value)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
    setLocked(value);
  }
  async function savePin(nextPin: string, currentPin = '') {
    if (!validPin(nextPin)) { setMessage('El PIN debe tener entre 4 y 6 números.'); return false; }
    setBusy(true); setMessage('');
    try {
      if (config && !(await matchesPin(currentPin, config))) { setMessage('El PIN actual no coincide.'); return false; }
      const next = await createScreenLockConfig(nextPin);
      localStorage.setItem(SCREEN_LOCK_CONFIG_KEY, JSON.stringify(next));
      setConfig(next); setStorageAvailable(true); setMessage(config ? 'PIN actualizado.' : 'PIN creado. Ya puedes bloquear la pantalla.'); return true;
    } catch { setStorageAvailable(false); setMessage('No se pudo guardar el PIN en este navegador.'); return false; }
    finally { setBusy(false); }
  }
  function lock() {
    if (!config) { setMessage('Crea primero un PIN.'); return false; }
    setMessage(''); persistLocked(true); return true;
  }
  async function unlock(pin: string) {
    if (!config || busy) return false;
    const now = Date.now();
    if (retryAt > now) { setMessage(`Espera ${Math.ceil((retryAt - now) / 1000)} segundos.`); return false; }
    setBusy(true);
    try {
      if (await matchesPin(pin, config)) { setFailedAttempts(0); setRetryAt(0); setMessage(''); persistLocked(false); return true; }
      const failures = failedAttempts + 1;
      setFailedAttempts(failures);
      if (failures >= 5) { setRetryAt(now + 30_000); setFailedAttempts(0); setMessage('Demasiados intentos. Espera 30 segundos.'); }
      else setMessage(`PIN incorrecto · ${5 - failures} intento${5 - failures === 1 ? '' : 's'}.`);
      return false;
    } finally { setBusy(false); }
  }

  return { configured: Boolean(config), pinLength: config?.pinLength ?? 4, locked, busy, message, retryAt, storageAvailable, savePin, lock, unlock };
}

export type ScreenLockController = ReturnType<typeof useScreenLock>;

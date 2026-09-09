import { useEffect, useState } from 'react';
import { createRequestId, timeoutSignal } from './browserCompat';
export interface MacStatus { available: boolean; ready: boolean; shortcut: string; message: string }
export const FOCUS_SHORTCUT = 'Rasp Focus';
const preferenceKey = 'rasp.macFocus.v1';
async function api(path: string, body?: object) {
  const response = await fetch(`/api/mac/${path}`, {
    method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-Rasp-Request': 'focus' } : {},
    body: body ? JSON.stringify(body) : undefined, signal: timeoutSignal(25000),
  });
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Inicia Rasp en el Mac para conectar Atajos.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'El Mac no pudo ejecutar el atajo.');
  return data;
}
export function useMacFocus() {
  const [status, setStatus] = useState<MacStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem(preferenceKey) === 'true'; } catch { return false; } });
  const [message, setMessage] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    function sync(event: StorageEvent) { if (event.key === preferenceKey) setEnabled(event.newValue === 'true'); }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(preferenceKey, String(enabled)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
  }, [enabled]);
  async function refresh() {
    setChecking(true);
    try { setStatus(await api('status')); }
    catch { setStatus({ available: false, ready: false, shortcut: FOCUS_SHORTCUT, message: 'El acompañante del Mac no está disponible.' }); }
    finally { setChecking(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function activate(deadline: number) {
    if (!enabled) return;
    setRequesting(true); setMessage('Solicitando No molestar…');
    try {
      const result = await api('focus', { deadline, requestId: createRequestId() });
      setMessage(result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo activar No molestar. El Pomodoro sigue en marcha.'); }
    finally { setRequesting(false); }
  }
  return { status, checking, enabled, setEnabled, message, requesting, refresh, activate, storageAvailable };
}
export type MacFocusController = ReturnType<typeof useMacFocus>;

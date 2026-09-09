import { useEffect, useState } from 'react';
import { EMPTY_ALEXA } from './alexa';
import { createRequestId, timeoutSignal } from './browserCompat';
import type { AlexaConfig, AlexaConnection, SceneId } from './alexa';
async function api(path: string, body?: object) {
  const response = await fetch(`/api/alexa/${path}`, { method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json', 'X-Rasp-Request': 'alexa' } : {},
    body: body ? JSON.stringify(body) : undefined, signal: timeoutSignal(35000),
  });
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('El servicio de conexión de Rasp no está disponible.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'No se pudo completar la solicitud.');
  return result;
}
export function useAlexa() {
  const [config, setConfig] = useState<AlexaConfig>(EMPTY_ALEXA);
  const [connection, setConnection] = useState<AlexaConnection>({ state: 'loading', message: 'Comprobando la configuración…', devices: [] });
  const [busy, setBusy] = useState(false);
  const [pendingScene, setPendingScene] = useState<SceneId | null>(null);
  const [lastSent, setLastSent] = useState<{ scene: SceneId; sentAt: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    api('config').then(result => { if (active) { setConfig(result.config); setConnection(result.connection); } }).catch(() => {
      if (active) setConnection({ state: 'offline', message: 'El servicio de conexión de Rasp no está disponible.', devices: [] });
    });
    return () => { active = false; };
  }, []);
  async function check() {
    setBusy(true); setMessage(''); setError(false);
    try { const result = await api('check', {}); setConnection(result.connection); return result.connection as AlexaConnection; }
    catch (err) { const text = err instanceof Error ? err.message : 'No se pudo comprobar la conexión.'; setMessage(text); setError(true); setConnection({ state: 'error', devices: [], message: text }); return null; }
    finally { setBusy(false); }
  }
  async function save(next: AlexaConfig, token: string) {
    setBusy(true); setMessage(''); setError(false);
    try {
      const result = await api('config', { ...next, token });
      setConfig(result.config); setMessage(result.message);
      setConnection(previous => ({ ...previous, devices: config.url === next.url ? previous.devices : [], state: next.url ? 'unchecked' : 'not_configured', message: next.url ? 'Configuración guardada. Comprueba la conexión.' : 'Conecta Home Assistant para ejecutar tus escenas.' }));
      return true;
    } catch (err) { setMessage(err instanceof Error ? err.message : 'No se pudo guardar.'); setError(true); return false; }
    finally { setBusy(false); }
  }
  async function run(scene: SceneId, source: 'manual' | 'automatic' = 'manual') {
    if (busy) return;
    if (source === 'automatic' && (scene !== 'focus' && scene !== 'break' || !config.automatic[scene as 'focus' | 'break'])) return;
    setBusy(true); setPendingScene(scene); setError(false); setMessage('Enviando la orden a Alexa…');
    try {
      const result = await api('run', { scene, source, requestId: createRequestId() });
      setMessage(result.message); setLastSent({ scene, sentAt: result.sentAt }); setConnection(previous => ({ ...previous, state: 'ready', message: 'Conexión lista.' })); return result.message as string;
    } catch (err) { const text = err instanceof Error ? err.message : 'No se pudo enviar la escena.'; setMessage(text); setError(true); setConnection(previous => ({ ...previous, state: 'error', message: text })); return text; }
    finally { setBusy(false); setPendingScene(null); }
  }
  return { config, connection, busy, pendingScene, lastSent, message, error, check, save, run };
}
export type AlexaController = ReturnType<typeof useAlexa>;

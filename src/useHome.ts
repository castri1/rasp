import { useCallback, useEffect, useState } from 'react';
import { EMPTY_HOME } from './home';
import type { HomeState } from './home';
import { timeoutSignal } from './browserCompat';

async function api(path: string, body?: object) {
  const response = await fetch(`/api/home/${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-Rasp-Request': 'home' } : {}, body: body ? JSON.stringify(body) : undefined, signal: timeoutSignal(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'No se pudo consultar la casa.');
  return result;
}
export function useHome() {
  const [home, setHome] = useState<HomeState>(EMPTY_HOME);
  const [busyRoom, setBusyRoom] = useState<string | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { const result = await api('state'); setHome(result); setError(''); return result as HomeState; }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo consultar la casa.'); return null; }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  async function toggle(roomId: string, turnOn: boolean) {
    if (busyRoom) return;
    setBusyRoom(roomId); setError('');
    try {
      const result = await api('toggle', { roomId, turnOn });
      setHome(previous => ({ ...previous, message: result.message, rooms: previous.rooms.map(room => roomId === 'all' || room.id === roomId ? { ...room, on: turnOn ? room.devices.length - room.unavailable : 0, devices: room.devices.map(device => ['unknown', 'unavailable'].includes(device.state) ? device : { ...device, state: turnOn ? 'on' : 'off' }) } : room) }));
      window.setTimeout(() => void refresh(), 900);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo controlar el ambiente.'); }
    finally { setBusyRoom(null); }
  }
  return { home, busyRoom, error, refresh, toggle };
}
export type HomeController = ReturnType<typeof useHome>;


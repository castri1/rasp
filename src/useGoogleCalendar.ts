import { useCallback, useEffect, useState } from 'react';
import type { CalendarEvent } from './calendar';
import { timeoutSignal } from './browserCompat';

export interface GoogleCalendarConfig {
  configured: boolean;
  connected: boolean;
  account: string;
  clientIdHint: string;
}

export interface GoogleCalendarPairing {
  code: string;
  addresses: string[];
  expiresAt: string;
  initiallyConfigured: boolean;
}

type CalendarSource = 'google' | 'cache' | 'none';
const EMPTY_CONFIG: GoogleCalendarConfig = { configured: false, connected: false, account: '', clientIdHint: '' };

async function api(path: string, data?: object) {
  const response = await fetch(`/api/calendar/${path}`, {
    method: data ? 'POST' : 'GET',
    headers: data ? { 'Content-Type': 'application/json', 'X-Rasp-Request': 'calendar' } : {},
    body: data ? JSON.stringify(data) : undefined,
    signal: timeoutSignal(25_000),
  });
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new Error('El servicio de Google Calendar no está disponible en esta instalación.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'No se pudo completar la solicitud a Google Calendar.');
  return result;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export function useGoogleCalendar() {
  const [config, setConfig] = useState<GoogleCalendarConfig>(EMPTY_CONFIG);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [source, setSource] = useState<CalendarSource>('none');
  const [syncedAt, setSyncedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [pairing, setPairing] = useState<GoogleCalendarPairing | null>(null);

  const loadStatus = useCallback(async () => {
    const result = await api('status');
    setConfig(result.config);
    return result.config as GoogleCalendarConfig;
  }, []);

  const refresh = useCallback(async (showProgress = true) => {
    if (showProgress) setBusy(true);
    setError(false);
    try {
      const range = todayRange();
      const query = new URLSearchParams(range);
      const result = await api(`events?${query}`);
      setEvents(result.events);
      setSource(result.source);
      setSyncedAt(result.syncedAt || '');
      if (result.account) setConfig(previous => ({ ...previous, account: result.account }));
      setMessage(result.source === 'cache'
        ? `Sin conexión · mostrando la agenda guardada${result.warning ? ` (${result.warning})` : ''}.`
        : 'Agenda sincronizada con Google.');
      return true;
    } catch (reason) {
      setSource('none');
      setMessage(reason instanceof Error ? reason.message : 'No se pudo sincronizar la agenda.');
      setError(true);
      return false;
    } finally {
      if (showProgress) setBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await api('status');
        if (!active) return;
        setConfig(result.config);
        const returnedParameters = new URLSearchParams(window.location.search);
        const returnedFromGoogle = returnedParameters.get('calendar') === 'connected';
        const returnedWithError = returnedParameters.get('calendar') === 'error';
        if (returnedFromGoogle) {
          setMessage('Google Calendar quedó conectado.');
        }
        if (returnedWithError) {
          setMessage(returnedParameters.get('calendar_message') || `Google rechazó la autorización (${returnedParameters.get('calendar_error') || 'error'}).`);
          setError(true);
        }
        if (returnedFromGoogle || returnedWithError) {
          const url = new URL(window.location.href);
          url.searchParams.delete('calendar');
          url.searchParams.delete('calendar_error');
          url.searchParams.delete('calendar_message');
          history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
        }
        if (result.config.connected) await refresh(false);
      } catch (reason) {
        if (!active) return;
        setMessage(reason instanceof Error ? reason.message : 'No se pudo consultar Google Calendar.');
        setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!config.connected) return;
    const timer = window.setInterval(() => void refresh(false), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [config.connected, refresh]);

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(async () => {
      if (Date.parse(pairing.expiresAt) <= Date.now()) {
        setPairing(null);
        setMessage('La configuración temporal venció. Puedes abrir una nueva cuando quieras.');
        return;
      }
      try {
        const next = await loadStatus();
        if (!pairing.initiallyConfigured && next.configured) {
          setPairing(null);
          setMessage('Credenciales recibidas desde el Mac. Ya puedes conectar Google.');
          setError(false);
        }
      } catch { /* The regular status view reports service errors. */ }
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [pairing, loadStatus]);

  async function save(clientId: string, clientSecret: string) {
    setBusy(true); setMessage(''); setError(false);
    try {
      const result = await api('config', { clientId, clientSecret });
      setConfig(result.config); setMessage(result.message); return true;
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudieron guardar las credenciales.'); setError(true); return false;
    } finally { setBusy(false); }
  }

  async function connect() {
    setBusy(true); setMessage('Preparando la autorización…'); setError(false);
    try {
      const result = await api('auth/start', {});
      window.location.assign(result.authUrl);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo iniciar la autorización.'); setError(true); setBusy(false);
    }
  }

  async function startPairing() {
    setBusy(true); setMessage('Abriendo la configuración para el Mac…'); setError(false);
    try {
      const result = await api('pair/start', {});
      setPairing({ code: result.code, addresses: result.addresses, expiresAt: result.expiresAt, initiallyConfigured: config.configured });
      setMessage('La configuración temporal estará disponible durante 10 minutos.');
      return true;
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo abrir la configuración para el Mac.'); setError(true); return false;
    } finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setError(false);
    try {
      const result = await api('disconnect', {});
      setConfig(result.config); setEvents([]); setSource('none'); setSyncedAt(''); setMessage(result.message);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No se pudo desconectar la cuenta.'); setError(true);
    } finally { setBusy(false); }
  }

  return { config, events, source, syncedAt, loading, busy, message, error, pairing, save, connect, disconnect, refresh, startPairing };
}

export type GoogleCalendarController = ReturnType<typeof useGoogleCalendar>;

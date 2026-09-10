import { useCallback, useEffect, useState } from 'react';
import { createRequestId, timeoutSignal } from './browserCompat';

export interface ReminderList { id: string; name: string }
export interface ReminderTask { id: string; title: string; notes: string; listId: string; listName: string; dueAt: string; priority: number }

const STORAGE_KEY = 'rasp.reminders.v1';

function savedSelection() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 30) : [];
  } catch { return []; }
}

async function api(path: string, body?: object) {
  const response = await fetch(`/api/reminders/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json', 'X-Rasp-Request': 'reminders' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: timeoutSignal(40_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'No se pudo consultar Recordatorios.');
  return result;
}

export function useReminders(enabled: boolean) {
  const [lists, setLists] = useState<ReminderList[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>(savedSelection);
  const [tasks, setTasks] = useState<ReminderTask[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [busyTask, setBusyTask] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [storageAvailable, setStorageAvailable] = useState(true);

  const refreshLists = useCallback(async () => {
    if (!enabled) return [];
    setLoading(true); setError('');
    try {
      const result = await api('lists');
      const next = result.lists as ReminderList[];
      setLists(next);
      setSelectedListIds(previous => previous.filter(id => next.some(list => list.id === id)));
      setMessage(next.length ? 'Listas disponibles en tu Mac.' : 'No hay listas en Recordatorios.');
      return next;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo conectar con Recordatorios.');
      return [];
    } finally { setLoading(false); }
  }, [enabled]);

  const refresh = useCallback(async () => {
    if (!enabled || selectedListIds.length === 0) { setTasks([]); return []; }
    setLoading(true); setError('');
    try {
      const result = await api('tasks', { listIds: selectedListIds });
      setTasks(result.tasks);
      setMessage('Pendientes sincronizados con tu Mac.');
      return result.tasks as ReminderTask[];
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron sincronizar los pendientes.');
      return [];
    } finally { setLoading(false); }
  }, [enabled, selectedListIds]);

  useEffect(() => { if (enabled) void refreshLists(); }, [enabled, refreshLists]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedListIds)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
    if (enabled) void refresh();
  }, [enabled, refresh, selectedListIds]);
  useEffect(() => {
    if (!enabled || selectedListIds.length === 0) return;
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5 * 60_000);
    function visible() { if (!document.hidden) void refresh(); }
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [enabled, refresh, selectedListIds.length]);

  function toggleList(id: string) {
    setSelectedListIds(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id].slice(0, 30));
  }

  async function complete(taskId: string) {
    if (busyTask) return false;
    setBusyTask(taskId); setError('');
    try {
      const result = await api('complete', { taskId, requestId: createRequestId() });
      setTasks(previous => previous.filter(task => task.id !== taskId));
      setMessage(result.message);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo completar el pendiente.');
      return false;
    } finally { setBusyTask(''); }
  }

  return { lists, selectedListIds, tasks, loading, busyTask, message, error, storageAvailable, refreshLists, refresh, toggleList, complete };
}

export type RemindersController = ReturnType<typeof useReminders>;

function safeId(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 500 && !/[\u0000-\u001f]/.test(value);
}

export function validReminderListsRequest(value) {
  return Array.isArray(value?.listIds) && value.listIds.length <= 30 && value.listIds.every(safeId) && new Set(value.listIds).size === value.listIds.length;
}

export function validReminderCompleteRequest(value) {
  return safeId(value?.taskId) && typeof value?.requestId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value.requestId);
}

function cleanText(value, limit) {
  return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function cleanId(value) {
  const id = String(value || '');
  return safeId(id) ? id : '';
}

export async function runReminders(run, helper, action, payload = {}) {
  let output;
  try {
    output = await run(helper, [action, JSON.stringify(payload)], { timeout: 35_000, maxBuffer: 1024 * 1024 });
  } catch (error) {
    const detail = `${error?.stderr || ''} ${error?.message || ''}`;
    if (/not authorized|not permitted|automation|1743/i.test(detail)) throw new Error('Autoriza el acceso a Recordatorios en el Mac.');
    throw new Error('El Mac no pudo consultar Recordatorios.');
  }
  let result;
  try { result = JSON.parse(output.stdout); }
  catch { throw new Error('Recordatorios devolvió una respuesta no válida.'); }
  if (action === 'lists') {
    if (!Array.isArray(result)) throw new Error('No se pudieron leer las listas de Recordatorios.');
    return result.slice(0, 50).map(item => ({ id: cleanId(item.id), name: cleanText(item.name, 100) || 'Lista' })).filter(item => item.id);
  }
  if (action === 'tasks') {
    if (!Array.isArray(result)) throw new Error('No se pudieron leer los pendientes.');
    return result.slice(0, 500).map(item => ({
      id: cleanId(item.id), title: cleanText(item.title, 240) || 'Recordatorio', notes: cleanText(item.notes, 500),
      listId: cleanId(item.listId), listName: cleanText(item.listName, 100) || 'Lista',
      dueAt: Number.isFinite(Date.parse(item.dueAt)) ? new Date(item.dueAt).toISOString() : '',
      priority: Number.isFinite(Number(item.priority)) ? Math.max(0, Math.min(9, Number(item.priority))) : 0,
    })).filter(item => item.id && item.listId);
  }
  if (action === 'complete') return { completed: Boolean(result?.completed) };
  throw new Error('Acción de Recordatorios no válida.');
}

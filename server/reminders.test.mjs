import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runReminders, validReminderCompleteRequest, validReminderListsRequest } from './reminders.mjs';

describe('Reminders bridge', () => {
  it('accepts only bounded unique list identifiers', () => {
    assert.equal(validReminderListsRequest({ listIds: ['work', 'personal'] }), true);
    assert.equal(validReminderListsRequest({ listIds: [] }), true);
    assert.equal(validReminderListsRequest({ listIds: ['work', 'work'] }), false);
    assert.equal(validReminderListsRequest({ listIds: ['bad\nvalue'] }), false);
    assert.equal(validReminderListsRequest({ listIds: Array.from({ length: 31 }, (_, index) => String(index)) }), false);
  });

  it('requires a task id and an idempotency identifier for completion', () => {
    assert.equal(validReminderCompleteRequest({ taskId: 'task-1', requestId: 'complete-1234567890123456' }), true);
    assert.equal(validReminderCompleteRequest({ taskId: '', requestId: 'complete-1234567890123456' }), false);
    assert.equal(validReminderCompleteRequest({ taskId: 'task-1', requestId: 'short' }), false);
  });

  it('sanitizes lists and task data returned by the Mac helper', async () => {
    const run = async (_helper, [action]) => action === 'lists'
      ? { stdout: JSON.stringify([{ id: 'list-1', name: ' Trabajo\n' }, { id: '', name: 'ignored' }]) }
      : { stdout: JSON.stringify([{ id: 'task-1', title: ' Llamar\nmañana ', notes: 'nota', listId: 'list-1', listName: 'Trabajo', dueAt: '2026-09-11T15:00:00Z', priority: 20 }]) };
    assert.deepEqual(await runReminders(run, '/helper', 'lists'), [{ id: 'list-1', name: 'Trabajo' }]);
    const tasks = await runReminders(run, '/helper', 'tasks', { listIds: ['list-1'] });
    assert.equal(tasks[0].title, 'Llamar mañana');
    assert.equal(tasks[0].priority, 9);
    assert.equal(tasks[0].dueAt, '2026-09-11T15:00:00.000Z');
  });
});

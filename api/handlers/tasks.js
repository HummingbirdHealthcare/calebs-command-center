const { getContainer, requireCaleb, genId, jsonRes } = require('./shared');

const TYPE = 'task';
const STATUSES = ['not-started', 'in-progress', 'done', 'blocked'];

async function listTasks(context, req) {
  if (!requireCaleb(context, req)) return;
  try {
    const container = getContainer();
    const { resources } = await container.items
      .query({ query: 'SELECT * FROM c WHERE c.type = @type', parameters: [{ name: '@type', value: TYPE }] })
      .fetchAll();
    jsonRes(context, 200, resources);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

async function createTask(context, req) {
  if (!requireCaleb(context, req)) return;
  try {
    const body = req.body || {};
    const title = (body.title || '').trim();
    if (!title) return jsonRes(context, 400, { error: 'title is required' });
    const now = new Date().toISOString();
    const doc = {
      id: genId(),
      type: TYPE,
      parentId: body.parentId || null,
      title,
      status: 'not-started',
      notes: [],
      order: Date.now(),
      createdAt: now,
      updatedAt: now,
    };
    const { resource } = await getContainer().items.create(doc);
    jsonRes(context, 201, resource);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

async function updateTask(context, req, id) {
  if (!requireCaleb(context, req)) return;
  try {
    const container = getContainer();
    const { resource: task } = await container.item(id, id).read();
    if (!task) return jsonRes(context, 404, { error: 'Not found' });
    const body = req.body || {};
    if (body.op === 'update-title') {
      const title = (body.title || '').trim();
      if (!title) return jsonRes(context, 400, { error: 'title is required' });
      task.title = title;
    } else if (body.op === 'update-status') {
      if (!STATUSES.includes(body.status)) return jsonRes(context, 400, { error: 'invalid status' });
      task.status = body.status;
    } else if (body.op === 'add-note') {
      const text = (body.text || '').trim();
      if (!text) return jsonRes(context, 400, { error: 'text is required' });
      task.notes = task.notes || [];
      task.notes.push({ id: genId(), at: new Date().toISOString(), text });
    } else if (body.op === 'delete-note') {
      task.notes = (task.notes || []).filter((n) => n.id !== body.noteId);
    } else {
      return jsonRes(context, 400, { error: 'Unknown op' });
    }
    task.updatedAt = new Date().toISOString();
    const { resource } = await container.item(id, id).replace(task);
    jsonRes(context, 200, resource);
  } catch (e) {
    if (e.code === 404) return jsonRes(context, 404, { error: 'Not found' });
    jsonRes(context, 500, { error: e.message });
  }
}

// Deleting a task cascades to every descendant — leaving orphaned sub-tasks
// behind (a parent gone, children still there) would just be confusing.
async function deleteTask(context, req, id) {
  if (!requireCaleb(context, req)) return;
  try {
    const container = getContainer();
    const { resources: all } = await container.items
      .query({
        query: 'SELECT c.id, c.parentId FROM c WHERE c.type = @type',
        parameters: [{ name: '@type', value: TYPE }],
      })
      .fetchAll();
    const toDelete = new Set([id]);
    let added = true;
    while (added) {
      added = false;
      for (const t of all) {
        if (t.parentId && toDelete.has(t.parentId) && !toDelete.has(t.id)) {
          toDelete.add(t.id);
          added = true;
        }
      }
    }
    await Promise.all([...toDelete].map((taskId) => container.item(taskId, taskId).delete().catch(() => {})));
    jsonRes(context, 204, null);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

module.exports = { listTasks, createTask, updateTask, deleteTask };

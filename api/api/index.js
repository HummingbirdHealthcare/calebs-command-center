const tasks = require('../handlers/tasks');
const documents = require('../handlers/documents');
const categories = require('../handlers/categories');
const { jsonRes } = require('../handlers/shared');

// Single HTTP-trigger router, dispatched by a `resource` query param plus
// HTTP method (and `op`/`id` where a specific item is targeted) — mirrors
// FeatherEdge's single-Function-many-resources pattern rather than standing
// up a Function per endpoint.
module.exports = async function (context, req) {
  const resource = req.query.resource;
  const id = req.query.id;
  const method = (req.method || 'GET').toUpperCase();

  try {
    if (resource === 'tasks') {
      if (method === 'GET') return await tasks.listTasks(context, req);
      if (method === 'POST') return await tasks.createTask(context, req);
      if (method === 'PATCH') return await tasks.updateTask(context, req, id);
      if (method === 'DELETE') return await tasks.deleteTask(context, req, id);
    } else if (resource === 'categories') {
      if (method === 'GET') return await categories.listCategories(context, req);
      if (method === 'POST') return await categories.createCategory(context, req);
      if (method === 'PATCH') return await categories.updateCategory(context, req, id);
      if (method === 'DELETE') return await categories.deleteCategory(context, req, id);
    } else if (resource === 'folders') {
      if (method === 'GET') return await documents.listFolders(context, req);
      if (method === 'POST') return await documents.createFolder(context, req);
      if (method === 'PATCH') return await documents.updateFolder(context, req, id);
      if (method === 'DELETE') return await documents.deleteFolder(context, req, id);
    } else if (resource === 'documents') {
      if (method === 'GET' && req.query.op === 'download') return await documents.getDownloadUrl(context, req, id);
      if (method === 'GET') return await documents.listDocuments(context, req);
      if (method === 'POST') return await documents.uploadDocument(context, req);
      if (method === 'PATCH') return await documents.updateDocument(context, req, id);
      if (method === 'DELETE') return await documents.deleteDocument(context, req, id);
    }
    jsonRes(context, 404, { error: 'Unknown resource/method' });
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
};

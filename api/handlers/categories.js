const { getContainer, getBlobContainerClient, requireCaleb, genId, jsonRes } = require('./shared');

const TYPE = 'category';

async function listCategories(context, req) {
  if (!requireCaleb(context, req)) return;
  try {
    const { resources } = await getContainer()
      .items.query({ query: 'SELECT * FROM c WHERE c.type = @type', parameters: [{ name: '@type', value: TYPE }] })
      .fetchAll();
    jsonRes(context, 200, resources);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

async function createCategory(context, req) {
  if (!requireCaleb(context, req)) return;
  try {
    const body = req.body || {};
    const name = (body.name || '').trim();
    if (!name) return jsonRes(context, 400, { error: 'name is required' });
    const doc = { id: genId(), type: TYPE, name, order: Date.now(), createdAt: new Date().toISOString() };
    const { resource } = await getContainer().items.create(doc);
    jsonRes(context, 201, resource);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

async function updateCategory(context, req, id) {
  if (!requireCaleb(context, req)) return;
  try {
    const container = getContainer();
    const { resource: category } = await container.item(id, id).read();
    if (!category) return jsonRes(context, 404, { error: 'Not found' });
    const body = req.body || {};
    if (body.op !== 'update') return jsonRes(context, 400, { error: 'Unknown op' });
    const name = (body.name || '').trim();
    if (!name) return jsonRes(context, 400, { error: 'name is required' });
    category.name = name;
    const { resource } = await container.item(id, id).replace(category);
    jsonRes(context, 200, resource);
  } catch (e) {
    if (e.code === 404) return jsonRes(context, 404, { error: 'Not found' });
    jsonRes(context, 500, { error: e.message });
  }
}

// Deleting a category cascades to every folder tree rooted in it (and every
// document those folders contain) — same cascade shape as deleteFolder, just
// starting from "all root folders tagged with this categoryId" instead of a
// single folder id.
async function deleteCategory(context, req, id) {
  if (!requireCaleb(context, req)) return;
  try {
    const container = getContainer();
    const { resources: allFolders } = await container.items
      .query({
        query: 'SELECT c.id, c.parentId, c.categoryId FROM c WHERE c.type = @type',
        parameters: [{ name: '@type', value: 'folder' }],
      })
      .fetchAll();
    const toDelete = new Set(allFolders.filter((f) => f.categoryId === id).map((f) => f.id));
    let added = true;
    while (added) {
      added = false;
      for (const f of allFolders) {
        if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
          toDelete.add(f.id);
          added = true;
        }
      }
    }
    const { resources: docs } = await container.items
      .query({ query: 'SELECT * FROM c WHERE c.type = @type', parameters: [{ name: '@type', value: 'document' }] })
      .fetchAll();
    const docsToDelete = docs.filter((d) => d.folderId && toDelete.has(d.folderId));
    const blobContainer = getBlobContainerClient();
    await Promise.all(docsToDelete.map((d) => blobContainer.deleteBlob(d.blobPath).catch(() => {})));
    await Promise.all(docsToDelete.map((d) => container.item(d.id, d.id).delete().catch(() => {})));
    await Promise.all([...toDelete].map((folderId) => container.item(folderId, folderId).delete().catch(() => {})));
    await container.item(id, id).delete().catch(() => {});
    jsonRes(context, 204, null);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };

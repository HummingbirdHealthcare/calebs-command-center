const { BlobSASPermissions, StorageSharedKeyCredential, generateBlobSASQueryParameters } = require('@azure/storage-blob');
const { getContainer, getBlobContainerClient, getStorageCredentials, requireCaleb, genId, jsonRes } = require('./shared');

const FOLDER_TYPE = 'folder';
const DOCUMENT_TYPE = 'document';

async function listFolders(context, req) {
  if (!requireCaleb(context, req)) return;
  try {
    const { resources } = await getContainer()
      .items.query({ query: 'SELECT * FROM c WHERE c.type = @type', parameters: [{ name: '@type', value: FOLDER_TYPE }] })
      .fetchAll();
    jsonRes(context, 200, resources);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

async function createFolder(context, req) {
  if (!requireCaleb(context, req)) return;
  try {
    const body = req.body || {};
    const name = (body.name || '').trim();
    if (!name) return jsonRes(context, 400, { error: 'name is required' });
    const doc = {
      id: genId(),
      type: FOLDER_TYPE,
      parentId: body.parentId || null,
      name,
      order: Date.now(),
      createdAt: new Date().toISOString(),
    };
    const { resource } = await getContainer().items.create(doc);
    jsonRes(context, 201, resource);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

async function updateFolder(context, req, id) {
  if (!requireCaleb(context, req)) return;
  try {
    const container = getContainer();
    const { resource: folder } = await container.item(id, id).read();
    if (!folder) return jsonRes(context, 404, { error: 'Not found' });
    const body = req.body || {};
    if (body.op !== 'update') return jsonRes(context, 400, { error: 'Unknown op' });
    if (body.name !== undefined) {
      const name = (body.name || '').trim();
      if (!name) return jsonRes(context, 400, { error: 'name is required' });
      folder.name = name;
    }
    if (body.summary !== undefined) {
      folder.summary = (body.summary || '').trim();
    }
    const { resource } = await container.item(id, id).replace(folder);
    jsonRes(context, 200, resource);
  } catch (e) {
    if (e.code === 404) return jsonRes(context, 404, { error: 'Not found' });
    jsonRes(context, 500, { error: e.message });
  }
}

// Deleting a folder cascades to every descendant folder AND every document
// filed anywhere in that subtree — both the Cosmos metadata and the blob
// bytes get removed, not just the folder record.
async function deleteFolder(context, req, id) {
  if (!requireCaleb(context, req)) return;
  try {
    const container = getContainer();
    const { resources: allFolders } = await container.items
      .query({
        query: 'SELECT c.id, c.parentId FROM c WHERE c.type = @type',
        parameters: [{ name: '@type', value: FOLDER_TYPE }],
      })
      .fetchAll();
    const toDelete = new Set([id]);
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
      .query({ query: 'SELECT * FROM c WHERE c.type = @type', parameters: [{ name: '@type', value: DOCUMENT_TYPE }] })
      .fetchAll();
    const docsToDelete = docs.filter((d) => d.folderId && toDelete.has(d.folderId));
    const blobContainer = getBlobContainerClient();
    await Promise.all(docsToDelete.map((d) => blobContainer.deleteBlob(d.blobPath).catch(() => {})));
    await Promise.all(docsToDelete.map((d) => container.item(d.id, d.id).delete().catch(() => {})));
    await Promise.all([...toDelete].map((folderId) => container.item(folderId, folderId).delete().catch(() => {})));
    jsonRes(context, 204, null);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

async function listDocuments(context, req) {
  if (!requireCaleb(context, req)) return;
  try {
    const folderIdParam = req.query.folderId;
    const folderId = !folderIdParam || folderIdParam === 'root' ? null : folderIdParam;
    const { resources } = await getContainer()
      .items.query({
        query: 'SELECT * FROM c WHERE c.type = @type AND c.folderId = @folderId',
        parameters: [
          { name: '@type', value: DOCUMENT_TYPE },
          { name: '@folderId', value: folderId },
        ],
      })
      .fetchAll();
    jsonRes(context, 200, resources);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

// Uploads arrive as a base64 string in a JSON body, not multipart — avoids
// needing a multipart-parsing dependency for what's a personal-scale tool
// (occasional PDFs/docs, not bulk file transfer).
async function uploadDocument(context, req) {
  if (!requireCaleb(context, req)) return;
  try {
    const body = req.body || {};
    const name = (body.name || '').trim();
    if (!name || !body.base64) return jsonRes(context, 400, { error: 'name and base64 are required' });
    const buffer = Buffer.from(body.base64, 'base64');
    const id = genId();
    const blobPath = `${id}/${name}`;
    const blockBlobClient = getBlobContainerClient().getBlockBlobClient(blobPath);
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: body.mimeType || 'application/octet-stream' },
    });
    const doc = {
      id,
      type: DOCUMENT_TYPE,
      folderId: body.folderId || null,
      name,
      blobPath,
      mimeType: body.mimeType || 'application/octet-stream',
      sizeBytes: buffer.length,
      notes: [],
      uploadedAt: new Date().toISOString(),
    };
    const { resource } = await getContainer().items.create(doc);
    jsonRes(context, 201, resource);
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

async function updateDocument(context, req, id) {
  if (!requireCaleb(context, req)) return;
  try {
    const container = getContainer();
    const { resource: doc } = await container.item(id, id).read();
    if (!doc) return jsonRes(context, 404, { error: 'Not found' });
    const body = req.body || {};
    if (body.op === 'add-note') {
      const text = (body.text || '').trim();
      if (!text) return jsonRes(context, 400, { error: 'text is required' });
      doc.notes = doc.notes || [];
      doc.notes.push({ id: genId(), at: new Date().toISOString(), text });
    } else if (body.op === 'delete-note') {
      doc.notes = (doc.notes || []).filter((n) => n.id !== body.noteId);
    } else {
      return jsonRes(context, 400, { error: 'Unknown op' });
    }
    const { resource } = await container.item(id, id).replace(doc);
    jsonRes(context, 200, resource);
  } catch (e) {
    if (e.code === 404) return jsonRes(context, 404, { error: 'Not found' });
    jsonRes(context, 500, { error: e.message });
  }
}

async function deleteDocument(context, req, id) {
  if (!requireCaleb(context, req)) return;
  try {
    const container = getContainer();
    const { resource: doc } = await container.item(id, id).read();
    if (doc) {
      await getBlobContainerClient().deleteBlob(doc.blobPath).catch(() => {});
      await container.item(id, id).delete();
    }
    jsonRes(context, 204, null);
  } catch (e) {
    if (e.code === 404) return jsonRes(context, 204, null);
    jsonRes(context, 500, { error: e.message });
  }
}

// Never proxies the actual bytes — issues a short-lived (10 min), read-only
// SAS URL and lets the browser fetch straight from Blob Storage.
async function getDownloadUrl(context, req, id) {
  if (!requireCaleb(context, req)) return;
  try {
    const container = getContainer();
    const { resource: doc } = await container.item(id, id).read();
    if (!doc) return jsonRes(context, 404, { error: 'Not found' });
    const blobContainer = getBlobContainerClient();
    const { accountName, accountKey } = getStorageCredentials();
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const expiresOn = new Date(Date.now() + 10 * 60 * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: blobContainer.containerName,
        blobName: doc.blobPath,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      credential,
    ).toString();
    const blockBlobClient = blobContainer.getBlockBlobClient(doc.blobPath);
    jsonRes(context, 200, { url: `${blockBlobClient.url}?${sas}` });
  } catch (e) {
    jsonRes(context, 500, { error: e.message });
  }
}

module.exports = {
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  listDocuments,
  uploadDocument,
  updateDocument,
  deleteDocument,
  getDownloadUrl,
};

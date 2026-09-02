const { CosmosClient } = require('@azure/cosmos');
const { BlobServiceClient } = require('@azure/storage-blob');
const crypto = require('crypto');

let cosmosClient, container;

/** Single Cosmos container, partition key /id, documents distinguished by a
 *  `type` field ('task' | 'folder' | 'document') — same flat-document
 *  convention as FeatherEdge's Cosmos usage, just for this app's own account. */
function getContainer() {
  if (!container) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    const dbName = process.env.COSMOS_DATABASE;
    const containerName = process.env.COSMOS_CONTAINER;
    if (!endpoint || !key || !dbName || !containerName) {
      throw new Error('Cosmos DB is not configured (COSMOS_ENDPOINT/COSMOS_KEY/COSMOS_DATABASE/COSMOS_CONTAINER)');
    }
    if (!cosmosClient) cosmosClient = new CosmosClient({ endpoint, key });
    container = cosmosClient.database(dbName).container(containerName);
  }
  return container;
}

let blobServiceClient, blobContainerClient;

function getBlobContainerClient() {
  if (!blobContainerClient) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.BLOB_CONTAINER;
    if (!connectionString || !containerName) {
      throw new Error('Blob storage is not configured (AZURE_STORAGE_CONNECTION_STRING/BLOB_CONTAINER)');
    }
    if (!blobServiceClient) blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    blobContainerClient = blobServiceClient.getContainerClient(containerName);
  }
  return blobContainerClient;
}

/** Pulled out of the connection string rather than a second app setting —
 *  SAS generation needs the account name/key as separate values, and there's
 *  no reason to duplicate the same secret under two different setting names. */
function getStorageCredentials() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
  const parts = Object.fromEntries(
    connectionString
      .split(';')
      .filter(Boolean)
      .map((kv) => {
        const idx = kv.indexOf('=');
        return [kv.slice(0, idx), kv.slice(idx + 1)];
      }),
  );
  if (!parts.AccountName || !parts.AccountKey) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is missing AccountName/AccountKey');
  }
  return { accountName: parts.AccountName, accountKey: parts.AccountKey };
}

// Azure Static Web Apps sets this header (base64-encoded JSON) only for
// requests it has already verified an AAD sign-in for. Its PRESENCE proves
// "some Hummingbird user is signed in" - it does not by itself mean "this is
// Caleb". That's what requireCaleb below is for.
function getPrincipal(req) {
  const header = req.headers['x-ms-client-principal'];
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

function callerEmail(req) {
  const principal = getPrincipal(req);
  if (!principal) return null;
  const emailClaim = (principal.claims || []).find((c) => (c.typ || '').toLowerCase().endsWith('/emailaddress'));
  const email = (emailClaim && emailClaim.val) || principal.userDetails || '';
  return email ? email.toLowerCase() : null;
}

/** The actual access boundary for the whole app. Call this first in every
 *  handler; if it returns false, the handler must `return` immediately -
 *  a 403 response has already been written to `context.res`. */
function requireCaleb(context, req) {
  const allowed = (process.env.ALLOWED_USER_EMAIL || '').toLowerCase();
  const email = callerEmail(req);
  if (!allowed || !email || email !== allowed) {
    jsonRes(context, 403, { error: 'Forbidden' });
    return false;
  }
  return true;
}

function genId() {
  return crypto.randomUUID();
}

function jsonRes(context, status, body) {
  if (body === null || body === undefined) {
    context.res = { status };
    return;
  }
  context.res = { status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

module.exports = {
  getContainer,
  getBlobContainerClient,
  getStorageCredentials,
  requireCaleb,
  callerEmail,
  genId,
  jsonRes,
};

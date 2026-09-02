import type { Document, Folder, Task, TaskStatus } from './types'

const BASE = '/api/api'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Reads a File into a base64 string — uploads go over JSON, not multipart,
 *  so the API needs no multipart-parsing dependency. Fine at personal
 *  document scale (a few MB); not meant for huge files. */
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// Tasks
export const listTasks = () => request<Task[]>('?resource=tasks')
export const createTask = (parentId: string | null, title: string) =>
  request<Task>('?resource=tasks', { method: 'POST', body: JSON.stringify({ parentId, title }) })
export const updateTaskTitle = (id: string, title: string) =>
  request<Task>(`?resource=tasks&id=${id}`, { method: 'PATCH', body: JSON.stringify({ op: 'update-title', title }) })
export const updateTaskStatus = (id: string, status: TaskStatus) =>
  request<Task>(`?resource=tasks&id=${id}`, { method: 'PATCH', body: JSON.stringify({ op: 'update-status', status }) })
export const addTaskNote = (id: string, text: string) =>
  request<Task>(`?resource=tasks&id=${id}`, { method: 'PATCH', body: JSON.stringify({ op: 'add-note', text }) })
export const deleteTaskNote = (id: string, noteId: string) =>
  request<Task>(`?resource=tasks&id=${id}`, { method: 'PATCH', body: JSON.stringify({ op: 'delete-note', noteId }) })
export const deleteTask = (id: string) => request<void>(`?resource=tasks&id=${id}`, { method: 'DELETE' })

// Folders
export const listFolders = () => request<Folder[]>('?resource=folders')
export const createFolder = (parentId: string | null, name: string) =>
  request<Folder>('?resource=folders', { method: 'POST', body: JSON.stringify({ parentId, name }) })
export const updateFolder = (id: string, changes: { name?: string; summary?: string; icon?: string }) =>
  request<Folder>(`?resource=folders&id=${id}`, { method: 'PATCH', body: JSON.stringify({ op: 'update', ...changes }) })
export const deleteFolder = (id: string) => request<void>(`?resource=folders&id=${id}`, { method: 'DELETE' })

// Documents
export const listDocuments = (folderId: string | null) =>
  request<Document[]>(`?resource=documents&folderId=${folderId ?? 'root'}`)
export const uploadDocument = async (folderId: string | null, file: File) => {
  const base64 = await fileToBase64(file)
  return request<Document>('?resource=documents', {
    method: 'POST',
    body: JSON.stringify({ folderId, name: file.name, mimeType: file.type || 'application/octet-stream', base64 }),
  })
}
export const getDownloadUrl = (id: string) => request<{ url: string }>(`?resource=documents&id=${id}&op=download`)
export const addDocumentNote = (id: string, text: string) =>
  request<Document>(`?resource=documents&id=${id}`, { method: 'PATCH', body: JSON.stringify({ op: 'add-note', text }) })
export const deleteDocumentNote = (id: string, noteId: string) =>
  request<Document>(`?resource=documents&id=${id}`, { method: 'PATCH', body: JSON.stringify({ op: 'delete-note', noteId }) })
export const deleteDocument = (id: string) => request<void>(`?resource=documents&id=${id}`, { method: 'DELETE' })

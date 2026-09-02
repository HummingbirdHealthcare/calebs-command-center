export type TaskStatus = 'not-started' | 'in-progress' | 'done' | 'blocked'

export interface Note {
  id: string
  at: string
  text: string
}

export interface Task {
  id: string
  type: 'task'
  parentId: string | null
  title: string
  status: TaskStatus
  notes: Note[]
  order: number
  createdAt: string
  updatedAt: string
}

export interface Folder {
  id: string
  type: 'folder'
  parentId: string | null
  name: string
  summary?: string
  order: number
  createdAt: string
}

export interface Document {
  id: string
  type: 'document'
  folderId: string | null
  name: string
  blobPath: string
  mimeType: string
  sizeBytes: number
  notes: Note[]
  uploadedAt: string
}

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'
import type { Folder } from '../lib/types'
import NotesThread from '../components/NotesThread'

function folderChildren(folders: Folder[], parentId: string | null): Folder[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order)
}

function FolderNode({
  folder,
  folders,
  depth,
  selectedId,
  onSelect,
  onAddChild,
  onDelete,
}: {
  folder: Folder
  folders: Folder[]
  depth: number
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (parentId: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const kids = folderChildren(folders, folder.id)

  const addChild = async () => {
    const n = name.trim()
    if (!n) return
    await onAddChild(folder.id, n)
    setName('')
    setAdding(false)
  }

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className={`folder-row ${selectedId === folder.id ? 'folder-row-selected' : ''}`}>
        <span className="folder-name" onClick={() => onSelect(folder.id)}>
          📁 {folder.name}
        </span>
        <button type="button" className="folder-action" onClick={() => setAdding((v) => !v)} title="New sub-folder">
          +
        </button>
        <button
          type="button"
          className="folder-action folder-action-danger"
          title="Delete folder"
          onClick={() => {
            if (confirm(`Delete "${folder.name}" and everything in it?`)) void onDelete(folder.id)
          }}
        >
          ✕
        </button>
      </div>
      {adding && (
        <div className="folder-add" style={{ marginLeft: 16 }}>
          <input
            value={name}
            autoFocus
            placeholder="Folder name…"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addChild()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <button type="button" onClick={() => void addChild()}>
            Add
          </button>
        </div>
      )}
      {kids.map((k) => (
        <FolderNode
          key={k.id}
          folder={k}
          folders={folders}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

export default function DocumentsPage() {
  const qc = useQueryClient()
  const { data: folders, isPending: foldersPending } = useQuery({ queryKey: ['folders'], queryFn: api.listFolders })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rootFolderName, setRootFolderName] = useState('')
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const { data: documents, isPending: docsPending } = useQuery({
    queryKey: ['documents', selectedId],
    queryFn: () => api.listDocuments(selectedId),
  })

  const invalidateFolders = () => qc.invalidateQueries({ queryKey: ['folders'] })
  const invalidateDocs = () => qc.invalidateQueries({ queryKey: ['documents'] })

  const addRootFolder = async () => {
    const n = rootFolderName.trim()
    if (!n) return
    await api.createFolder(null, n)
    setRootFolderName('')
    await invalidateFolders()
  }

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      await api.uploadDocument(selectedId, file)
    }
    await invalidateDocs()
  }

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current += 1
    setIsDragging(true)
  }
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) setIsDragging(false)
  }
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    await onUpload(e.dataTransfer.files)
  }

  const download = async (id: string) => {
    const { url } = await api.getDownloadUrl(id)
    window.open(url, '_blank')
  }

  const roots = folderChildren(folders ?? [], null)

  return (
    <div className="page page-documents">
      <h1>Documents</h1>
      <div className="documents-layout">
        <div className="folder-panel">
          <div className="add-root">
            <input
              value={rootFolderName}
              placeholder="New top-level folder…"
              onChange={(e) => setRootFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addRootFolder()
              }}
            />
            <button type="button" onClick={() => void addRootFolder()}>
              Add
            </button>
          </div>
          {/* Documents with no folder (folderId: null) — the catch-all bucket, not "every document everywhere". */}
          <div className={`folder-row ${selectedId === null ? 'folder-row-selected' : ''}`} onClick={() => setSelectedId(null)}>
            <span className="folder-name">📁 Unfiled</span>
          </div>
          {foldersPending ? (
            <div className="state">Loading…</div>
          ) : (
            roots.map((f) => (
              <FolderNode
                key={f.id}
                folder={f}
                folders={folders ?? []}
                depth={0}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAddChild={async (parentId, name) => {
                  await api.createFolder(parentId, name)
                  await invalidateFolders()
                }}
                onDelete={async (id) => {
                  await api.deleteFolder(id)
                  await invalidateFolders()
                  await invalidateDocs()
                }}
              />
            ))
          )}
        </div>

        <div
          className={`document-panel ${isDragging ? 'document-panel-dragging' : ''}`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={(e) => void onDrop(e)}
        >
          <div className="upload-row">
            <input type="file" multiple onChange={(e) => void onUpload(e.target.files)} />
            <span className="upload-hint">or drag and drop files here</span>
          </div>
          {isDragging && <div className="drop-overlay">Drop to upload</div>}
          {docsPending ? (
            <div className="state">Loading…</div>
          ) : (documents ?? []).length === 0 ? (
            <div className="state">No documents here yet.</div>
          ) : (
            <div className="document-list">
              {(documents ?? []).map((doc) => (
                <div key={doc.id} className="document-row">
                  <div className="document-main">
                    <span className="document-name">📄 {doc.name}</span>
                    <span className="document-meta">
                      {(doc.sizeBytes / 1024).toFixed(1)} KB · {new Date(doc.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="document-actions">
                    <button type="button" onClick={() => void download(doc.id)}>
                      Download
                    </button>
                    <button type="button" onClick={() => setOpenNotesFor(openNotesFor === doc.id ? null : doc.id)}>
                      📝{doc.notes.length > 0 ? ` ${doc.notes.length}` : ''}
                    </button>
                    <button
                      type="button"
                      className="document-action-danger"
                      onClick={() => {
                        if (confirm(`Delete "${doc.name}"?`)) void api.deleteDocument(doc.id).then(invalidateDocs)
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  {openNotesFor === doc.id && (
                    <NotesThread
                      notes={doc.notes}
                      onAdd={async (text) => {
                        await api.addDocumentNote(doc.id, text)
                        await invalidateDocs()
                      }}
                      onDelete={async (noteId) => {
                        await api.deleteDocumentNote(doc.id, noteId)
                        await invalidateDocs()
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

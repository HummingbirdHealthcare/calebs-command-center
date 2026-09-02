import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'
import type { Document, Folder } from '../lib/types'
import NotesThread from '../components/NotesThread'

function folderChildren(folders: Folder[], parentId: string | null): Folder[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order)
}

interface DroppedFile {
  dirPath: string
  file: File
}

function readDirectory(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const readBatch = () => {
      // readEntries only returns a batch at a time — must keep calling until it returns empty.
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all)
        } else {
          all.push(...batch)
          readBatch()
        }
      }, reject)
    }
    readBatch()
  })
}

async function walkEntry(entry: FileSystemEntry, dirPath: string, out: DroppedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push({ dirPath, file })
  } else if (entry.isDirectory) {
    const childPath = dirPath ? `${dirPath}/${entry.name}` : entry.name
    const children = await readDirectory((entry as FileSystemDirectoryEntry).createReader())
    for (const child of children) {
      await walkEntry(child, childPath, out)
    }
  }
}

/** Walks a drop's DataTransferItemList via the File and Directory Entries API so dropped
 *  folders keep their structure — falls back to a flat file list on browsers/drops where
 *  entries aren't available (e.g. a plain file drag rather than a folder). */
async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const items = Array.from(dataTransfer.items)
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null)

  if (entries.length === 0) {
    return Array.from(dataTransfer.files).map((file) => ({ dirPath: '', file }))
  }

  const out: DroppedFile[] = []
  for (const entry of entries) {
    await walkEntry(entry, '', out)
  }
  return out
}

const DEFAULT_FOLDER_ICON = '📁'
const FOLDER_ICONS = ['📁', '📂', '🗂️', '📦', '⭐', '🏷️', '💰', '🩺', '📊', '🎯', '🚀', '🔒', '📌', '🧾', '🖼️', '🎬']

interface FolderCallbacks {
  onSelect: (id: string) => void
  onAddChild: (parentId: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onUpdate: (id: string, changes: { name?: string; summary?: string; icon?: string }) => Promise<void>
}

/** Folders show their sub-folders AND their own documents inline once expanded, on top of
 *  the existing "select a folder to see its documents in the right-hand panel" flow — the
 *  toggle is purely about local visibility in the tree, separate from selection. */
function FolderNode({
  folder,
  folders,
  documents,
  depth,
  selectedId,
  ...cb
}: {
  folder: Folder
  folders: Folder[]
  documents: Document[]
  depth: number
  selectedId: string | null
} & FolderCallbacks) {
  const [expanded, setExpanded] = useState(true)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(folder.name)
  const [editSummary, setEditSummary] = useState(folder.summary ?? '')
  const [editIcon, setEditIcon] = useState(folder.icon ?? DEFAULT_FOLDER_ICON)
  const kids = folderChildren(folders, folder.id)
  const ownDocuments = documents.filter((d) => d.folderId === folder.id)

  const addChild = async () => {
    const n = name.trim()
    if (!n) return
    await cb.onAddChild(folder.id, n)
    setName('')
    setAdding(false)
  }

  const startEdit = () => {
    setEditName(folder.name)
    setEditSummary(folder.summary ?? '')
    setEditIcon(folder.icon ?? DEFAULT_FOLDER_ICON)
    setEditing(true)
  }

  const saveEdit = async () => {
    const trimmedName = editName.trim()
    if (!trimmedName) return
    await cb.onUpdate(folder.id, { name: trimmedName, summary: editSummary.trim(), icon: editIcon })
    setEditing(false)
  }

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className={`folder-row ${selectedId === folder.id ? 'folder-row-selected' : ''}`}>
        <button
          type="button"
          className="folder-toggle"
          onClick={() => setExpanded((v) => !v)}
          style={{ visibility: kids.length > 0 || ownDocuments.length > 0 ? 'visible' : 'hidden' }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="folder-name" onClick={() => cb.onSelect(folder.id)}>
          {folder.icon ?? DEFAULT_FOLDER_ICON} {folder.name}
        </span>
        <button type="button" className="folder-action" title="Rename / edit summary" onClick={startEdit}>
          ✎
        </button>
        <button type="button" className="folder-action" onClick={() => setAdding((v) => !v)} title="New sub-folder">
          +
        </button>
        <button
          type="button"
          className="folder-action folder-action-danger"
          title="Delete folder"
          onClick={() => {
            if (confirm(`Delete "${folder.name}" and everything in it?`)) void cb.onDelete(folder.id)
          }}
        >
          ✕
        </button>
      </div>
      {!editing && folder.summary && (
        <div className="folder-summary" style={{ marginLeft: 16 }}>
          {folder.summary}
        </div>
      )}
      {editing && (
        <div className="folder-edit" style={{ marginLeft: 16 }}>
          <div className="folder-icon-picker">
            {FOLDER_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                className={`folder-icon-option ${icon === editIcon ? 'folder-icon-option-selected' : ''}`}
                title={icon}
                onClick={() => setEditIcon(icon)}
              >
                {icon}
              </button>
            ))}
          </div>
          <input
            value={editName}
            autoFocus
            placeholder="Folder name"
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false)
            }}
          />
          <textarea
            value={editSummary}
            placeholder="Short summary of what's in this folder…"
            rows={2}
            onChange={(e) => setEditSummary(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false)
            }}
          />
          <div className="folder-edit-actions">
            <button type="button" onClick={() => void saveEdit()}>
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
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
      {expanded && (
        <>
          {ownDocuments.map((doc) => (
            <div key={doc.id} className="folder-inline-document" style={{ marginLeft: 16 }}>
              📄 {doc.name}
            </div>
          ))}
          {kids.map((k) => (
            <FolderNode key={k.id} folder={k} folders={folders} documents={documents} depth={depth + 1} selectedId={selectedId} {...cb} />
          ))}
        </>
      )}
    </div>
  )
}

interface CategorySectionData {
  id: string | null
  name: string
  deletable: boolean
}

/** A named grouping of top-level folders, shown as its own collapsible block on the left.
 *  The special "Uncategorized" section (id: null) is synthesized in DocumentsPage rather
 *  than stored — it just means "root folders with no categoryId", same idea as the
 *  existing "Unfiled" bucket for documents with no folder. */
function CategorySection({
  category,
  folders,
  documents,
  selectedId,
  onSelect,
  onAddRootFolder,
  onAddChild,
  onDeleteFolder,
  onUpdateFolder,
  onRenameCategory,
  onDeleteCategory,
}: {
  category: CategorySectionData
  folders: Folder[]
  documents: Document[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddRootFolder: (categoryId: string | null, name: string) => Promise<void>
  onAddChild: (parentId: string, name: string) => Promise<void>
  onDeleteFolder: (id: string) => Promise<void>
  onUpdateFolder: (id: string, changes: { name?: string; summary?: string; icon?: string }) => Promise<void>
  onRenameCategory: (id: string, name: string) => Promise<void>
  onDeleteCategory: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(category.name)

  const roots = folderChildren(folders, null).filter((f) => (f.categoryId ?? null) === category.id)

  const addRoot = async () => {
    const n = newFolderName.trim()
    if (!n) return
    await onAddRootFolder(category.id, n)
    setNewFolderName('')
    setAdding(false)
  }

  const saveRename = async () => {
    const n = renameValue.trim()
    if (!n || category.id === null) return
    await onRenameCategory(category.id, n)
    setRenaming(false)
  }

  return (
    <div className="category-section">
      <div className="category-header">
        <button type="button" className="folder-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '▾' : '▸'}
        </button>
        {renaming ? (
          <input
            className="category-name-input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void saveRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveRename()
              if (e.key === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <span className="category-name">{category.name}</span>
        )}
        {category.deletable && (
          <>
            <button
              type="button"
              className="folder-action"
              title="Rename category"
              onClick={() => {
                setRenameValue(category.name)
                setRenaming(true)
              }}
            >
              ✎
            </button>
            <button
              type="button"
              className="folder-action folder-action-danger"
              title="Delete category"
              onClick={() => {
                if (category.id && confirm(`Delete category "${category.name}" and everything in it?`)) {
                  void onDeleteCategory(category.id)
                }
              }}
            >
              ✕
            </button>
          </>
        )}
        <button type="button" className="folder-action" title="New folder in this category" onClick={() => setAdding((v) => !v)}>
          +
        </button>
      </div>
      {adding && (
        <div className="folder-add" style={{ marginLeft: 16 }}>
          <input
            value={newFolderName}
            autoFocus
            placeholder="Folder name…"
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addRoot()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <button type="button" onClick={() => void addRoot()}>
            Add
          </button>
        </div>
      )}
      {expanded &&
        (roots.length === 0 ? (
          <div className="category-empty">No folders yet.</div>
        ) : (
          roots.map((f) => (
            <FolderNode
              key={f.id}
              folder={f}
              folders={folders}
              documents={documents}
              depth={1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onDelete={onDeleteFolder}
              onUpdate={onUpdateFolder}
            />
          ))
        ))}
    </div>
  )
}

export default function DocumentsPage() {
  const qc = useQueryClient()
  const { data: categories, isPending: categoriesPending } = useQuery({ queryKey: ['categories'], queryFn: api.listCategories })
  const { data: folders, isPending: foldersPending } = useQuery({ queryKey: ['folders'], queryFn: api.listFolders })
  const { data: allDocuments, isPending: docsPending } = useQuery({ queryKey: ['documents'], queryFn: api.listDocuments })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const invalidateCategories = () => qc.invalidateQueries({ queryKey: ['categories'] })
  const invalidateFolders = () => qc.invalidateQueries({ queryKey: ['folders'] })
  const invalidateDocs = () => qc.invalidateQueries({ queryKey: ['documents'] })

  const documents = (allDocuments ?? []).filter((d) => d.folderId === selectedId)

  const addCategory = async () => {
    const n = newCategoryName.trim()
    if (!n) return
    await api.createCategory(n)
    setNewCategoryName('')
    await invalidateCategories()
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
  /** Mirrors dropped folders as nested app folders under the currently selected folder,
   *  creating each directory level at most once even when many files share it. */
  const uploadDroppedFiles = async (dropped: DroppedFile[]) => {
    if (dropped.length === 0) return
    const folderIdByPath = new Map<string, string | null>([['', selectedId]])

    const resolveFolderId = async (dirPath: string): Promise<string | null> => {
      const cached = folderIdByPath.get(dirPath)
      if (cached !== undefined) return cached
      const lastSlash = dirPath.lastIndexOf('/')
      const parentPath = lastSlash === -1 ? '' : dirPath.slice(0, lastSlash)
      const name = lastSlash === -1 ? dirPath : dirPath.slice(lastSlash + 1)
      const parentId = await resolveFolderId(parentPath)
      const folder = await api.createFolder(parentId, name)
      folderIdByPath.set(dirPath, folder.id)
      return folder.id
    }

    for (const { dirPath, file } of dropped) {
      const folderId = await resolveFolderId(dirPath)
      await api.uploadDocument(folderId, file)
    }
    if (folderIdByPath.size > 1) await invalidateFolders()
    await invalidateDocs()
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    const dropped = await collectDroppedFiles(e.dataTransfer)
    await uploadDroppedFiles(dropped)
  }

  const download = async (id: string) => {
    const { url } = await api.getDownloadUrl(id)
    window.open(url, '_blank')
  }

  const hasUncategorizedFolders = (folders ?? []).some((f) => f.parentId === null && !f.categoryId)
  const sections: CategorySectionData[] = [
    ...(categories ?? []).map((c) => ({ id: c.id, name: c.name, deletable: true })),
    ...(hasUncategorizedFolders || (categories ?? []).length === 0
      ? [{ id: null, name: 'Uncategorized', deletable: false }]
      : []),
  ]

  return (
    <div className="page page-documents">
      <h1>Documents</h1>
      <div className="documents-layout">
        <div className="folder-panel">
          <div className="add-root">
            <input
              value={newCategoryName}
              placeholder="New category…"
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addCategory()
              }}
            />
            <button type="button" onClick={() => void addCategory()}>
              Add
            </button>
          </div>
          {/* Documents with no folder (folderId: null) — the catch-all bucket, not "every document everywhere". */}
          <div className={`folder-row ${selectedId === null ? 'folder-row-selected' : ''}`} onClick={() => setSelectedId(null)}>
            <span className="folder-name">📁 Unfiled</span>
          </div>
          {categoriesPending || foldersPending ? (
            <div className="state">Loading…</div>
          ) : (
            sections.map((section) => (
              <CategorySection
                key={section.id ?? 'uncategorized'}
                category={section}
                folders={folders ?? []}
                documents={allDocuments ?? []}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAddRootFolder={async (categoryId, name) => {
                  await api.createFolder(null, name, categoryId ?? undefined)
                  await invalidateFolders()
                }}
                onAddChild={async (parentId, name) => {
                  await api.createFolder(parentId, name)
                  await invalidateFolders()
                }}
                onDeleteFolder={async (id) => {
                  await api.deleteFolder(id)
                  await invalidateFolders()
                  await invalidateDocs()
                }}
                onUpdateFolder={async (id, changes) => {
                  await api.updateFolder(id, changes)
                  await invalidateFolders()
                }}
                onRenameCategory={async (id, name) => {
                  await api.renameCategory(id, name)
                  await invalidateCategories()
                }}
                onDeleteCategory={async (id) => {
                  await api.deleteCategory(id)
                  await invalidateCategories()
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
            <span className="upload-hint">or drag and drop files or folders here</span>
          </div>
          {isDragging && <div className="drop-overlay">Drop to upload</div>}
          {docsPending ? (
            <div className="state">Loading…</div>
          ) : documents.length === 0 ? (
            <div className="state">No documents here yet.</div>
          ) : (
            <div className="document-list">
              {documents.map((doc) => (
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

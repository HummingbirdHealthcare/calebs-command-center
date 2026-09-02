import { useState } from 'react'
import type { Note } from '../lib/types'

/** Append-only note thread, shared by tasks and documents — same shape,
 *  same add/delete affordances, just plugged into whichever parent owns it. */
export default function NotesThread({
  notes,
  onAdd,
  onDelete,
}: {
  notes: Note[]
  onAdd: (text: string) => Promise<void>
  onDelete: (noteId: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const t = text.trim()
    if (!t) return
    setBusy(true)
    try {
      await onAdd(t)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="notes">
      {notes.length === 0 ? (
        <div className="notes-empty">No notes yet.</div>
      ) : (
        notes.map((n) => (
          <div key={n.id} className="note">
            <div className="note-meta">
              <span>{new Date(n.at).toLocaleString()}</span>
              <button type="button" className="note-delete" onClick={() => void onDelete(n.id)} title="Delete note">
                ✕
              </button>
            </div>
            <div className="note-text">{n.text}</div>
          </div>
        ))
      )}
      <div className="notes-add">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" rows={2} />
        <button type="button" disabled={busy || !text.trim()} onClick={() => void submit()}>
          Add note
        </button>
      </div>
    </div>
  )
}

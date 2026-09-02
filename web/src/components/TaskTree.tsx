import { useState } from 'react'
import type { Task, TaskStatus } from '../lib/types'
import NotesThread from './NotesThread'

const STATUS_LABEL: Record<TaskStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  done: 'Done',
  blocked: 'Blocked',
}
const STATUS_COLOR: Record<TaskStatus, string> = {
  'not-started': '#9ca3af',
  'in-progress': '#3b82f6',
  done: '#22c55e',
  blocked: '#ef4444',
}
const STATUS_OPTIONS: TaskStatus[] = ['not-started', 'in-progress', 'done', 'blocked']

function childrenOf(tasks: Task[], parentId: string | null): Task[] {
  return tasks.filter((t) => t.parentId === parentId).sort((a, b) => a.order - b.order)
}

interface NodeCallbacks {
  onAddChild: (parentId: string, title: string) => Promise<void>
  onRename: (id: string, title: string) => Promise<void>
  onSetStatus: (id: string, status: TaskStatus) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddNote: (id: string, text: string) => Promise<void>
  onDeleteNote: (id: string, noteId: string) => Promise<void>
}

function TaskNode({ task, tasks, depth, ...cb }: { task: Task; tasks: Task[]; depth: number } & NodeCallbacks) {
  const [expanded, setExpanded] = useState(true)
  const [notesOpen, setNotesOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [addingChild, setAddingChild] = useState(false)
  const [newChildTitle, setNewChildTitle] = useState('')

  const kids = childrenOf(tasks, task.id)
  const doneCount = kids.filter((k) => k.status === 'done').length

  const saveTitle = async () => {
    const t = title.trim()
    setEditing(false)
    if (!t || t === task.title) {
      setTitle(task.title)
      return
    }
    await cb.onRename(task.id, t)
  }

  const addChild = async () => {
    const t = newChildTitle.trim()
    if (!t) return
    await cb.onAddChild(task.id, t)
    setNewChildTitle('')
    setAddingChild(false)
  }

  return (
    <div className="task-node" style={{ marginLeft: depth * 20 }}>
      <div className="task-row">
        <button
          type="button"
          className="task-toggle"
          onClick={() => setExpanded((v) => !v)}
          style={{ visibility: kids.length > 0 ? 'visible' : 'hidden' }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <select
          className="task-status-select"
          style={{ borderColor: STATUS_COLOR[task.status], color: STATUS_COLOR[task.status] }}
          value={task.status}
          onChange={(e) => void cb.onSetStatus(task.id, e.target.value as TaskStatus)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {editing ? (
          <input
            className="task-title-input"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveTitle()
              if (e.key === 'Escape') {
                setTitle(task.title)
                setEditing(false)
              }
            }}
          />
        ) : (
          <span className="task-title" onClick={() => setEditing(true)}>
            {task.title}
          </span>
        )}
        {kids.length > 0 && (
          <span className="task-progress">
            {doneCount}/{kids.length} done
          </span>
        )}
        <button type="button" className="task-action" onClick={() => setNotesOpen((v) => !v)} title="Notes">
          📝{task.notes.length > 0 ? ` ${task.notes.length}` : ''}
        </button>
        <button type="button" className="task-action" onClick={() => setAddingChild((v) => !v)}>
          + Sub-task
        </button>
        <button
          type="button"
          className="task-action task-action-danger"
          onClick={() => {
            if (confirm('Delete this task and all its sub-tasks?')) void cb.onDelete(task.id)
          }}
        >
          Delete
        </button>
      </div>

      {addingChild && (
        <div className="task-add-child" style={{ marginLeft: 20 }}>
          <input
            value={newChildTitle}
            autoFocus
            placeholder="Sub-task title…"
            onChange={(e) => setNewChildTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addChild()
              if (e.key === 'Escape') setAddingChild(false)
            }}
          />
          <button type="button" onClick={() => void addChild()}>
            Add
          </button>
        </div>
      )}

      {notesOpen && (
        <div className="task-notes" style={{ marginLeft: 20 }}>
          <NotesThread
            notes={task.notes}
            onAdd={(text) => cb.onAddNote(task.id, text)}
            onDelete={(noteId) => cb.onDeleteNote(task.id, noteId)}
          />
        </div>
      )}

      {expanded &&
        kids.map((child) => <TaskNode key={child.id} task={child} tasks={tasks} depth={depth + 1} {...cb} />)}
    </div>
  )
}

export default function TaskTree({ tasks, ...cb }: { tasks: Task[] } & NodeCallbacks) {
  const roots = childrenOf(tasks, null)
  return (
    <div className="task-tree">
      {roots.map((t) => (
        <TaskNode key={t.id} task={t} tasks={tasks} depth={0} {...cb} />
      ))}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'
import type { TaskStatus } from '../lib/types'
import TaskTree from '../components/TaskTree'

export default function TasksPage() {
  const qc = useQueryClient()
  const { data: tasks, isPending, isError } = useQuery({ queryKey: ['tasks'], queryFn: api.listTasks })
  const [newTitle, setNewTitle] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks'] })

  const addRoot = async () => {
    const t = newTitle.trim()
    if (!t) return
    await api.createTask(null, t)
    setNewTitle('')
    await invalidate()
  }

  if (isPending) return <div className="state">Loading tasks…</div>
  if (isError) return <div className="state">Couldn't load tasks. Refresh to retry.</div>

  return (
    <div className="page">
      <h1>Tasks</h1>
      <div className="add-root">
        <input
          value={newTitle}
          placeholder="New task…"
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addRoot()
          }}
        />
        <button type="button" onClick={() => void addRoot()}>
          Add task
        </button>
      </div>
      {tasks && tasks.length === 0 ? (
        <div className="state">No tasks yet — add one above.</div>
      ) : (
        <TaskTree
          tasks={tasks ?? []}
          onAddChild={async (parentId, title) => {
            await api.createTask(parentId, title)
            await invalidate()
          }}
          onRename={async (id, title) => {
            await api.updateTaskTitle(id, title)
            await invalidate()
          }}
          onSetStatus={async (id, status: TaskStatus) => {
            await api.updateTaskStatus(id, status)
            await invalidate()
          }}
          onDelete={async (id) => {
            await api.deleteTask(id)
            await invalidate()
          }}
          onAddNote={async (id, text) => {
            await api.addTaskNote(id, text)
            await invalidate()
          }}
          onDeleteNote={async (id, noteId) => {
            await api.deleteTaskNote(id, noteId)
            await invalidate()
          }}
        />
      )}
    </div>
  )
}

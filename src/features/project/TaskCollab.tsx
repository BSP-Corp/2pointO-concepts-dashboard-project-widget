import { useEffect, useRef, useState } from 'react'
import { canView, openFile } from '@/features/console/openFile'
import { useOptions, useTaskCollab, useTaskCollabSave } from '@/features/projects/api'
import { useDataSource } from '@/lib/data/DataSourceProvider'
import type { Ref, TaskFile, TaskNote, WorkTask } from '@/types/domain'

const USERS = { key: 'users', report: '', label: '' }
const MAX_FILES = 10
const MAX_FILE_MB = 10

/**
 * Owner cell of the task list: the assignees, and a click opens a small checklist of the app's users right in the row
 * (no popup window) — ticks are saved to Task.Owners with Save.
 */
export function OwnerCell({ task, disabled, saving, onSave }: { task: WorkTask; disabled?: boolean; saving?: boolean; onSave: (owners: Ref[]) => void }) {
  const users = useOptions(USERS, !disabled)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [text, setText] = useState('')
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc))
  }, [open])
  const names = task.owners.map((o) => o.label).join(', ')
  if (disabled) return <span className="gc-cell-static">{names || <span className="gc-muted">Unassigned</span>}</span>
  const list = [...(users.data ?? []), ...task.owners.filter((o) => !users.data?.some((u) => u.id === o.id)).map((o) => ({ id: o.id, label: o.label }))]
  const shown = list.filter((u) => !text || u.label.toLowerCase().includes(text.toLowerCase()))
  return (
    <span className="gc-owner" ref={box}>
      <button
        type="button"
        className={`gc-cell-view ${saving ? 'is-saving' : ''}`}
        aria-label={`Assign ${task.name}`}
        aria-expanded={open}
        title="Assign people to this task"
        onClick={() => {
          setPicked(task.owners.map((o) => o.id))
          setText('')
          setOpen((o) => !o)
        }}
      >
        {names || <span className="gc-muted">+ Assign</span>}
      </button>
      {open && (
        <span className="gc-owner__pop" role="group" aria-label={`Owners of ${task.name}`}>
          <input className="gc-owner__search" type="search" value={text} placeholder="Search people…" aria-label="Search people" onChange={(e) => setText(e.target.value)} autoFocus />
          <span className="gc-owner__list">
            {users.isLoading && <span className="gc-small gc-soft">Loading people…</span>}
            {!users.isLoading && !shown.length && <span className="gc-small gc-soft">No one matches</span>}
            {shown.map((u) => (
              <label key={u.id} className="gc-owner__item">
                <input type="checkbox" checked={picked.includes(u.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id)))} />
                {u.label}
              </label>
            ))}
          </span>
          <span className="gc-owner__foot">
            <button type="button" className="gc-link gc-small" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="gc-btn gc-btn--primary gc-btn--sm"
              onClick={() => {
                setOpen(false)
                if (picked.join() !== task.owners.map((o) => o.id).join()) onSave(picked.map((id) => ({ id, label: list.find((u) => u.id === id)?.label ?? '' })))
              }}
            >
              Save
            </button>
          </span>
        </span>
      )}
    </span>
  )
}

const sizeOf = (f: File) => (f.size >= 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`)
const tooBig = (files: File[]) => files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024)

/** Files picked for a comment or the task, listed with a remove button before they are sent */
function Picked({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (!files.length) return null
  return (
    <ul className="gc-collab__picked" aria-label="Files to attach">
      {files.map((f, i) => (
        <li key={`${f.name}-${f.size}-${i}`}>
          <span className="gc-collab__fname">{f.name}</span>
          <span className="gc-small gc-soft">{sizeOf(f)}</span>
          <button type="button" className="gc-icon-btn gc-icon-btn--sm" aria-label={`Remove ${f.name}`} onClick={() => onRemove(i)}>
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}

function AddFiles({ label, onAdd }: { label: string; onAdd: (files: File[]) => void }) {
  return (
    <label className="gc-rcv__add gc-collab__add">
      <input type="file" multiple aria-label={label} onChange={(e) => (onAdd(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
      <span>📎 Attach</span>
    </label>
  )
}

function FileLinks({ files, onDelete, busy }: { files: TaskFile[]; onDelete?: (f: TaskFile) => void; busy?: boolean }) {
  const ds = useDataSource()
  if (!files.length) return null
  return (
    <ul className="gc-collab__files">
      {files.map((f) => (
        <li key={f.id}>
          {f.path ? (
            <>
              <button type="button" className="gc-link" title={canView(f.name) ? 'Open in a new tab' : 'Download'} onClick={() => openFile(() => ds.readTaskFile(f), ds.taskFileUrl(f), f.name, false)}>
                📎 {f.name}
              </button>
              {canView(f.name) && (
                <button type="button" className="gc-link gc-small" aria-label={`Print ${f.name}`} onClick={() => openFile(() => ds.readTaskFile(f), ds.taskFileUrl(f), f.name, true)}>
                  Print
                </button>
              )}
            </>
          ) : (
            <span className="gc-soft">📎 {f.name} (not uploaded)</span>
          )}
          {onDelete && (
            <button type="button" className="gc-link gc-small gc-soft" disabled={busy} aria-label={`Delete ${f.name}`} onClick={() => onDelete(f)}>
              Delete
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Comment box: text, files, Send — used for new comments and for replies */
function Composer({
  label,
  placeholder,
  busy,
  onSend,
  onCancel,
}: {
  label: string
  placeholder: string
  busy: boolean
  onSend: (text: string, files: File[], done: () => void) => void
  onCancel?: () => void
}) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const big = tooBig(files)
  const problem = files.length > MAX_FILES ? `Attach at most ${MAX_FILES} files` : big ? `${big.name} is over ${MAX_FILE_MB} MB` : ''
  return (
    <div className="gc-collab__composer">
      <textarea rows={2} value={text} placeholder={placeholder} aria-label={label} onChange={(e) => setText(e.target.value)} />
      <Picked files={files} onRemove={(i) => setFiles((s) => s.filter((_x, n) => n !== i))} />
      {problem && (
        <p className="gc-small gc-danger" role="alert">
          {problem}
        </p>
      )}
      <div className="gc-collab__actions">
        <AddFiles label={`${label} — attach files`} onAdd={(add) => setFiles((s) => [...s, ...add])} />
        <span className="gc-grow" />
        {onCancel && (
          <button type="button" className="gc-link gc-small" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="gc-btn gc-btn--primary gc-btn--sm"
          disabled={busy || !!problem || (!text.trim() && !files.length)}
          onClick={() => onSend(text.trim(), files, () => (setText(''), setFiles([])))}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

/**
 * Task collaboration, inline under the task row (as Zoho Projects): the task's files (several, any format) and a comment
 * thread where each comment can be replied to directly and carry its own files. Saved through Widget.task_collab.
 */
export function TaskCollab({ projectId, task }: { projectId: string; task: WorkTask }) {
  const data = useTaskCollab(projectId, task.id)
  const save = useTaskCollabSave(projectId, task.id)
  const [replyTo, setReplyTo] = useState('')
  const [taskFiles, setTaskFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const busy = save.isPending
  const fail = (e: Error) => setError(e.message || 'Not saved')
  const notes = data.data?.notes ?? []
  const files = data.data?.files ?? []
  const roots = notes.filter((n) => !n.replyTo || !notes.some((x) => x.id === n.replyTo))
  const repliesOf = (id: string) => notes.filter((n) => n.replyTo === id)
  const filesOf = (noteId: string) => files.filter((f) => f.noteId === noteId)
  const send = (replyId: string) => (text: string, picked: File[], done: () => void) => {
    setError('')
    save.mutate({ type: 'note', comment: text, replyTo: replyId, files: picked }, { onSuccess: () => (done(), setReplyTo('')), onError: fail })
  }
  const big = tooBig(taskFiles)
  const note = (n: TaskNote, reply = false) => (
    <li key={n.id} className={`gc-collab__note ${reply ? 'is-reply' : ''}`}>
      <div className="gc-collab__meta">
        <span className="gc-collab__author">{n.author || 'Someone'}</span>
        <span className="gc-small gc-soft">{n.addedTime}</span>
      </div>
      {n.comment && <p className="gc-collab__text">{n.comment}</p>}
      <FileLinks files={filesOf(n.id)} />
      {!reply && (
        <>
          {repliesOf(n.id).length > 0 && <ul className="gc-collab__replies">{repliesOf(n.id).map((r) => note(r, true))}</ul>}
          {replyTo === n.id ? (
            <Composer label={`Reply to ${n.author || 'comment'}`} placeholder="Write a reply…" busy={busy} onSend={send(n.id)} onCancel={() => setReplyTo('')} />
          ) : (
            <button type="button" className="gc-link gc-small" onClick={() => setReplyTo(n.id)}>
              Reply
            </button>
          )}
        </>
      )}
    </li>
  )
  return (
    <div className="gc-collab" aria-label={`Comments and files of ${task.name}`}>
      <section className="gc-collab__block" aria-label="Task files">
        <div className="gc-collab__head">
          <span className="gc-label">Files</span>
          <AddFiles label={`Attach files to ${task.name}`} onAdd={(add) => setTaskFiles((s) => [...s, ...add])} />
          {taskFiles.length > 0 && (
            <button
              type="button"
              className="gc-btn gc-btn--primary gc-btn--sm"
              disabled={busy || taskFiles.length > MAX_FILES || !!big}
              onClick={() => {
                setError('')
                save.mutate({ type: 'files', files: taskFiles }, { onSuccess: () => setTaskFiles([]), onError: fail })
              }}
            >
              {busy ? 'Uploading…' : `Upload ${taskFiles.length}`}
            </button>
          )}
        </div>
        <p className="gc-small gc-soft">
          Any format · up to {MAX_FILES} files at a time, {MAX_FILE_MB} MB each.
        </p>
        <Picked files={taskFiles} onRemove={(i) => setTaskFiles((s) => s.filter((_x, n) => n !== i))} />
        {taskFiles.length > MAX_FILES && <p className="gc-small gc-danger">Attach at most {MAX_FILES} files</p>}
        {big && (
          <p className="gc-small gc-danger">
            {big.name} is over {MAX_FILE_MB} MB
          </p>
        )}
        {data.isLoading ? (
          <p className="gc-small gc-soft">Loading…</p>
        ) : (
          <FileLinks files={filesOf('')} busy={busy} onDelete={(f) => (setError(''), save.mutate({ type: 'delete', fileId: f.id }, { onError: fail }))} />
        )}
      </section>
      <section className="gc-collab__block" aria-label="Comments">
        <span className="gc-label">Comments</span>
        {data.error ? (
          <p className="gc-small gc-danger">{data.error.message}</p>
        ) : !data.isLoading && roots.length === 0 ? (
          <p className="gc-small gc-soft">No comments yet.</p>
        ) : (
          <ul className="gc-collab__thread">{roots.map((n) => note(n))}</ul>
        )}
        <Composer label={`Comment on ${task.name}`} placeholder="Write a comment…" busy={busy && !replyTo} onSend={send('')} />
      </section>
      {error && (
        <p className="gc-small gc-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { GitResult, TagInfo } from '@shared/types'
import ConfirmDialog, { type ConfirmSpec } from './ConfirmDialog'

interface Props {
  repoPath: string
  /** nombres de remotos: sin remoto no se puede publicar ni borrar alla */
  remotes: string[]
  /** avisa al padre para refrescar el grafo (los tags salen como chips) */
  onChanged: () => void
  /** publica el comando+salida en el panel de salida cruda del padre */
  onResult: (res: GitResult) => void
}

/**
 * Tags del repo: crear (ligero o anotado), publicar en el remoto y borrar
 * (local y remoto son cosas distintas, por eso se confirman por separado).
 */
function TagPanel({ repoPath, remotes, onChanged, onResult }: Props): JSX.Element {
  const [tags, setTags] = useState<TagInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState('')
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)

  // remoto por defecto: origin si existe, si no el primero
  const remote = remotes.includes('origin') ? 'origin' : (remotes[0] ?? '')

  const load = useCallback(async () => {
    setTags(await window.api.tags(repoPath))
  }, [repoPath])

  useEffect(() => {
    load()
  }, [load])

  const run = useCallback(
    async (fn: () => Promise<GitResult>) => {
      setBusy(true)
      const res = await fn()
      onResult(res)
      setBusy(false)
      await load()
      onChanged()
    },
    [load, onChanged, onResult]
  )

  const onCreate = useCallback(async () => {
    const n = name.trim()
    if (!n) return
    await run(() => window.api.createTag(repoPath, n, message, target))
    setName('')
    setMessage('')
    setTarget('')
    setShowNew(false)
  }, [run, repoPath, name, message, target])

  const onDelete = useCallback(
    (t: TagInfo) => {
      setConfirm({
        title: 'Borrar tag local',
        message: (
          <>
            Se borrará <b>{t.name}</b> solo en este repo. Si ya está publicado, seguirá en el
            remoto.
          </>
        ),
        confirmLabel: 'Borrar',
        danger: true,
        onConfirm: () => {
          setConfirm(null)
          run(() => window.api.deleteTag(repoPath, t.name))
        }
      })
    },
    [run, repoPath]
  )

  const onDeleteRemote = useCallback(
    (t: TagInfo) => {
      setConfirm({
        title: 'Borrar tag en el remoto',
        message: (
          <>
            Se borrará <b>{t.name}</b> en <b>{remote}</b>. Afecta a todo el que use ese remoto.
          </>
        ),
        confirmLabel: `Borrar en ${remote}`,
        danger: true,
        onConfirm: () => {
          setConfirm(null)
          run(() => window.api.deleteRemoteTag(repoPath, remote, t.name))
        }
      })
    },
    [run, repoPath, remote]
  )

  return (
    <>
      <div className="pane-title">
        Tags <span className="count">{tags.length}</span>
        {remote && tags.length > 0 && (
          <button
            className="link"
            onClick={() => run(() => window.api.pushAllTags(repoPath, remote))}
            disabled={busy}
            title={`publicar todos los tags que falten en ${remote}`}
          >
            ↑ todos
          </button>
        )}
        <button className="link" onClick={() => setShowNew((s) => !s)} disabled={busy}>
          ＋ nuevo
        </button>
      </div>

      {showNew && (
        <div className="add-remote">
          <input
            autoFocus
            placeholder="nombre (ej. v1.0.0)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreate()
              if (e.key === 'Escape') setShowNew(false)
            }}
          />
          <input
            placeholder="mensaje (opcional → tag anotado)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <input
            placeholder="commit/rama (vacío = HEAD)"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <div className="ar-btns">
            <button onClick={onCreate} disabled={busy || !name.trim()}>
              Crear
            </button>
            <button className="link" onClick={() => setShowNew(false)}>
              cancelar
            </button>
          </div>
        </div>
      )}

      <ul className="tag-list">
        {tags.length === 0 && <li className="mini">sin tags</li>}
        {tags.map((t) => (
          <li key={t.name} className="tag-row">
            <div className="tg-head">
              <span className="tg-name" title={t.message || undefined}>
                {t.name}
              </span>
              <span className="tg-actions">
                {remote && (
                  <button
                    onClick={() => run(() => window.api.pushTag(repoPath, remote, t.name))}
                    disabled={busy}
                    title={`publicar en ${remote}`}
                  >
                    ↑
                  </button>
                )}
                <button onClick={() => onDelete(t)} disabled={busy} title="borrar tag local">
                  ✕
                </button>
                {remote && (
                  <button
                    className="del"
                    onClick={() => onDeleteRemote(t)}
                    disabled={busy}
                    title={`borrar en ${remote}`}
                  >
                    ✕↑
                  </button>
                )}
              </span>
            </div>
            <span className="tg-meta">
              {t.commit} · {t.annotated ? 'anotado' : 'ligero'} · {t.date}
              {t.message ? ` · ${t.message}` : ''}
            </span>
          </li>
        ))}
      </ul>

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </>
  )
}

export default TagPanel

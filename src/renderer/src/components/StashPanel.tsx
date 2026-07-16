import { useCallback, useEffect, useState } from 'react'
import type { GitResult, StashEntry } from '@shared/types'
import ConfirmDialog, { type ConfirmSpec } from './ConfirmDialog'
import { ansiToHtml } from '../lib/ansi'

interface Props {
  repoPath: string
  /** hay cambios en el working tree: sin esto no hay nada que guardar */
  dirty: boolean
  /** avisa al padre para refrescar repo/grafo (stash cambia el working tree) */
  onChanged: () => void
  /** publica el comando+salida en el panel de salida cruda del padre */
  onResult: (res: GitResult) => void
}

/**
 * Pila de stashes: guardar cambios a medias, volver a aplicarlos, y descartarlos.
 *
 * `apply` deja el stash en la pila y `pop` lo saca: se ofrecen los dos porque la
 * diferencia importa (pop con conflictos NO borra el stash, apply nunca lo borra).
 */
function StashPanel({ repoPath, dirty, onChanged, onResult }: Props): JSX.Element {
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [message, setMessage] = useState('')
  const [untracked, setUntracked] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  // diff del stash abierto (ref -> html con color)
  const [openRef, setOpenRef] = useState<string | null>(null)
  const [diff, setDiff] = useState<string>('')

  const load = useCallback(async () => {
    setStashes(await window.api.stashes(repoPath))
  }, [repoPath])

  useEffect(() => {
    setOpenRef(null)
    load()
  }, [load])

  /** corre una accion de stash, publica el resultado y recarga todo */
  const run = useCallback(
    async (fn: () => Promise<GitResult>) => {
      setBusy(true)
      const res = await fn()
      onResult(res)
      setBusy(false)
      setOpenRef(null)
      await load()
      onChanged()
      return res
    },
    [load, onChanged, onResult]
  )

  const onPush = useCallback(async () => {
    await run(() => window.api.stashPush(repoPath, message, untracked))
    setMessage('')
    setUntracked(false)
    setShowNew(false)
  }, [run, repoPath, message, untracked])

  const onDrop = useCallback(
    (s: StashEntry) => {
      setConfirm({
        title: 'Descartar stash',
        message: (
          <>
            Se perderán los cambios guardados en <b>{s.ref}</b>
            {s.message ? ` ("${s.message}")` : ''}. Esto no se puede deshacer.
          </>
        ),
        confirmLabel: 'Descartar',
        danger: true,
        onConfirm: () => {
          setConfirm(null)
          run(() => window.api.stashDrop(repoPath, s.ref))
        }
      })
    },
    [run, repoPath]
  )

  /** abre/cierra el diff de un stash (git stash show -p) */
  const toggleDiff = useCallback(
    async (s: StashEntry) => {
      if (openRef === s.ref) {
        setOpenRef(null)
        return
      }
      setOpenRef(s.ref)
      setDiff('')
      const res = await window.api.stashShow(repoPath, s.ref)
      setDiff(res.stdout || res.stderr)
    },
    [openRef, repoPath]
  )

  return (
    <>
      <div className="pane-title">
        Stashes <span className="count">{stashes.length}</span>
        <button
          className="link"
          onClick={() => setShowNew((s) => !s)}
          disabled={busy || !dirty}
          title={dirty ? 'guardar los cambios actuales en un stash' : 'no hay cambios que guardar'}
        >
          ＋ guardar
        </button>
      </div>

      {showNew && (
        <div className="add-remote">
          <input
            autoFocus
            placeholder="mensaje (opcional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onPush()
              if (e.key === 'Escape') setShowNew(false)
            }}
          />
          <label className="mini check">
            <input
              type="checkbox"
              checked={untracked}
              onChange={(e) => setUntracked(e.target.checked)}
            />
            incluir archivos sin trackear (-u)
          </label>
          <div className="ar-btns">
            <button onClick={onPush} disabled={busy}>
              Guardar
            </button>
            <button className="link" onClick={() => setShowNew(false)}>
              cancelar
            </button>
          </div>
        </div>
      )}

      <ul className="stash-list">
        {stashes.length === 0 && <li className="mini">sin stashes</li>}
        {stashes.map((s) => (
          <li key={s.ref} className="stash-row">
            <div className="st-head">
              <span
                className="st-msg"
                onClick={() => toggleDiff(s)}
                title="ver qué guarda este stash"
              >
                {s.message || '(sin mensaje)'}
              </span>
              <span className="st-actions">
                <button
                  onClick={() => run(() => window.api.stashApply(repoPath, s.ref))}
                  disabled={busy}
                  title="aplicar y dejarlo en la pila"
                >
                  apply
                </button>
                <button
                  onClick={() => run(() => window.api.stashPop(repoPath, s.ref))}
                  disabled={busy}
                  title="aplicar y sacarlo de la pila"
                >
                  pop
                </button>
                <button
                  className="del"
                  onClick={() => onDrop(s)}
                  disabled={busy}
                  title="descartar sin aplicar"
                >
                  ✕
                </button>
              </span>
            </div>
            <span className="st-meta">
              {s.ref} · {s.branch} · {s.date}
            </span>
            {openRef === s.ref && (
              <pre
                className="st-diff ansi"
                dangerouslySetInnerHTML={{ __html: ansiToHtml(diff || '(cargando…)') }}
              />
            )}
          </li>
        ))}
      </ul>

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </>
  )
}

export default StashPanel

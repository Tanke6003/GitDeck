import { useCallback, useEffect, useState } from 'react'
import type { GitResult, StashEntry } from '@shared/types'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'
import { ansiToHtml } from '../lib/ansi'
import { useI18n } from '../lib/i18n'

interface Props {
  repoPath: string
  /** hay cambios en el working tree: sin esto no hay nada que guardar */
  dirty: boolean
  /** hay otra accion del repo en curso (busy del padre): deshabilita las nuestras */
  parentBusy: boolean
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
function StashPanel({ repoPath, dirty, parentBusy, onChanged, onResult }: Props): JSX.Element {
  const { t } = useI18n()
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [loadErr, setLoadErr] = useState<GitResult | null>(null)
  const [selfBusy, setSelfBusy] = useState(false)
  const busy = selfBusy || parentBusy
  const [showNew, setShowNew] = useState(false)
  const [message, setMessage] = useState('')
  const [untracked, setUntracked] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  // diff del stash abierto (ref -> html con color)
  const [openRef, setOpenRef] = useState<string | null>(null)
  const [diff, setDiff] = useState<string>('')

  const load = useCallback(async () => {
    const r = await window.api.stashes(repoPath)
    setStashes(r.data)
    setLoadErr(r.error)
  }, [repoPath])

  useEffect(() => {
    setOpenRef(null)
    load()
  }, [load])

  /** corre una accion de stash, publica el resultado y recarga todo */
  const run = useCallback(
    async (fn: () => Promise<GitResult>) => {
      setSelfBusy(true)
      const res = await fn()
      onResult(res)
      setSelfBusy(false)
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
        title: t('stash.drop.title'),
        message: t('stash.drop.msg', { ref: s.ref, msg: s.message ? ` ("${s.message}")` : '' }),
        confirmLabel: t('stash.drop.confirm'),
        danger: true,
        onConfirm: () => {
          setConfirm(null)
          run(() => window.api.stashDrop(repoPath, s.ref))
        }
      })
    },
    [run, repoPath, t]
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
        {t('stash.title')} <span className="count">{stashes.length}</span>
        <button
          className="link"
          onClick={() => setShowNew((s) => !s)}
          disabled={busy || !dirty}
          title={dirty ? t('stash.new.title') : t('stash.new.noChanges')}
        >
          ＋ {t('stash.new')}
        </button>
      </div>

      {loadErr && (
        <div className="pane-error" role="alert">
          {t('common.readError')}
          <pre>{(loadErr.stderr || loadErr.stdout).trim() || loadErr.cmd}</pre>
        </div>
      )}

      {showNew && (
        <div className="add-remote">
          <input
            autoFocus
            placeholder={t('stash.msgPlaceholder')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onPush()
              if (e.key === 'Escape') setShowNew(false)
            }}
          />
          <label className="mini check">
            <input type="checkbox" checked={untracked} onChange={(e) => setUntracked(e.target.checked)} />
            {t('stash.includeUntracked')}
          </label>
          <div className="ar-btns">
            <button onClick={onPush} disabled={busy}>
              {t('stash.save')}
            </button>
            <button className="link" onClick={() => setShowNew(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <ul className="stash-list">
        {stashes.length === 0 && !loadErr && <li className="mini">{t('stash.empty')}</li>}
        {stashes.map((s) => (
          <li key={s.ref} className="stash-row">
            <div className="st-head">
              <button className="st-msg" onClick={() => toggleDiff(s)} title={t('stash.showDiff')}>
                {s.message || t('stash.noMessage')}
              </button>
              <span className="st-actions">
                <button
                  onClick={() => run(() => window.api.stashApply(repoPath, s.ref))}
                  disabled={busy}
                  title={t('stash.apply.title')}
                >
                  apply
                </button>
                <button
                  onClick={() => run(() => window.api.stashPop(repoPath, s.ref))}
                  disabled={busy}
                  title={t('stash.pop.title')}
                >
                  pop
                </button>
                <button
                  className="del"
                  onClick={() => onDrop(s)}
                  disabled={busy}
                  aria-label={t('stash.drop.title')}
                  title={t('stash.drop.btnTitle')}
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
                dangerouslySetInnerHTML={{ __html: ansiToHtml(diff || t('common.loading')) }}
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

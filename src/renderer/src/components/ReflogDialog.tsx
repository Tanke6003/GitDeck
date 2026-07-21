import { useCallback, useEffect, useState } from 'react'
import type { GitResult, ReflogEntry } from '@shared/types'
import Dialog from './Dialog'
import ResetDialog from './ResetDialog'
import { useI18n } from '../lib/i18n'

interface Props {
  repoPath: string
  /** avisa al padre tras crear una rama o resetear (cambia el grafo) */
  onChanged: () => void
  onClose: () => void
}

/** El reflog dice qué se hizo; esto lo traduce a una etiqueta corta. */
function kindOf(action: string): string {
  const verb = action.split(':')[0].trim()
  return verb || 'ref'
}

/**
 * Reflog: por dónde ha pasado HEAD. Sirve para recuperar commits que se
 * quedaron sin rama (tras un reset, un rebase o un checkout).
 *
 * Dos formas de actuar sobre una entrada:
 * - crear una rama ahí (recuperación segura, no mueve tu rama)
 * - resetear la rama actual a esa entrada (soft/mixed/hard)
 */
function ReflogDialog({ repoPath, onChanged, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [entries, setEntries] = useState<ReflogEntry[] | null>(null)
  const [error, setError] = useState<GitResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<GitResult | null>(null)
  // entrada en la que se esta creando rama
  const [openRef, setOpenRef] = useState<string | null>(null)
  const [name, setName] = useState('')
  // entrada a la que se esta reseteando
  const [resetRef, setResetRef] = useState<ReflogEntry | null>(null)

  useEffect(() => {
    let alive = true
    window.api.reflog(repoPath).then((r) => {
      if (!alive) return
      setEntries(r.data)
      setError(r.error)
    })
    return () => {
      alive = false
    }
  }, [repoPath])

  const createBranch = useCallback(
    async (entry: ReflogEntry) => {
      const n = name.trim()
      if (!n) return
      setBusy(true)
      // startPoint = la entrada del reflog; sin checkout, para no mover al usuario
      const r = await window.api.createBranch(repoPath, n, entry.ref, false)
      setRes(r)
      setBusy(false)
      if (r.ok) {
        setName('')
        setOpenRef(null)
        onChanged()
      }
    },
    [name, repoPath, onChanged]
  )

  const onResetDone = useCallback(
    (r: GitResult) => {
      setRes(r)
      if (r.ok) onChanged()
    },
    [onChanged]
  )

  return (
    <Dialog className="bl-dialog" overlayClassName="cd-overlay" labelledBy="rl-title" onClose={onClose}>
      <div className="cd-head">
        <span className="cd-sha" id="rl-title">
          reflog
        </span>
        <span className="bl-path">{t('reflog.subtitle')}</span>
        <span className="spacer" />
        <button className="link" onClick={onClose} aria-label={t('common.close')} title={t('common.closeEsc')}>
          ✕
        </button>
      </div>

      {res && (
        <div className={`cd-opres ${res.ok ? 'ok' : 'err'}`} role="status">
          <span className="cd-cmd">$ {res.cmd}</span>
          <pre>{(res.stdout || res.stderr || t('common.noOutput')).trim()}</pre>
        </div>
      )}

      {!entries && !error && <div className="bl-empty">{t('common.loading')}</div>}
      {error && (
        <div className="bl-empty err" role="alert">
          {t('common.readError')} — <code>{error.cmd}</code>
          <pre>{(error.stderr || error.stdout).trim()}</pre>
        </div>
      )}
      {entries && !error && entries.length === 0 && <div className="bl-empty">{t('reflog.empty')}</div>}

      {entries && entries.length > 0 && (
        <ul className="rl-list">
          {entries.map((e) => (
            <li key={e.ref} className="rl-row">
              <div className="rl-head">
                <span className="rl-ref">{e.ref}</span>
                <span className="rl-sha">{e.short}</span>
                <span className="rl-kind">{kindOf(e.action)}</span>
                <span className="rl-subject" title={e.action}>
                  {e.subject || e.action}
                </span>
                <span className="rl-date">{e.date}</span>
                <button
                  className="link"
                  onClick={() => setOpenRef(openRef === e.ref ? null : e.ref)}
                  disabled={busy}
                  title={t('reflog.branchHere.title')}
                >
                  ⑂ {t('reflog.branchHere')}
                </button>
                <button
                  className="link"
                  onClick={() => setResetRef(e)}
                  disabled={busy}
                  title={t('reflog.resetHere.title')}
                >
                  ⟲ {t('reflog.resetHere')}
                </button>
              </div>
              {openRef === e.ref && (
                <div className="rl-branch">
                  <input
                    autoFocus
                    placeholder={t('branch.namePlaceholder')}
                    value={name}
                    onChange={(ev) => setName(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') createBranch(e)
                      if (ev.key === 'Escape') {
                        ev.stopPropagation()
                        setOpenRef(null)
                      }
                    }}
                  />
                  <button onClick={() => createBranch(e)} disabled={busy || !name.trim()}>
                    {busy ? t('common.creating') : t('common.create')}
                  </button>
                  <span className="hint">{t('reflog.branchHint', { sha: e.short })}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {resetRef && (
        <ResetDialog
          repoPath={repoPath}
          rev={resetRef.ref}
          revLabel={`${resetRef.ref} (${resetRef.short})`}
          onDone={onResetDone}
          onClose={() => setResetRef(null)}
        />
      )}
    </Dialog>
  )
}

export default ReflogDialog

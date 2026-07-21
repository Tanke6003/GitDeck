import { useState } from 'react'
import type { BranchInfo } from '@shared/types'
import { useI18n } from '../lib/i18n'

/**
 * Listas de ramas del panel lateral, extraidas de RepoDetail.
 * Cada fila es un boton real (checkout con teclado incluido) y las acciones
 * (merge/rebase/renombrar/borrar) son visibles tambien con foco de teclado,
 * no solo al pasar el raton.
 */

interface LocalProps {
  branches: BranchInfo[]
  busy: boolean
  onCheckout: (b: BranchInfo) => void
  onMerge: (name: string) => void
  onRebase: (name: string) => void
  onDelete: (b: BranchInfo) => void
  onRename: (oldName: string, newName: string) => Promise<void>
}

export function LocalBranchList({
  branches,
  busy,
  onCheckout,
  onMerge,
  onRebase,
  onDelete,
  onRename
}: LocalProps): JSX.Element {
  const { t } = useI18n()
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const commitRename = async (oldName: string): Promise<void> => {
    const name = editName.trim()
    setEditing(null)
    if (!name || name === oldName) return
    await onRename(oldName, name)
  }

  return (
    <ul className="branch-list">
      {branches.length === 0 && <li className="mini">{t('branch.noneLocal')}</li>}
      {branches.map((b) =>
        editing === b.name ? (
          <li key={b.name} className="branch-row editing">
            <input
              autoFocus
              className="b-edit"
              aria-label={t('branch.rename', { name: b.name })}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(b.name)
                if (e.key === 'Escape') setEditing(null)
              }}
            />
            <button onClick={() => commitRename(b.name)} disabled={busy} title={t('branch.renameConfirm')}>
              ✓
            </button>
            <button className="link" onClick={() => setEditing(null)} aria-label={t('common.cancel')}>
              ✕
            </button>
          </li>
        ) : (
          <li key={b.name} className={`branch-row ${b.isCurrent ? 'current' : ''}`}>
            <button
              className="b-main"
              onClick={() => onCheckout(b)}
              disabled={b.isCurrent}
              title={b.isCurrent ? t('branch.current') : t('branch.switchTo', { name: b.name })}
            >
              <span className="b-mark" aria-hidden="true">
                {b.isCurrent ? '●' : '○'}
              </span>
              <span className="b-name">{b.name}</span>
              {(b.ahead > 0 || b.behind > 0) && (
                <span className="b-sync" title={t('branch.aheadBehind', { ahead: b.ahead, behind: b.behind })}>
                  {b.ahead > 0 && <span className="ahead">↑{b.ahead}</span>}
                  {b.behind > 0 && <span className="behind">↓{b.behind}</span>}
                </span>
              )}
              {b.gone && (
                <span className="b-gone" title={t('branch.goneTitle')}>
                  gone
                </span>
              )}
            </button>
            <span className="b-actions">
              {!b.isCurrent && (
                <>
                  <button onClick={() => onMerge(b.name)} disabled={busy} title={t('branch.mergeTitle', { name: b.name })}>
                    merge
                  </button>
                  <button onClick={() => onRebase(b.name)} disabled={busy} title={t('branch.rebaseTitle', { name: b.name })}>
                    rebase
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setEditing(b.name)
                  setEditName(b.name)
                }}
                disabled={busy}
                aria-label={t('branch.rename', { name: b.name })}
                title={t('branch.rename', { name: b.name })}
              >
                ✎
              </button>
              {!b.isCurrent && (
                <button
                  className="del"
                  onClick={() => onDelete(b)}
                  disabled={busy}
                  aria-label={t('branch.delete', { name: b.name })}
                  title={t('branch.delete', { name: b.name })}
                >
                  ✕
                </button>
              )}
            </span>
          </li>
        )
      )}
    </ul>
  )
}

interface RemoteBranchProps {
  branches: BranchInfo[]
  busy: boolean
  onCheckout: (b: BranchInfo) => void
  onMerge: (name: string) => void
  onDeleteRemote: (b: BranchInfo) => void
}

export function RemoteBranchList({
  branches,
  busy,
  onCheckout,
  onMerge,
  onDeleteRemote
}: RemoteBranchProps): JSX.Element {
  const { t } = useI18n()
  return (
    <ul className="branch-list">
      {branches.length === 0 && <li className="mini">{t('branch.noneRemote')}</li>}
      {branches.map((b) => (
        <li key={b.name} className="branch-row remote">
          <button className="b-main" onClick={() => onCheckout(b)} title={t('branch.trackTitle', { name: b.name })}>
            <span className="b-mark" aria-hidden="true">
              ⇄
            </span>
            <span className="b-name">{b.name}</span>
          </button>
          <span className="b-actions">
            <button onClick={() => onMerge(b.name)} disabled={busy} title={t('branch.mergeTitle', { name: b.name })}>
              merge
            </button>
            <button
              className="del"
              onClick={() => onDeleteRemote(b)}
              disabled={busy}
              aria-label={t('branch.deleteRemote', { name: b.name })}
              title={t('branch.deleteRemote', { name: b.name })}
            >
              ✕
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}

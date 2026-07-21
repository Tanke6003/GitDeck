import { useState } from 'react'
import type { RemoteInfo } from '@shared/types'
import { useI18n } from '../lib/i18n'

interface Props {
  remotes: RemoteInfo[]
  busy: boolean
  onAdd: (name: string, url: string) => Promise<boolean>
  onRemove: (name: string) => void
  onRename: (oldName: string, newName: string) => Promise<void>
}

/** Seccion de remotos del panel lateral (agregar / renombrar / quitar). */
function RemoteList({ remotes, busy, onAdd, onRemove, onRename }: Props): JSX.Element {
  const { t } = useI18n()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const add = async (): Promise<void> => {
    if (!name.trim() || !url.trim()) return
    const ok = await onAdd(name.trim(), url.trim())
    if (ok) {
      setName('')
      setUrl('')
      setShowAdd(false)
    }
  }

  const commitRename = async (oldName: string): Promise<void> => {
    const n = editName.trim()
    setEditing(null)
    if (!n || n === oldName) return
    await onRename(oldName, n)
  }

  return (
    <>
      <div className="pane-title">
        {t('remote.title')} <span className="count">{remotes.length}</span>
        <button className="link" onClick={() => setShowAdd((s) => !s)} disabled={busy}>
          ＋ {t('remote.add')}
        </button>
      </div>
      {showAdd && (
        <div className="add-remote">
          <input
            placeholder={t('remote.namePlaceholder')}
            aria-label={t('remote.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setShowAdd(false)}
          />
          <input
            placeholder={t('remote.urlPlaceholder')}
            aria-label={t('remote.urlPlaceholder')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
              if (e.key === 'Escape') setShowAdd(false)
            }}
          />
          <div className="ar-btns">
            <button onClick={add} disabled={busy || !name.trim() || !url.trim()}>
              {t('remote.addConfirm')}
            </button>
            <button className="link" onClick={() => setShowAdd(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      <ul className="remote-list">
        {remotes.length === 0 && <li className="mini">{t('remote.none')}</li>}
        {remotes.map((rm) => (
          <li key={rm.name} className="remote-row">
            <div className="rm-head">
              {editing === rm.name ? (
                <>
                  <input
                    autoFocus
                    className="rm-edit"
                    aria-label={t('remote.rename')}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(rm.name)
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                  <button className="link" onClick={() => commitRename(rm.name)} disabled={busy} title={t('remote.rename')}>
                    ✓
                  </button>
                  <button className="link" onClick={() => setEditing(null)} aria-label={t('common.cancel')}>
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <span className="rm-name">{rm.name}</span>
                  <button
                    className="link"
                    onClick={() => {
                      setEditing(rm.name)
                      setEditName(rm.name)
                    }}
                    disabled={busy}
                    aria-label={t('remote.rename')}
                    title={t('remote.rename')}
                  >
                    ✎
                  </button>
                  <button
                    className="link del"
                    onClick={() => onRemove(rm.name)}
                    disabled={busy}
                    aria-label={t('remote.remove', { name: rm.name })}
                    title={t('remote.remove', { name: rm.name })}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
            <span className="rm-url" title={rm.fetchUrl}>
              {rm.fetchUrl}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

export default RemoteList

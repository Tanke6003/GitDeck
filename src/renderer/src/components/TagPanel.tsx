import { useCallback, useEffect, useState } from 'react'
import type { GitResult, TagInfo } from '@shared/types'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'
import { useI18n } from '../lib/i18n'

interface Props {
  repoPath: string
  /** nombres de remotos: sin remoto no se puede publicar ni borrar alla */
  remotes: string[]
  /** hay otra accion del repo en curso (busy del padre) */
  parentBusy: boolean
  /** avisa al padre para refrescar el grafo (los tags salen como chips) */
  onChanged: () => void
  /** publica el comando+salida en el panel de salida cruda del padre */
  onResult: (res: GitResult) => void
}

/**
 * Tags del repo: crear (ligero o anotado), publicar en el remoto y borrar
 * (local y remoto son cosas distintas, por eso se confirman por separado).
 */
function TagPanel({ repoPath, remotes, parentBusy, onChanged, onResult }: Props): JSX.Element {
  const { t } = useI18n()
  const [tags, setTags] = useState<TagInfo[]>([])
  const [loadErr, setLoadErr] = useState<GitResult | null>(null)
  const [selfBusy, setSelfBusy] = useState(false)
  const busy = selfBusy || parentBusy
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState('')
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)

  // remoto por defecto: origin si existe, si no el primero
  const remote = remotes.includes('origin') ? 'origin' : (remotes[0] ?? '')

  const load = useCallback(async () => {
    const r = await window.api.tags(repoPath)
    setTags(r.data)
    setLoadErr(r.error)
  }, [repoPath])

  useEffect(() => {
    load()
  }, [load])

  const run = useCallback(
    async (fn: () => Promise<GitResult>) => {
      setSelfBusy(true)
      const res = await fn()
      onResult(res)
      setSelfBusy(false)
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
    (tag: TagInfo) => {
      setConfirm({
        title: t('tag.delete.title'),
        message: t('tag.delete.msg', { name: tag.name }),
        confirmLabel: t('tag.delete.confirm'),
        danger: true,
        onConfirm: () => {
          setConfirm(null)
          run(() => window.api.deleteTag(repoPath, tag.name))
        }
      })
    },
    [run, repoPath, t]
  )

  const onDeleteRemote = useCallback(
    (tag: TagInfo) => {
      setConfirm({
        title: t('tag.deleteRemote.title'),
        message: t('tag.deleteRemote.msg', { name: tag.name, remote }),
        confirmLabel: t('tag.deleteRemote.confirm', { remote }),
        danger: true,
        onConfirm: () => {
          setConfirm(null)
          run(() => window.api.deleteRemoteTag(repoPath, remote, tag.name))
        }
      })
    },
    [run, repoPath, remote, t]
  )

  return (
    <>
      <div className="pane-title">
        {t('tag.title')} <span className="count">{tags.length}</span>
        {remote && tags.length > 0 && (
          <button
            className="link"
            onClick={() => run(() => window.api.pushAllTags(repoPath, remote))}
            disabled={busy}
            title={t('tag.pushAll.title', { remote })}
          >
            ↑ {t('tag.pushAll')}
          </button>
        )}
        <button className="link" onClick={() => setShowNew((s) => !s)} disabled={busy}>
          ＋ {t('tag.new')}
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
            placeholder={t('tag.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreate()
              if (e.key === 'Escape') setShowNew(false)
            }}
          />
          <input
            placeholder={t('tag.msgPlaceholder')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <input
            placeholder={t('tag.targetPlaceholder')}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <div className="ar-btns">
            <button onClick={onCreate} disabled={busy || !name.trim()}>
              {t('common.create')}
            </button>
            <button className="link" onClick={() => setShowNew(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <ul className="tag-list">
        {tags.length === 0 && !loadErr && <li className="mini">{t('tag.empty')}</li>}
        {tags.map((tag) => (
          <li key={tag.name} className="tag-row">
            <div className="tg-head">
              <span className="tg-name" title={tag.message || undefined}>
                {tag.name}
              </span>
              <span className="tg-actions">
                {remote && (
                  <button
                    onClick={() => run(() => window.api.pushTag(repoPath, remote, tag.name))}
                    disabled={busy}
                    aria-label={t('tag.push.title', { remote })}
                    title={t('tag.push.title', { remote })}
                  >
                    ↑
                  </button>
                )}
                <button
                  className="del"
                  onClick={() => onDelete(tag)}
                  disabled={busy}
                  aria-label={t('tag.delete.title')}
                  title={t('tag.delete.btnTitle')}
                >
                  ✕
                </button>
                {remote && (
                  <button
                    className="del"
                    onClick={() => onDeleteRemote(tag)}
                    disabled={busy}
                    aria-label={t('tag.deleteRemote.title')}
                    title={t('tag.deleteRemote.btnTitle', { remote })}
                  >
                    ✕↑
                  </button>
                )}
              </span>
            </div>
            <span className="tg-meta">
              {tag.commit} · {tag.annotated ? t('tag.annotated') : t('tag.lightweight')} · {tag.date}
              {tag.message ? ` · ${tag.message}` : ''}
            </span>
          </li>
        ))}
      </ul>

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </>
  )
}

export default TagPanel

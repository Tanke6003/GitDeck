import { useCallback, useEffect, useRef, useState } from 'react'
import type { Commit, GitResult, SearchMode } from '@shared/types'
import { useI18n } from '../lib/i18n'

const MODES: SearchMode[] = ['message', 'author', 'content', 'regex', 'file', 'hash']

interface Props {
  repoPath: string
  /** resultados (o null si no hay busqueda activa) */
  onResults: (commits: Commit[] | null) => void
  /** abre el detalle de un commit */
  onPick: (hash: string) => void
  results: Commit[] | null
}

/**
 * Buscador de commits sobre el árbol. Mientras hay búsqueda activa se muestra la
 * lista de resultados en vez del grafo: un log filtrado deja commits sin sus
 * padres, y dibujar eso como árbol daría un grafo mentiroso.
 *
 * El padre lo monta con `key={repoPath}`, asi que al cambiar de repo React lo
 * remonta y el texto/los resultados se limpian solos.
 */
function SearchBar({ repoPath, onResults, onPick, results }: Props): JSX.Element {
  const { t } = useI18n()
  const [mode, setMode] = useState<SearchMode>('message')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<GitResult | null>(null)
  const req = useRef(0) // descarta respuestas de búsquedas ya superadas
  const input = useRef<HTMLInputElement>(null)

  const search = useCallback(
    async (m: SearchMode, txt: string) => {
      const id = ++req.current
      if (!txt.trim()) {
        onResults(null)
        setError(null)
        return
      }
      setBusy(true)
      const found = await window.api.searchCommits(repoPath, m, txt)
      // si mientras tanto se tecleó de nuevo, esta respuesta ya no vale
      if (id === req.current) {
        onResults(found.data)
        setError(found.error)
        setBusy(false)
      }
    },
    [repoPath, onResults]
  )

  // busca sola tras dejar de teclear (300ms), sin castigar cada pulsación
  useEffect(() => {
    const timer = setTimeout(() => search(mode, text), 300)
    return () => clearTimeout(timer)
  }, [mode, text, search])

  const clear = useCallback(() => {
    setText('')
    setError(null)
    onResults(null)
  }, [onResults])

  // Ctrl+F enfoca el buscador (lo maneja aqui: es quien tiene el input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const modeLabel = (m: SearchMode): string => t(`search.mode.${m}`)
  const modeHint = (m: SearchMode): string => t(`search.hint.${m}`)

  return (
    <div className="search-wrap">
      <div className="search-bar" role="search">
        <span className="s-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          ref={input}
          className="s-input"
          aria-label={t('search.label')}
          placeholder={`${modeHint(mode)} — Ctrl+F`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') clear()
          }}
        />
        <div className="s-modes" role="group" aria-label={t('search.modes')}>
          {MODES.map((m) => (
            <button
              key={m}
              className={mode === m ? 'active' : ''}
              onClick={() => setMode(m)}
              title={modeHint(m)}
              aria-pressed={mode === m}
            >
              {modeLabel(m)}
            </button>
          ))}
        </div>
        {text && (
          <button className="link" onClick={clear} aria-label={t('search.clear')} title={t('search.clear')}>
            ✕
          </button>
        )}
      </div>

      {results && (
        <div className="s-results">
          <div className="s-count" role="status">
            {busy
              ? t('search.searching')
              : t('search.count', { n: results.length }) + (results.length === 200 ? ` ${t('search.max')}` : '')}
          </div>
          {error && (
            <div className="s-error" role="alert">
              {t('search.failed')}
              <pre>{(error.stderr || error.stdout).trim() || error.cmd}</pre>
            </div>
          )}
          <ul className="s-list">
            {results.length === 0 && !busy && !error && <li className="mini">{t('search.noResults')}</li>}
            {results.map((c) => (
              <li key={c.hash}>
                <button className="s-row" onClick={() => onPick(c.hash)}>
                  <span className="s-sha">{c.short}</span>
                  <span className="s-subject">{c.subject}</span>
                  <span className="s-author">{c.author}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default SearchBar

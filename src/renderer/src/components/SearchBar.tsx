import { useCallback, useEffect, useRef, useState } from 'react'
import type { Commit, SearchMode } from '@shared/types'

const MODES: { key: SearchMode; label: string; hint: string }[] = [
  { key: 'message', label: 'mensaje', hint: 'texto en el mensaje del commit' },
  { key: 'author', label: 'autor', hint: 'nombre o email del autor' },
  { key: 'content', label: 'contenido', hint: 'código que el commit agregó o quitó (-S)' },
  { key: 'file', label: 'archivo', hint: 'commits que tocaron rutas con ese texto' },
  { key: 'hash', label: 'hash', hint: 'sha, rama, tag o revisión (HEAD~2…)' }
]

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
  const [mode, setMode] = useState<SearchMode>('message')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const req = useRef(0) // descarta respuestas de búsquedas ya superadas

  const search = useCallback(
    async (m: SearchMode, t: string) => {
      const id = ++req.current
      if (!t.trim()) {
        onResults(null)
        return
      }
      setBusy(true)
      const found = await window.api.searchCommits(repoPath, m, t)
      // si mientras tanto se tecleó de nuevo, esta respuesta ya no vale
      if (id === req.current) {
        onResults(found)
        setBusy(false)
      }
    },
    [repoPath, onResults]
  )

  // busca sola tras dejar de teclear (300ms), sin castigar cada pulsación
  useEffect(() => {
    const t = setTimeout(() => search(mode, text), 300)
    return () => clearTimeout(t)
  }, [mode, text, search])

  const clear = useCallback(() => {
    setText('')
    onResults(null)
  }, [onResults])

  return (
    <div className="search-wrap">
      <div className="search-bar">
        <span className="s-icon">⌕</span>
        <input
          className="s-input"
          placeholder={MODES.find((m) => m.key === mode)?.hint}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') clear()
          }}
        />
        <div className="s-modes">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={mode === m.key ? 'active' : ''}
              onClick={() => setMode(m.key)}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </div>
        {text && (
          <button className="link" onClick={clear} title="limpiar búsqueda (Esc)">
            ✕
          </button>
        )}
      </div>

      {results && (
        <div className="s-results">
          <div className="s-count">
            {busy
              ? 'buscando…'
              : `${results.length} commit(s)${results.length === 200 ? ' (máx.)' : ''}`}
          </div>
          <ul className="s-list">
            {results.length === 0 && !busy && <li className="mini">sin resultados</li>}
            {results.map((c) => (
              <li key={c.hash} className="s-row" onClick={() => onPick(c.hash)}>
                <span className="s-sha">{c.short}</span>
                <span className="s-subject">{c.subject}</span>
                <span className="s-author">{c.author}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default SearchBar

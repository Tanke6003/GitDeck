import { useMemo } from 'react'
import type { Commit } from '@shared/types'
import { computeGraph } from '../lib/graph'
import { parseRef, relativeTime } from '../lib/format'
import { useI18n } from '../lib/i18n'

const ROW_H = 28
const COL_W = 18
const PAD_X = 14
const NODE_R = 4.5

// paleta de carriles: variables de tema (--lane-0..7), no hex fijos,
// para que el grafo siga al tema claro/oscuro igual que el resto de la UI.
// OJO: hay que aplicarlas via `style` (CSS), no como atributo de presentacion
// SVG (stroke=/fill=): Chromium no resuelve var() en atributos de presentacion,
// asi que stroke caeria a `none` (lineas invisibles) y fill a negro.
const LANES = 8
const laneColor = (col: number): string => `var(--lane-${col % LANES})`

const x = (col: number): number => PAD_X + col * COL_W
const yNode = (row: number): number => row * ROW_H + ROW_H / 2

/** Bezier suave entre dos puntos (transicion de carril). */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) return `M${x1},${y1} L${x2},${y2}`
  const my = (y1 + y2) / 2
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`
}

interface Props {
  commits: Commit[]
  /** nombres de remotos, para clasificar bien las refs (local vs remota) */
  remotes: string[]
  selected: string | null
  onSelect: (hash: string) => void
}

/**
 * Dibuja el arbol de commits: un SVG decorativo con los carriles a la izquierda
 * y, alineada fila a fila, la info del commit (refs, subject, autor, fecha).
 * Cada fila es un boton real: el grafo se navega tambien con teclado.
 */
function CommitGraph({ commits, remotes, selected, onSelect }: Props): JSX.Element {
  const { t, lang } = useI18n()
  const graph = useMemo(() => computeGraph(commits), [commits])
  const { rows, width } = graph
  const gutter = PAD_X * 2 + Math.max(width, 1) * COL_W
  const height = rows.length * ROW_H

  // aristas + nodos
  const paths: JSX.Element[] = []
  const nodes: JSX.Element[] = []

  rows.forEach((r, i) => {
    const yc = yNode(i)
    const yTop = yc - ROW_H / 2
    const yBot = yc + ROW_H / 2

    // mitad superior: conecta lo que entra por arriba con el nodo
    r.before.forEach((h, c) => {
      if (!h) return
      if (h === r.commit.hash) {
        // arista entrante que termina en este commit
        paths.push(
          <path
            key={`t-${i}-${c}`}
            d={curve(x(c), yTop, x(r.col), yc)}
            style={{ stroke: laneColor(c) }}
            fill="none"
            strokeWidth={1.6}
          />
        )
      } else {
        // carril que solo pasa de largo
        paths.push(
          <line key={`t-${i}-${c}`} x1={x(c)} y1={yTop} x2={x(c)} y2={yc} style={{ stroke: laneColor(c) }} strokeWidth={1.6} />
        )
      }
    })

    // mitad inferior, parte A: carriles que solo pasan de largo (verticales)
    r.after.forEach((h, c) => {
      if (!h) return
      if (r.before[c] === h && h !== r.commit.hash) {
        paths.push(
          <line key={`bp-${i}-${c}`} x1={x(c)} y1={yc} x2={x(c)} y2={yBot} style={{ stroke: laneColor(c) }} strokeWidth={1.6} />
        )
      }
    })

    // mitad inferior, parte B: una arista del nodo hacia cada padre (recta o
    // diagonal de convergencia). Aqui es donde las ramas se unen a su ancestro.
    r.parentCols.forEach((pc, k) => {
      paths.push(
        <path
          key={`be-${i}-${k}`}
          d={curve(x(r.col), yc, x(pc), yBot)}
          style={{ stroke: laneColor(pc) }}
          fill="none"
          strokeWidth={1.6}
        />
      )
    })

    const isMerge = r.commit.parents.length > 1
    nodes.push(
      <circle
        key={`n-${i}`}
        cx={x(r.col)}
        cy={yc}
        r={NODE_R}
        style={{ fill: isMerge ? 'var(--graph-bg)' : laneColor(r.col), stroke: laneColor(r.col) }}
        strokeWidth={isMerge ? 2 : 1}
      />
    )
  })

  if (rows.length === 0) {
    return <div className="graph-empty">{t('graph.empty')}</div>
  }

  return (
    <div className="commit-graph" style={{ height }}>
      <svg className="graph-svg" width={gutter} height={height} style={{ width: gutter }} aria-hidden="true">
        {paths}
        {nodes}
      </svg>

      <div className="commit-rows" style={{ marginLeft: gutter }}>
        {rows.map((r) => (
          <button
            key={r.commit.hash}
            className={`commit-row ${selected === r.commit.hash ? 'active' : ''}`}
            style={{ height: ROW_H }}
            onClick={() => onSelect(r.commit.hash)}
            title={r.commit.subject}
          >
            {r.commit.refs.map((raw) => {
              const ref = parseRef(raw, remotes)
              return (
                <span key={raw} className={`ref-chip ${ref.kind}`}>
                  {ref.label}
                </span>
              )
            })}
            <span className="commit-subject">{r.commit.subject}</span>
            <span className="commit-meta">
              <span className="commit-author">{r.commit.author}</span>
              <span className="commit-date">{relativeTime(r.commit.timestamp, lang)}</span>
              <span className="commit-sha">{r.commit.short}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default CommitGraph

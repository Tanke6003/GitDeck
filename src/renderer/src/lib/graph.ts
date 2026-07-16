import type { Commit } from '@shared/types'

/**
 * Layout de una fila del grafo.
 *  - col:        columna (carril) donde va el nodo del commit
 *  - before:     estado de los carriles ENTRANDO a la fila (arriba del nodo)
 *  - after:      estado de los carriles SALIENDO de la fila (abajo del nodo)
 *  - parentCols: columna destino de CADA padre (para dibujar la arista saliente).
 *                Incluye el caso "el padre ya tenia carril abierto" (ancestro
 *                compartido / merge): asi las ramas convergen visualmente en vez
 *                de quedar como lineas paralelas sueltas.
 *
 * Cada carril guarda el hash del commit que "espera" a continuacion, o null.
 */
export interface RowLayout {
  commit: Commit
  col: number
  before: (string | null)[]
  after: (string | null)[]
  parentCols: number[]
}

export interface Graph {
  rows: RowLayout[]
  /** numero de columnas ocupadas (ancho del grafo) */
  width: number
}

/**
 * Asigna carriles a una lista de commits ordenada newest-first (--date-order).
 * Algoritmo de una sola pasada, estilo `git log --graph`.
 */
export function computeGraph(commits: Commit[]): Graph {
  const lanes: (string | null)[] = []
  const rows: RowLayout[] = []
  let width = 0

  const firstFree = (): number => {
    const idx = lanes.indexOf(null)
    return idx === -1 ? lanes.length : idx
  }

  for (const commit of commits) {
    const before = lanes.slice()

    // columna del nodo: el carril que ya esperaba a este commit, o uno libre
    let myCol = lanes.indexOf(commit.hash)
    if (myCol === -1) myCol = firstFree()

    // cerrar TODOS los carriles que apuntaban a este commit (aristas entrantes)
    for (let j = 0; j < lanes.length; j++) {
      if (lanes[j] === commit.hash) lanes[j] = null
    }

    // abrir / conectar carriles para los padres
    const parentCols: number[] = []
    commit.parents.forEach((parent, idx) => {
      const existing = lanes.indexOf(parent)
      if (existing !== -1) {
        // el padre ya tiene carril (ancestro compartido / merge): conectar ahi
        parentCols.push(existing)
        return
      }
      const target = idx === 0 && lanes[myCol] === null ? myCol : firstFree()
      lanes[target] = parent
      parentCols.push(target)
    })

    // recortar nulls al final para no ensanchar de mas
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()

    const after = lanes.slice()
    width = Math.max(width, before.length, after.length, myCol + 1, ...parentCols.map((c) => c + 1))
    rows.push({ commit, col: myCol, before, after, parentCols })
  }

  // igualar el ancho de todos los snapshots
  for (const r of rows) {
    while (r.before.length < width) r.before.push(null)
    while (r.after.length < width) r.after.push(null)
  }

  return { rows, width }
}

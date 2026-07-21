import { describe, expect, it } from 'vitest'
import { computeGraph } from '../graph'
import type { Commit } from '@shared/types'

/** commit minimo para el layout (solo hash/parents importan) */
function mk(hash: string, parents: string[]): Commit {
  return { hash, short: hash.slice(0, 7), parents, author: 'a', email: 'a@x', timestamp: 1, refs: [], subject: hash }
}

describe('computeGraph', () => {
  it('una historia lineal ocupa un solo carril', () => {
    const commits = [mk('c3', ['c2']), mk('c2', ['c1']), mk('c1', [])]
    const g = computeGraph(commits)
    expect(g.width).toBe(1)
    expect(g.rows.map((r) => r.col)).toEqual([0, 0, 0])
    // cada commit conecta con su padre en el mismo carril
    expect(g.rows[0].parentCols).toEqual([0])
    expect(g.rows[2].parentCols).toEqual([])
  })

  it('un merge abre un segundo carril y las ramas convergen en el ancestro', () => {
    // newest-first: merge M(a,b), a(base), b(base), base
    const commits = [mk('m', ['a', 'b']), mk('a', ['base']), mk('b', ['base']), mk('base', [])]
    const g = computeGraph(commits)
    expect(g.width).toBe(2)
    const [m, a, b, base] = g.rows
    expect(m.col).toBe(0)
    // el merge apunta a sus dos padres en carriles distintos
    expect(m.parentCols).toHaveLength(2)
    expect(new Set(m.parentCols).size).toBe(2)
    expect(a.col).toBe(0)
    expect(b.col).toBe(1)
    // b converge al carril donde ya esperaba base (no abre un tercero)
    expect(b.parentCols).toEqual([0])
    expect(base.col).toBe(0)
  })

  it('reutiliza carriles liberados en vez de crecer sin fin', () => {
    // dos ramas cortas seguidas: la segunda debe reusar el carril 1
    const commits = [
      mk('m2', ['c2', 'f2']),
      mk('f2', ['c2']),
      mk('c2', ['m1']),
      mk('m1', ['c1', 'f1']),
      mk('f1', ['c1']),
      mk('c1', [])
    ]
    const g = computeGraph(commits)
    expect(g.width).toBe(2)
  })

  it('los snapshots before/after quedan igualados al ancho total', () => {
    const commits = [mk('m', ['a', 'b']), mk('a', ['base']), mk('b', ['base']), mk('base', [])]
    const g = computeGraph(commits)
    for (const r of g.rows) {
      expect(r.before).toHaveLength(g.width)
      expect(r.after).toHaveLength(g.width)
    }
  })

  it('lista vacia produce grafo vacio', () => {
    expect(computeGraph([])).toEqual({ rows: [], width: 0 })
  })
})

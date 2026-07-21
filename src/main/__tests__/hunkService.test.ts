import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Fixture } from './fixture'
import { applyHunk, getFileHunks } from '../hunkService'

/** archivo largo para que dos cambios lejanos den dos hunks separados */
const BASE = Array.from({ length: 20 }, (_, i) => `linea ${i + 1}`).join('\n') + '\n'
/** cambia la linea 2 y la 19: quedan lejos => 2 hunks */
const CHANGED = BASE.replace('linea 2\n', 'linea 2 CAMBIADA\n').replace(
  'linea 19\n',
  'linea 19 CAMBIADA\n'
)

describe('hunkService', () => {
  let fx: Fixture

  beforeEach(() => {
    fx = new Fixture()
    fx.commit('base', { 'f.txt': BASE })
  })
  afterEach(() => fx.cleanup())

  it('trocea el diff en un hunk por cada zona de cambios', async () => {
    fx.write('f.txt', CHANGED)
    const diff = (await getFileHunks(fx.dir, 'f.txt')).data

    expect(diff).not.toBeNull()
    expect(diff!.hunks).toHaveLength(2)
    expect(diff!.binary).toBe(false)
    // la cabecera del parche es lo que se reenvia a git apply
    expect(diff!.header).toContain('diff --git a/f.txt b/f.txt')
    expect(diff!.header).toContain('--- a/f.txt')
    expect(diff!.header).toContain('+++ b/f.txt')
    // cada hunk empieza por su @@ y cuenta 1 linea agregada y 1 quitada
    for (const h of diff!.hunks) {
      expect(h.header).toMatch(/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/)
      expect(h.text.startsWith('@@')).toBe(true)
      expect(h.added).toBe(1)
      expect(h.removed).toBe(1)
    }
  })

  it('prepara un solo hunk y deja el otro sin preparar', async () => {
    fx.write('f.txt', CHANGED)
    const diff = (await getFileHunks(fx.dir, 'f.txt')).data

    // preparar SOLO el segundo hunk (el de la linea 19)
    const res = await applyHunk(fx.dir, diff!, 1)
    expect(res.ok).toBe(true)

    const staged = fx.git('diff', '--cached', '--no-color')
    expect(staged).toContain('+linea 19 CAMBIADA')
    expect(staged).not.toContain('+linea 2 CAMBIADA')

    // el primero sigue vivo en el working tree, sin preparar
    const unstaged = fx.git('diff', '--no-color')
    expect(unstaged).toContain('+linea 2 CAMBIADA')
    expect(unstaged).not.toContain('+linea 19 CAMBIADA')
  })

  it('quita del staging un solo hunk sin tocar el archivo en disco', async () => {
    fx.write('f.txt', CHANGED)
    fx.git('add', 'f.txt') // los 2 hunks preparados

    const cached = (await getFileHunks(fx.dir, 'f.txt', true)).data
    expect(cached!.hunks).toHaveLength(2)

    // quitar solo el primero (reverse sobre el index)
    const res = await applyHunk(fx.dir, cached!, 0, true)
    expect(res.ok).toBe(true)

    const staged = fx.git('diff', '--cached', '--no-color')
    expect(staged).not.toContain('+linea 2 CAMBIADA')
    expect(staged).toContain('+linea 19 CAMBIADA')

    // lo importante: el archivo de trabajo conserva LOS DOS cambios
    const disk = fx.git('show', ':f.txt') // contenido del index
    expect(disk).not.toContain('linea 2 CAMBIADA')
    const unstaged = fx.git('diff', '--no-color')
    expect(unstaged).toContain('+linea 2 CAMBIADA')
  })

  it('preparar un hunk no arrastra los cambios de otro archivo', async () => {
    fx.commit('otro archivo', { 'g.txt': 'uno\n' })
    fx.write('f.txt', CHANGED)
    fx.write('g.txt', 'uno CAMBIADO\n')

    const diff = (await getFileHunks(fx.dir, 'f.txt')).data
    await applyHunk(fx.dir, diff!, 0)

    const staged = fx.git('diff', '--cached', '--name-only').trim()
    expect(staged).toBe('f.txt')
  })

  it('devuelve null (sin error) cuando el archivo no tiene cambios', async () => {
    const r = await getFileHunks(fx.dir, 'f.txt')
    expect(r.data).toBeNull()
    expect(r.error).toBeNull()
  })

  it('conserva el marcador de "sin salto de linea al final"', async () => {
    // sin \n final: git emite "\ No newline at end of file" dentro del hunk
    fx.commit('sin salto', { 'n.txt': 'una linea' })
    fx.write('n.txt', 'otra linea')

    const diff = (await getFileHunks(fx.dir, 'n.txt')).data
    expect(diff!.hunks[0].text).toContain('\\ No newline at end of file')

    // y el parche reconstruido sigue aplicando
    const res = await applyHunk(fx.dir, diff!, 0)
    expect(res.ok).toBe(true)
    expect(fx.git('diff', '--cached', '--no-color')).toContain('+otra linea')
  })

  it('reporta el error de git en vez de lanzar si el hunk no existe', async () => {
    fx.write('f.txt', CHANGED)
    const diff = (await getFileHunks(fx.dir, 'f.txt')).data
    const res = await applyHunk(fx.dir, diff!, 99)
    expect(res.ok).toBe(false)
    expect(res.stderr).toContain('no existe el hunk')
  })
})

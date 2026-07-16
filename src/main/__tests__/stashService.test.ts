import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Fixture } from './fixture'
import { applyStash, dropStash, listStashes, popStash, pushStash, showStash } from '../stashService'

describe('stashService', () => {
  let fx: Fixture

  beforeEach(() => {
    fx = new Fixture()
    fx.commit('base', { 'f.txt': 'v1\n' })
  })
  afterEach(() => fx.cleanup())

  it('guarda con mensaje propio y lo lee limpio', async () => {
    fx.write('f.txt', 'v2\n')
    const res = await pushStash(fx.dir, 'mi trabajo a medias')
    expect(res.ok).toBe(true)

    const [s] = await listStashes(fx.dir)
    expect(s.ref).toBe('stash@{0}')
    expect(s.index).toBe(0)
    expect(s.branch).toBe('main')
    // el prefijo "On main: " no debe llegar a la UI
    expect(s.message).toBe('mi trabajo a medias')
    expect(s.date).toBeTruthy()
    // y el working tree vuelve a como estaba
    expect(fx.git('status', '--porcelain').trim()).toBe('')
  })

  it('sin mensaje, saca el asunto del WIP automatico', async () => {
    fx.write('f.txt', 'v2\n')
    await pushStash(fx.dir)

    const [s] = await listStashes(fx.dir)
    // git escribe "WIP on main: <sha> base": ni el sha ni el prefijo son el mensaje
    expect(s.message).toBe('base')
    expect(s.branch).toBe('main')
  })

  it('apila en orden: el mas reciente es el indice 0', async () => {
    fx.write('f.txt', 'v2\n')
    await pushStash(fx.dir, 'primero')
    fx.write('f.txt', 'v3\n')
    await pushStash(fx.dir, 'segundo')

    const list = await listStashes(fx.dir)
    expect(list.map((s) => s.message)).toEqual(['segundo', 'primero'])
    expect(list.map((s) => s.ref)).toEqual(['stash@{0}', 'stash@{1}'])
    expect(list.map((s) => s.index)).toEqual([0, 1])
  })

  it('-u incluye los archivos sin trackear', async () => {
    fx.write('nuevo.txt', 'nuevo\n')
    await pushStash(fx.dir, 'con untracked', true)

    // el archivo desaparece del working tree porque se lo llevo el stash
    expect(fx.git('status', '--porcelain').trim()).toBe('')
    const [s] = await listStashes(fx.dir)
    expect(s.message).toBe('con untracked')
  })

  it('apply deja el stash en la pila; pop lo saca', async () => {
    fx.write('f.txt', 'v2\n')
    await pushStash(fx.dir, 'x')

    const ap = await applyStash(fx.dir, 'stash@{0}')
    expect(ap.ok).toBe(true)
    expect(await listStashes(fx.dir)).toHaveLength(1)
    expect(fx.git('show', 'HEAD:f.txt')).toContain('v1')

    // limpiar el working tree antes del pop (si no, choca)
    fx.git('checkout', '--', 'f.txt')
    const po = await popStash(fx.dir, 'stash@{0}')
    expect(po.ok).toBe(true)
    expect(await listStashes(fx.dir)).toHaveLength(0)
  })

  it('drop descarta sin aplicar', async () => {
    fx.write('f.txt', 'v2\n')
    await pushStash(fx.dir, 'a tirar')

    const res = await dropStash(fx.dir, 'stash@{0}')
    expect(res.ok).toBe(true)
    expect(await listStashes(fx.dir)).toHaveLength(0)
    // no se aplico: el archivo sigue como en el commit
    expect(fx.git('status', '--porcelain').trim()).toBe('')
  })

  it('show devuelve el diff de lo guardado', async () => {
    fx.write('f.txt', 'v2\n')
    await pushStash(fx.dir, 'x')

    const res = await showStash(fx.dir, 'stash@{0}')
    expect(res.ok).toBe(true)
    expect(res.stdout).toContain('f.txt')
  })

  it('sin cambios que guardar no crea stash', async () => {
    await pushStash(fx.dir, 'nada')
    expect(await listStashes(fx.dir)).toHaveLength(0)
  })

  it('sin stashes devuelve lista vacia', async () => {
    expect(await listStashes(fx.dir)).toEqual([])
  })

  it('un mensaje con dos puntos no se parte mal', async () => {
    fx.write('f.txt', 'v2\n')
    await pushStash(fx.dir, 'fix: algo roto: en serio')

    const [s] = await listStashes(fx.dir)
    expect(s.message).toBe('fix: algo roto: en serio')
    expect(s.branch).toBe('main')
  })
})

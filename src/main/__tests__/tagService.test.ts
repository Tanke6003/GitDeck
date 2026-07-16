import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Fixture } from './fixture'
import { createTag, deleteTag, listTags } from '../tagService'

describe('tagService', () => {
  let fx: Fixture

  beforeEach(() => {
    fx = new Fixture()
  })
  afterEach(() => fx.cleanup())

  it('un tag ligero apunta al commit y no tiene mensaje', async () => {
    const sha = fx.commit('primero', { 'a.txt': 'a\n' })
    await createTag(fx.dir, 'v0.1.0')

    const [t] = await listTags(fx.dir)
    expect(t.name).toBe('v0.1.0')
    expect(t.annotated).toBe(false)
    expect(t.commit).toBe(sha)
    // clave: en un tag ligero contents:subject es el asunto del COMMIT.
    // Reportarlo como mensaje del tag seria mentir.
    expect(t.message).toBe('')
    expect(t.date).toBeTruthy()
  })

  it('un tag anotado reporta el commit apuntado, no su propio objeto', async () => {
    const sha = fx.commit('primero', { 'a.txt': 'a\n' })
    await createTag(fx.dir, 'v0.2.0', 'release dos')

    const [t] = await listTags(fx.dir)
    expect(t.annotated).toBe(true)
    expect(t.message).toBe('release dos')
    // el sha del objeto tag es distinto del sha del commit
    expect(t.commit).toBe(sha)
    const tagObject = fx.git('rev-parse', '--short', 'v0.2.0').trim()
    expect(tagObject).not.toBe(sha)
  })

  it('ordena los mas nuevos primero', async () => {
    fx.commit('uno', { 'a.txt': '1' })
    await createTag(fx.dir, 'v1.0.0', 'primero')
    fx.commit('dos', { 'a.txt': '2' })
    await createTag(fx.dir, 'v2.0.0', 'segundo')

    const names = (await listTags(fx.dir)).map((t) => t.name)
    expect(names).toEqual(['v2.0.0', 'v1.0.0'])
  })

  it('puede clavarse en un commit concreto en vez de HEAD', async () => {
    const primero = fx.commit('uno', { 'a.txt': '1' })
    fx.commit('dos', { 'a.txt': '2' })

    await createTag(fx.dir, 'v-viejo', 'en el primero', primero)
    const [t] = await listTags(fx.dir)
    expect(t.commit).toBe(primero)
  })

  it('conserva un mensaje multilinea (va por stdin, no por -m)', async () => {
    fx.commit('uno', { 'a.txt': '1' })
    await createTag(fx.dir, 'v1.0.0', 'titulo\n\ncuerpo del tag')

    // el subject es solo la primera linea; el cuerpo sigue en el objeto
    const [t] = await listTags(fx.dir)
    expect(t.message).toBe('titulo')
    expect(fx.git('tag', '-l', '-n99', 'v1.0.0')).toContain('cuerpo del tag')
  })

  it('borra un tag local', async () => {
    fx.commit('uno', { 'a.txt': '1' })
    await createTag(fx.dir, 'v1.0.0')
    expect(await listTags(fx.dir)).toHaveLength(1)

    const res = await deleteTag(fx.dir, 'v1.0.0')
    expect(res.ok).toBe(true)
    expect(await listTags(fx.dir)).toHaveLength(0)
  })

  it('sin tags devuelve lista vacia', async () => {
    fx.commit('uno', { 'a.txt': '1' })
    expect(await listTags(fx.dir)).toEqual([])
  })

  it('un nombre invalido falla sin reventar', async () => {
    fx.commit('uno', { 'a.txt': '1' })
    const res = await createTag(fx.dir, 'no validos')
    expect(res.ok).toBe(false)
    expect(await listTags(fx.dir)).toEqual([])
  })
})

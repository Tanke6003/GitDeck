import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Fixture } from './fixture'
import { getBlame, getReflog } from '../blameService'

describe('blameService', () => {
  let fx: Fixture

  beforeEach(() => {
    fx = new Fixture()
  })
  afterEach(() => fx.cleanup())

  describe('getBlame', () => {
    it('atribuye cada linea a quien la escribio', async () => {
      fx.as('Ana Lopez', 'ana@x.com')
      fx.commit('primero', { 'f.txt': 'uno\ndos\n' })
      fx.as('Bob Ruiz', 'bob@x.com')
      fx.commit('segundo', { 'f.txt': 'uno\ndos CAMBIADA\ntres\n' })

      const lines = await getBlame(fx.dir, 'f.txt')
      expect(lines).toHaveLength(3)

      expect(lines[0].content).toBe('uno')
      expect(lines[0].author).toBe('Ana Lopez')
      expect(lines[0].line).toBe(1)
      expect(lines[0].subject).toBe('primero')
      expect(lines[0].timestamp).toBeGreaterThan(0)
      expect(lines[0].short).toHaveLength(7)

      // las lineas que toco Bob son suyas
      expect(lines[1].content).toBe('dos CAMBIADA')
      expect(lines[1].author).toBe('Bob Ruiz')
      expect(lines[1].line).toBe(2)
      expect(lines[2].author).toBe('Bob Ruiz')

      // dos commits distintos => dos shas distintos
      expect(lines[0].hash).not.toBe(lines[1].hash)
    })

    it('mira el archivo tal como estaba en una revision', async () => {
      const primero = fx.commit('primero', { 'f.txt': 'uno\ndos\n' })
      fx.commit('segundo', { 'f.txt': 'uno\ndos\ntres\n' })

      const enPrimero = await getBlame(fx.dir, 'f.txt', primero)
      expect(enPrimero).toHaveLength(2) // "tres" aun no existia

      const enHead = await getBlame(fx.dir, 'f.txt')
      expect(enHead).toHaveLength(3)
    })

    it('no confunde "author-mail" con "author" al parsear', async () => {
      fx.as('Ana Lopez', 'ana@x.com')
      fx.commit('primero', { 'f.txt': 'uno\n' })

      const [l] = await getBlame(fx.dir, 'f.txt')
      // si el parser cazara "author-mail" primero, aqui saldria "<ana@x.com>"
      expect(l.author).toBe('Ana Lopez')
    })

    it('una linea que empieza por @@ no se confunde con una cabecera', async () => {
      fx.commit('raro', { 'f.txt': '@@ -1,5 +1,5 @@ esto es contenido\nnormal\n' })

      const lines = await getBlame(fx.dir, 'f.txt')
      expect(lines).toHaveLength(2)
      expect(lines[0].content).toBe('@@ -1,5 +1,5 @@ esto es contenido')
    })

    it('conserva la indentacion de las lineas', async () => {
      fx.commit('indentado', { 'f.txt': 'sin\n    con cuatro\n\tcon tab\n' })

      const lines = await getBlame(fx.dir, 'f.txt')
      expect(lines[1].content).toBe('    con cuatro')
      expect(lines[2].content).toBe('\tcon tab')
    })

    it('un archivo inexistente da lista vacia en vez de reventar', async () => {
      fx.commit('base', { 'f.txt': 'x\n' })
      expect(await getBlame(fx.dir, 'no-existe.txt')).toEqual([])
    })
  })

  describe('getReflog', () => {
    it('lista por donde paso HEAD, lo mas reciente primero', async () => {
      fx.commit('primero', { 'a.txt': 'a\n' })
      fx.commit('segundo', { 'b.txt': 'b\n' })

      const log = await getReflog(fx.dir)
      expect(log.length).toBeGreaterThanOrEqual(2)
      expect(log[0].ref).toBe('HEAD@{0}')
      expect(log[0].subject).toBe('segundo')
      expect(log[0].action).toContain('commit')
      expect(log[0].short).toBeTruthy()
      expect(log[0].date).toBeTruthy()
    })

    it('tras un reset, la entrada anterior aun apunta al commit perdido', async () => {
      fx.commit('primero', { 'a.txt': 'a\n' })
      const perdido = fx.commit('se va a perder', { 'b.txt': 'b\n' })
      fx.git('reset', '--hard', '-q', 'HEAD~1')

      const log = await getReflog(fx.dir)
      expect(log[0].action).toContain('reset')

      // esto es lo que hace util al reflog: HEAD@{1} recupera el commit
      // aunque ninguna rama lo apunte
      const entrada = log[1]
      expect(entrada.short).toBe(perdido)
      const resuelto = fx.git('rev-parse', '--short', entrada.ref).trim()
      expect(resuelto).toBe(perdido)
    })

    it('respeta el limite', async () => {
      fx.commit('uno', { 'a.txt': '1' })
      fx.commit('dos', { 'a.txt': '2' })
      fx.commit('tres', { 'a.txt': '3' })
      expect(await getReflog(fx.dir, 2)).toHaveLength(2)
    })
  })
})

import { describe, expect, it } from 'vitest'
import { mapLimit, withRepoLock } from '../repoQueue'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('repoQueue', () => {
  describe('withRepoLock', () => {
    it('serializa operaciones del MISMO repo', async () => {
      const order: string[] = []
      const first = withRepoLock('C:/repo', async () => {
        order.push('a:inicio')
        await sleep(30)
        order.push('a:fin')
      })
      const second = withRepoLock('C:/repo', async () => {
        order.push('b:inicio')
      })
      await Promise.all([first, second])
      // b no puede empezar hasta que a termino
      expect(order).toEqual(['a:inicio', 'a:fin', 'b:inicio'])
    })

    it('repos distintos corren en paralelo', async () => {
      const order: string[] = []
      const a = withRepoLock('C:/uno', async () => {
        await sleep(30)
        order.push('uno')
      })
      const b = withRepoLock('C:/dos', async () => {
        order.push('dos')
      })
      await Promise.all([a, b])
      expect(order).toEqual(['dos', 'uno'])
    })

    it('en Windows la misma ruta con otras mayusculas es el mismo repo', async () => {
      const order: string[] = []
      const a = withRepoLock('C:/Repo', async () => {
        await sleep(20)
        order.push('a')
      })
      const b = withRepoLock('c:/repo', async () => {
        order.push('b')
      })
      await Promise.all([a, b])
      expect(order).toEqual(['a', 'b'])
    })

    it('un fallo no atasca la cola', async () => {
      await expect(
        withRepoLock('C:/x', async () => {
          throw new Error('boom')
        })
      ).rejects.toThrow('boom')
      const res = await withRepoLock('C:/x', async () => 42)
      expect(res).toBe(42)
    })
  })

  describe('mapLimit', () => {
    it('respeta el tope de concurrencia y el orden de resultados', async () => {
      let running = 0
      let peak = 0
      const items = [1, 2, 3, 4, 5, 6, 7, 8]
      const results = await mapLimit(items, 3, async (n) => {
        running++
        peak = Math.max(peak, running)
        await sleep(10)
        running--
        return n * 2
      })
      expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
      expect(peak).toBeLessThanOrEqual(3)
    })

    it('lista vacia devuelve lista vacia', async () => {
      expect(await mapLimit([], 4, async (x) => x)).toEqual([])
    })
  })
})

/**
 * Serializacion de operaciones git por repo.
 *
 * Dos procesos git ESCRIBIENDO a la vez sobre el mismo repo chocan por
 * `.git/index.lock` (p. ej. un fetch en curso y un stash drop lanzado desde
 * otro panel). La invariante "una escritura a la vez por repo" vive aqui, en el
 * main, y no depende de que cada componente del renderer coordine su `busy`.
 */

const chains = new Map<string, Promise<unknown>>()

/**
 * Encadena `fn` detras de la ultima operacion pendiente del mismo repo.
 * Las operaciones de repos distintos siguen corriendo en paralelo.
 */
export function withRepoLock<T>(repo: string, fn: () => Promise<T>): Promise<T> {
  const key = repo.toLowerCase() // en Windows la misma ruta puede variar de mayusculas
  const prev = chains.get(key) ?? Promise.resolve()
  // el siguiente corre pase lo que pase con el anterior (los GitResult no rechazan,
  // pero un throw inesperado no debe dejar la cola atascada)
  const next = prev.then(fn, fn)
  chains.set(
    key,
    next.catch(() => undefined)
  )
  return next
}

/**
 * map con tope de concurrencia. `repos:list` lanzaba un git por repo sin
 * limite: con decenas de repos eso son decenas de procesos simultaneos al
 * arrancar y en cada focus de la ventana.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

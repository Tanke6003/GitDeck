import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

/**
 * Persistencia de los alias marcados como favoritos.
 * Se guarda en userData/favorites.json (fuera de cualquier repo git y
 * separado de la config de git: un favorito es preferencia de la app, no del repo).
 */
function storeFile(): string {
  return join(app.getPath('userData'), 'favorites.json')
}

export async function loadFavorites(): Promise<string[]> {
  try {
    const raw = await fs.readFile(storeFile(), 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data?.aliases) ? (data.aliases as string[]) : []
  } catch {
    // archivo inexistente o corrupto -> sin favoritos
    return []
  }
}

export async function saveFavorites(names: string[]): Promise<void> {
  const unique = Array.from(new Set(names))
  await fs.writeFile(storeFile(), JSON.stringify({ aliases: unique }, null, 2), 'utf-8')
}

/** Marca/desmarca un alias como favorito. Devuelve la lista resultante. */
export async function toggleFavorite(name: string): Promise<string[]> {
  const current = await loadFavorites()
  const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
  await saveFavorites(next)
  return next
}

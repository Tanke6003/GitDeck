import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

/**
 * Persistencia simple de la lista de repos abiertos.
 * Se guarda en userData/repos.json (fuera de cualquier repo git).
 */
function storeFile(): string {
  return join(app.getPath('userData'), 'repos.json')
}

export async function loadRepoPaths(): Promise<string[]> {
  try {
    const raw = await fs.readFile(storeFile(), 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data?.repos) ? (data.repos as string[]) : []
  } catch {
    // archivo inexistente o corrupto -> lista vacia
    return []
  }
}

export async function saveRepoPaths(paths: string[]): Promise<void> {
  const unique = Array.from(new Set(paths))
  await fs.writeFile(storeFile(), JSON.stringify({ repos: unique }, null, 2), 'utf-8')
}

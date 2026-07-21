import { promises as fs, type Dirent } from 'fs'
import { basename, join, normalize } from 'path'
import { runGit } from './gitRunner'
import type { RepoInfo } from '@shared/types'

/** ¿La carpeta es la raiz (o esta dentro) de un repo git? */
export async function isRepo(dir: string): Promise<boolean> {
  const res = await runGit(['rev-parse', '--is-inside-work-tree'], dir)
  return res.ok && res.stdout.trim() === 'true'
}

/**
 * Lee rama, HEAD y estado de un repo. Marca valid:false si dejo de serlo.
 *
 * Una sola llamada a git: `status --porcelain=v2 --branch` trae rama, oid y
 * archivos cambiados de una pasada. Antes eran 4 procesos por repo, y con N
 * repos el arranque (y cada focus de la ventana) lanzaba 4·N gits a la vez.
 */
export async function getRepoInfo(dir: string): Promise<RepoInfo> {
  const path = normalize(dir)
  const name = basename(path)

  const res = await runGit(['status', '--porcelain=v2', '--branch'], path)
  if (!res.ok) {
    return {
      path,
      name,
      currentBranch: null,
      head: null,
      dirty: false,
      valid: false,
      error: res.stderr.trim() || 'not a git repository'
    }
  }

  let branch: string | null = null
  let head: string | null = null
  let dirty = false
  for (const line of res.stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const b = line.slice('# branch.head '.length).trim()
      branch = b === '(detached)' ? null : b
    } else if (line.startsWith('# branch.oid ')) {
      const oid = line.slice('# branch.oid '.length).trim()
      head = oid === '(initial)' ? null : oid.slice(0, 7) // (initial) => repo sin commits
    } else if (line.trim() && !line.startsWith('#')) {
      dirty = true // cualquier entrada que no sea cabecera es un cambio
    }
  }

  return { path, name, currentBranch: branch, head, dirty, valid: true }
}

/**
 * Descubre repos dentro de una carpeta: la propia carpeta si es repo,
 * mas cada subcarpeta de primer nivel que sea repo.
 */
export async function discoverRepos(parentDir: string): Promise<string[]> {
  const found = new Set<string>()

  if (await isRepo(parentDir)) found.add(normalize(parentDir))

  let entries: Dirent[] = []
  try {
    entries = await fs.readdir(parentDir, { withFileTypes: true })
  } catch {
    return Array.from(found)
  }

  await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => {
        const full = join(parentDir, e.name)
        if (await isRepo(full)) found.add(normalize(full))
      })
  )

  return Array.from(found)
}

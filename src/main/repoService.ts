import { promises as fs, type Dirent } from 'fs'
import { basename, join, normalize } from 'path'
import { runGit } from './gitRunner'
import type { RepoInfo } from '@shared/types'

/** ¿La carpeta es la raiz (o esta dentro) de un repo git? */
export async function isRepo(dir: string): Promise<boolean> {
  const res = await runGit(['rev-parse', '--is-inside-work-tree'], dir)
  return res.ok && res.stdout.trim() === 'true'
}

/** Lee rama, HEAD y estado de un repo. Marca valid:false si dejo de serlo. */
export async function getRepoInfo(dir: string): Promise<RepoInfo> {
  const path = normalize(dir)
  const name = basename(path)

  if (!(await isRepo(path))) {
    return {
      path,
      name,
      currentBranch: null,
      head: null,
      dirty: false,
      valid: false,
      error: 'No es un repositorio git (movido o borrado)'
    }
  }

  const [branchRes, headRes, statusRes] = await Promise.all([
    runGit(['branch', '--show-current'], path),
    runGit(['rev-parse', '--short', 'HEAD'], path),
    runGit(['status', '--porcelain'], path)
  ])

  const branch = branchRes.stdout.trim()
  return {
    path,
    name,
    currentBranch: branch.length > 0 ? branch : null, // vacio => detached
    head: headRes.ok ? headRes.stdout.trim() : null, // falla => repo sin commits
    dirty: statusRes.stdout.trim().length > 0,
    valid: true
  }
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

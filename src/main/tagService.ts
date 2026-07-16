import { runGit, runGitStdin } from './gitRunner'
import type { GitResult, TagInfo } from '@shared/types'

/** separador de campos poco probable en el contenido (unit separator) */
const SEP = '\x1f'

/**
 * Lista los tags con su commit y, si es anotado, su mensaje y fecha.
 *
 * Un tag ligero apunta directo al commit; uno anotado es un objeto propio. Por eso
 * pedimos los dos juegos de campos: `*objectname`/`*subject` (con asterisco) traen
 * los datos del commit apuntado cuando el tag es anotado, y quedan vacios cuando es
 * ligero — ahi sirven `objectname`/`subject` a secas.
 */
export async function listTags(repo: string): Promise<TagInfo[]> {
  const fmt = [
    '%(refname:short)',
    '%(objecttype)',
    '%(objectname:short)',
    '%(*objectname:short)',
    '%(contents:subject)',
    '%(*creatordate:relative)',
    '%(creatordate:relative)'
  ].join(SEP)
  // -creatordate: los mas nuevos primero
  const res = await runGit(['for-each-ref', `--format=${fmt}`, '--sort=-creatordate', 'refs/tags'], repo)
  if (!res.ok) return []

  const out: TagInfo[] = []
  for (const line of res.stdout.split('\n')) {
    if (!line.trim()) continue
    const [name, type, own, pointed, subject, annDate, liteDate] = line.split(SEP)
    const annotated = type === 'tag'
    out.push({
      name,
      // en un tag anotado el commit real es el apuntado (*objectname)
      commit: (annotated ? pointed : own) || own || '',
      annotated,
      message: annotated ? (subject ?? '') : '',
      date: (annotated ? annDate : liteDate) || ''
    })
  }
  return out
}

/**
 * Crea un tag. Con `message` es anotado (-a -F -), si no, ligero.
 * @param target commit/rama donde clavarlo; por defecto HEAD.
 */
export function createTag(
  repo: string,
  name: string,
  message?: string,
  target?: string
): Promise<GitResult> {
  const ref = target && target.trim() ? [target.trim()] : []
  if (message && message.trim()) {
    // el mensaje va por stdin (-F -) para respetar saltos de linea y UTF-8
    return runGitStdin(['tag', '-a', name, '-F', '-', ...ref], repo, message)
  }
  return runGit(['tag', name, ...ref], repo)
}

/** Borra un tag local. */
export const deleteTag = (repo: string, name: string): Promise<GitResult> =>
  runGit(['tag', '-d', name], repo)

/** timeout amplio: toca la red */
const NET_TIMEOUT = 180_000

/** Borra un tag en el remoto. */
export const deleteRemoteTag = (repo: string, remote: string, name: string): Promise<GitResult> =>
  runGit(['push', remote, '--delete', name], repo, undefined, NET_TIMEOUT)

/** Publica un tag concreto en el remoto. */
export const pushTag = (repo: string, remote: string, name: string): Promise<GitResult> =>
  runGit(['push', remote, name], repo, undefined, NET_TIMEOUT)

/** Publica TODOS los tags locales que falten en el remoto. */
export const pushAllTags = (repo: string, remote: string): Promise<GitResult> =>
  runGit(['push', remote, '--tags'], repo, undefined, NET_TIMEOUT)

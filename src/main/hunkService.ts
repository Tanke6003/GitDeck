import { runGit, runGitStdin } from './gitRunner'
import { readErr, readOk } from '@shared/types'
import type { FileDiff, GitResult, Hunk, ReadResult } from '@shared/types'

/** cabecera de hunk: "@@ -a,b +c,d @@ contexto" */
const HUNK_RE = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/

/**
 * Lee el diff de UN archivo y lo trocea en hunks.
 *
 * @param cached false = index vs working tree (lo que se puede preparar)
 *               true  = HEAD vs index (lo que se puede quitar del staging)
 *
 * Se pide sin color: el texto se reenvia tal cual a `git apply`, y los codigos
 * ANSI lo romperian. El coloreado lo hace el renderer.
 */
export async function getFileHunks(
  repo: string,
  path: string,
  cached = false
): Promise<ReadResult<FileDiff | null>> {
  const args = ['diff', '--no-color']
  if (cached) args.push('--cached')
  args.push('--', path)

  const res = await runGit(args, repo)
  // distinguir "git fallo" (error) de "no hay diff para este archivo" (null)
  if (!res.ok) return readErr(null, res)
  if (!res.stdout.trim()) return readOk(null)

  const lines = res.stdout.split('\n')
  const header: string[] = []
  const hunks: Hunk[] = []
  let cur: string[] | null = null

  const flush = (): void => {
    if (!cur) return
    const text = cur.join('\n')
    hunks.push({
      index: hunks.length,
      header: cur[0],
      text,
      added: cur.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length,
      removed: cur.filter((l) => l.startsWith('-') && !l.startsWith('---')).length
    })
    cur = null
  }

  for (const line of lines) {
    if (HUNK_RE.test(line)) {
      flush()
      cur = [line]
      continue
    }
    if (cur) {
      // el diff de un solo archivo no trae mas cabeceras: todo lo que sigue
      // al @@ pertenece al hunk (incluido "\ No newline at end of file")
      cur.push(line)
    } else {
      header.push(line)
    }
  }
  flush()

  return readOk({
    path,
    header: header.join('\n'),
    hunks,
    binary: header.some((l) => l.startsWith('Binary files') || l.includes('GIT binary patch'))
  })
}

/**
 * Prepara (o quita del staging) UN hunk suelto, sin tocar el archivo en disco.
 *
 * Se reconstruye un parche con la cabecera del archivo + ese unico hunk y se
 * aplica al INDICE (`--cached`). Los numeros de linea del `@@` se refieren al
 * lado "a" del diff — que es justo el contenido del indice — asi que un hunk
 * suelto aplica bien aunque se salten los anteriores. Es lo mismo que hace
 * `git add -p` por dentro.
 *
 * @param reverse true para quitar del staging (aplica el hunk al reves).
 */
export function applyHunk(
  repo: string,
  file: FileDiff,
  hunkIndex: number,
  reverse = false
): Promise<GitResult> {
  const hunk = file.hunks[hunkIndex]
  if (!hunk) {
    return Promise.resolve({
      ok: false,
      cmd: 'git apply --cached',
      stdout: '',
      stderr: `no existe el hunk ${hunkIndex} en ${file.path}`,
      code: 1
    })
  }
  // git apply exige que el parche termine en salto de linea
  const patch = `${file.header}\n${hunk.text}\n`.replace(/\n+$/, '\n')
  const args = ['apply', '--cached', ...(reverse ? ['--reverse'] : []), '-']
  return runGitStdin(args, repo, patch)
}

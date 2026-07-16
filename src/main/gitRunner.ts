import { execFile, spawn } from 'child_process'
import type { GitResult } from '@shared/types'

/**
 * Ejecuta el binario `git` REAL con los argumentos dados.
 *
 * Usamos el git de Git-for-Windows (no una reimplementacion JS) para que
 * los alias con `!` de shell (overview, alias, lgme, today...) corran igual
 * que en la terminal.
 *
 * @param args argumentos, ya troceados (ej. ["log", "--oneline"])
 * @param cwd  carpeta del repo donde correr el comando (undefined = cwd del proceso)
 */
export function runGit(
  args: string[],
  cwd?: string,
  extraEnv?: Record<string, string>,
  timeoutMs = 60_000
): Promise<GitResult> {
  const cmd = `git ${args.join(' ')}`
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        // buffer amplio para logs largos; se paginara en fases futuras
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        timeout: timeoutMs,
        // forzar salida en UTF-8 sin depender del locale de Windows
        env: { ...process.env, LC_ALL: 'C.UTF-8', ...extraEnv }
      },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as NodeJS.ErrnoException & { code?: number }).code === 'number'
            ? ((error as unknown as { code: number }).code as number)
            : error
              ? 1
              : 0
        resolve({
          ok: !error,
          cmd,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code
        })
      }
    )
  })
}

/**
 * Igual que runGit pero pasando texto por STDIN. Se usa para `git commit -F -`,
 * asi el mensaje conserva saltos de linea y UTF-8 sin depender de `-m` ni de la shell.
 */
export function runGitStdin(args: string[], cwd: string, input: string): Promise<GitResult> {
  const cmd = `git ${args.join(' ')}`
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, LC_ALL: 'C.UTF-8' }
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (e) => resolve({ ok: false, cmd, stdout, stderr: stderr || String(e), code: 1 }))
    child.on('close', (code) => resolve({ ok: code === 0, cmd, stdout, stderr, code }))
    child.stdin.end(input)
  })
}

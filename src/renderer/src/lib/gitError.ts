import type { GitResult } from '@shared/types'

/** Explicacion legible de un fallo de git. */
export interface GitHint {
  /** que paso, en una linea */
  title: string
  /** que hacer al respecto */
  hint: string
}

/**
 * Traduce los fallos de git mas comunes a algo accionable.
 *
 * Se hace por texto porque git no da codigos de error: el exit code es 1 para
 * casi todo. Por eso NUNCA se reemplaza la salida cruda — esto la acompaña, y
 * si ningun patron encaja no se inventa nada (devuelve null).
 */
const PATTERNS: { re: RegExp; title: string; hint: string }[] = [
  {
    re: /could not read Username|Authentication failed|terminal prompts disabled|Invalid username or password/i,
    title: 'Git no pudo autenticarse con el remoto',
    hint: 'Las credenciales las maneja el credential manager de git, no GitDeck. Prueba el mismo comando en la terminal para que te las pida, o revisa tu token de acceso.'
  },
  {
    re: /Permission denied \(publickey\)|Host key verification failed/i,
    title: 'El remoto rechazó tu clave SSH',
    hint: 'Comprueba que tu clave está cargada (ssh-add -l) y dada de alta en el servidor.'
  },
  {
    re: /Could not resolve host|unable to access .*Couldn't connect|Connection timed out|Failed to connect/i,
    title: 'No se pudo contactar con el remoto',
    hint: 'Parece un problema de red o de la URL del remoto. Revisa tu conexión, el proxy o la VPN.'
  },
  {
    re: /Repository not found|does not appear to be a git repository/i,
    title: 'El remoto no existe o no tienes acceso',
    hint: 'Revisa la URL del remoto. Si el repo es privado, puede que tu usuario no tenga permiso.'
  },
  {
    re: /has no upstream branch|no upstream configured/i,
    title: 'La rama no tiene upstream',
    hint: 'Aún no está publicada. Usa Push: GitDeck la publica con -u origin <rama>.'
  },
  {
    re: /failed to push some refs|non-fast-forward|\[rejected\]/i,
    title: 'El push fue rechazado',
    hint: 'El remoto tiene commits que tú no tienes. Haz Pull (o Fetch y luego merge/rebase) antes de volver a empujar.'
  },
  {
    re: /Your local changes to the following files would be overwritten|Please commit your changes or stash them/i,
    title: 'Tienes cambios sin guardar que estorban',
    hint: 'Commitea esos cambios o guárdalos en un stash antes de continuar.'
  },
  {
    re: /index\.lock.*File exists|Unable to create .*index\.lock/i,
    title: 'El repo está bloqueado por otra operación de git',
    hint: 'Puede haber otro git corriendo. Si no, quedó un .git/index.lock huérfano de un proceso que murió; bórralo a mano.'
  },
  {
    re: /not a git repository/i,
    title: 'Esa carpeta no es un repositorio git',
    hint: 'Puede que la hayan movido o borrado, o que el .git esté dañado. Quítala de la lista y vuelve a agregarla.'
  },
  {
    re: /refusing to merge unrelated histories/i,
    title: 'Las dos ramas no comparten historia',
    hint: 'Suele pasar al mezclar repos distintos. Si de verdad quieres unirlas, hace falta --allow-unrelated-histories desde la terminal.'
  },
  {
    re: /CONFLICT|Automatic merge failed|after resolving the conflicts/i,
    title: 'Hay conflictos que resolver',
    hint: 'Ve a la pestaña Commit: ahí están los archivos en conflicto, con Continuar y Abortar.'
  },
  {
    re: /nothing to commit|no changes added to commit/i,
    title: 'No hay nada preparado que commitear',
    hint: 'Prepara archivos con ＋ (o por hunk) antes de commitear.'
  },
  {
    re: /is not fully merged/i,
    title: 'La rama tiene commits sin fusionar',
    hint: 'Si estás seguro de perderlos, borra con la opción de forzado (-D).'
  },
  {
    re: /would clobber existing tag|already exists/i,
    title: 'Ese nombre ya existe',
    hint: 'Elige otro nombre, o borra primero el que ya está.'
  }
]

/** Devuelve una explicacion del fallo, o null si no se reconoce el patron. */
export function explainGitError(res: GitResult | null): GitHint | null {
  if (!res || res.ok) return null
  const text = `${res.stderr}\n${res.stdout}`
  for (const p of PATTERNS) {
    if (p.re.test(text)) return { title: p.title, hint: p.hint }
  }
  return null
}

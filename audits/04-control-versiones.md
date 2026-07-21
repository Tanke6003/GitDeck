# GitDeck — Assessment de control de versiones

> Auditoría centrada en flujos de trabajo de git. Base analizada: `src/preload/index.ts`
> (superficie completa del `api`), `src/shared/types.ts`, los servicios de `src/main/`
> (`gitService`, `commitService`, `mergeService`, `stashService`, `tagService`,
> `blameService`, `hunkService`, `aliasService`, `repoService`) y los componentes de
> `src/renderer/src/components/`.

---

## 1. Resumen ejecutivo

GitDeck es hoy un **cliente de lectura y de operaciones cotidianas muy sólido**: el grafo
multi-rama, el detalle de commit, la búsqueda, el panel de commit con staging por archivo y
por hunk, el manejo de ramas/remotos, stash, tags, blame y reflog están bien construidos, con
una filosofía de "transparencia total" (cada acción devuelve `GitResult` con el comando real y
su salida) que es un acierto de diseño. La resolución de conflictos guiada (banner de operación
en curso + continuar/abortar) y la vista previa de merge son detalles de producto maduro.

Sin embargo, como cliente git **le falta el otro 40 %: la capa de "deshacer, rehacer y
reescribir"**. No hay `reset`, no hay forma de **descartar los cambios de un archivo**
(`restore`/`checkout --`), no hay `git clean`, no hay `push --force-with-lease` (imprescindible
tras un amend o un rebase, ambos ya soportados), no hay `pull --rebase`, no se puede **comparar
dos ramas/revisiones cualquiera**, y el rebase es solo "sobre una rama" (sin interactivo, sin
`--onto`, sin autostash). El reflog se muestra pero es **solo lectura**: enseña los puntos de
recuperación pero no deja actuar sobre ellos, con lo que la historia de "recuperar" queda a
medias. Tampoco hay onboarding de repos nuevos (`clone`/`init`), ni edición de config
(`user.name/email`, credential helper), ni firma de commits.

**Veredicto:** excelente para *ver* y para el ciclo *editar → stage → commit → push* en el
camino feliz. Incompleto en cuanto el usuario necesita **corregir** (deshacer un commit,
descartar un archivo, forzar un push tras rebase) o **reescribir** (rebase interactivo,
squash). Un usuario avanzado choca con estas carencias en su primer día de uso real.

---

## 2. Cobertura actual (contexto)

Verificado contra el `api` y los servicios:

- **Multi-repo:** agregar por carpeta, escanear una carpeta (repos de primer nivel), quitar de
  la lista. *No* clona ni inicializa: solo adopta repos existentes (`repoService.ts`, `App.tsx`).
- **Grafo:** `log --all --date-order --max-count=400` de todas las ramas; carriles calculados en
  `lib/graph.ts`. Límite **fijo en 400**, sin paginación (`gitService.getCommits`).
- **Detalle de commit:** meta + `diff-tree --name-status` + `show --patch` con color ANSI.
- **Búsqueda:** mensaje (`--grep`), autor (`--author`), contenido (**solo pickaxe `-S`**),
  archivo (pathspec `*txt*`), revisión (`hash`). Límite fijo 200 (`gitService.searchCommits`).
- **Ramas:** crear (`switch -c`), checkout (`switch`), checkout remota con `--track`, renombrar
  (`branch -m`), borrar local (`-d`/`-D`), borrar remota (`push --delete`), ahead/behind, `gone`.
- **Remotos:** add / remove / rename. *No* edita URLs (`set-url`) salvo borrar y recrear.
- **Red:** `fetch --all --prune`, `pull` (plano, merge), `push` (con `-u` opcional).
- **Integración:** merge con vista previa (solo lecturas), rebase **sobre una rama**,
  cherry-pick (`-x`), revert (`--no-edit`).
- **Conflictos:** detección de operación a medias (`getRepoState` lee el git dir),
  continue/abort, "marcar resuelto" = stage, abrir archivo en el editor del sistema.
- **Stash:** push (con `-u`, `--keep-index`, `-m`), apply, pop, drop, branch, show.
- **Tags:** crear ligero/anotado, borrar, push, borrar remoto, push de todos.
- **Blame** (con revisión opcional) y **reflog** (solo visualización).
- **Staging:** por archivo (`add`/`restore --staged`) y **por hunk** (`git apply --cached` con
  el parche reconstruido, `hunkService.ts`). Commit + amend con Conventional Commits.
- **Alias:** listar (global+local), favoritos, ejecutar, crear/editar/borrar (config global).
- Existe un **escape hatch genérico** `api.git(args, cwd)` en el preload, pero **no está
  cableado a ninguna UI** (no hay paleta de comandos ni terminal integrada).

---

## 3. Brechas priorizadas

### 3.A — Imprescindibles que faltan

Lo que un usuario echará en falta en las primeras horas de uso.

#### A1. `git reset` (soft / mixed / hard) y "resetear aquí" desde el reflog/grafo
- **Qué falta:** no hay forma de mover HEAD. No se puede deshacer el último commit conservando
  cambios (`reset --soft HEAD~1`), ni descartar commits locales (`reset --hard`), ni resetear a
  un commit del grafo o a una entrada del reflog. Hoy solo existe `amend` y `unstageAll` (que
  por dentro es un `reset` sin argumentos).
- **Por qué importa:** es la operación de "deshacer" más usada. El `ReflogDialog` ya muestra los
  puntos de recuperación pero **no deja actuar** sobre ellos: la promesa de recuperación queda
  incompleta.
- **Cómo encaja:** `git reset --soft|--mixed|--hard <rev>`. Nuevo método `reset(repo, mode, rev)`
  en `mergeService.ts` (o un `historyService.ts`) + `api.reset`. UI: acción "Resetear a este
  commit" en `CommitDetailDrawer` y en `ReflogDialog`, con diálogo de confirmación que distinga
  claramente soft/mixed/hard (hard es destructivo del working tree).

#### A2. Descartar cambios de un archivo (`git restore` / `checkout --`)
- **Qué falta:** se puede **quitar de staging** (`restore --staged`, en `commitService`), pero
  **no descartar** los cambios del working tree de un archivo ni de todo el árbol. No hay botón
  "descartar" en ninguna parte.
- **Por qué importa:** es acción diaria. Hoy la única salida desde la UI es `stash push` + `drop`
  o irse a la terminal. Grave para un cliente que aspira a reemplazar la CLI.
- **Cómo encaja:** `git restore -- <path>` (working tree) y `git restore --source=HEAD --staged
  --worktree -- <path>` para reset total del archivo. Nuevo `discardFile(repo, path)` en
  `commitService.ts` + `api.discardFile`. UI: botón "descartar" (con confirmación, es destructivo)
  en cada fila de "Cambios" de `CommitPanel.tsx`.

#### A3. `git clean` (borrar archivos sin trackear)
- **Qué falta:** no hay forma de eliminar untracked/ignored.
- **Por qué importa:** dejar el árbol limpio antes de cambiar de rama o de un build es rutina.
- **Cómo encaja:** `git clean -nd` (dry-run para **previsualizar** qué se borraría) seguido de
  `git clean -fd` (y opción `-x` para ignorados). Nuevo `cleanPreview`/`clean` en `commitService`
  o `gitService` + `api.clean`. UI: acción "Limpiar untracked" que muestre primero la lista del
  dry-run y pida confirmación explícita.

#### A4. Comparar dos revisiones / ramas / tags cualquiera
- **Qué falta:** el diff solo existe para working-tree/staged (`CommitPanel`) y para un commit
  contra su padre (`CommitDetailDrawer`). No hay diff **rama vs rama**, **tag vs tag**,
  **commit vs commit** ni working-tree vs un commit arbitrario. `mergePreview` da un `--stat`,
  pero no un visor de diff real.
- **Por qué importa:** "¿qué cambió entre `v1.2` y `v1.3`?" o "¿en qué difiere mi rama de
  `main`?" son preguntas básicas de revisión.
- **Cómo encaja:** `git -c color.ui=always diff <revA>..<revB>` (y `...` para diff contra la base
  común). Nuevo `diffRange(repo, revA, revB, opts)` en `gitService.ts` + `api.diffRange`. UI: un
  diálogo "Comparar" con dos selectores de ref (reutilizando la lista de ramas/tags) y el visor de
  diff ANSI que ya existe.

#### A5. `push --force-with-lease`
- **Qué falta:** `push` solo hace push normal o `-u` en la primera publicación (`gitService.push`).
  No hay push forzado seguro.
- **Por qué importa:** GitDeck **ya ofrece amend y rebase**, dos operaciones que reescriben la
  historia local. Tras cualquiera de ellas, el `push` normal es rechazado por "non-fast-forward"
  y el usuario queda **bloqueado** sin salida dentro de la app. `--force-with-lease` es el force
  seguro (no pisa trabajo remoto que no hayas visto).
- **Cómo encaja:** añadir opción `force?: 'lease' | 'force'` a `push` → `git push
  --force-with-lease`. UI: cuando el push falle por non-fast-forward, el explicador de errores
  (`lib/gitError.ts`) ya intercepta casos; añadir ahí un botón "Reintentar con
  `--force-with-lease`" con aviso claro.

#### A6. `pull --rebase` y `pull --ff-only`
- **Qué falta:** `pull()` es un pull plano (merge) sin opciones (`gitService.pull`).
- **Por qué importa:** muchos equipos exigen historia lineal (`pull --rebase`) o quieren fallar
  si no es fast-forward (`--ff-only`) en vez de crear merges de sincronización accidentales.
- **Cómo encaja:** `pull(repo, {rebase?, ffOnly?})` → `git pull --rebase` / `--ff-only`. UI: un
  desplegable en el botón Pull (o un ajuste por repo) para elegir la estrategia por defecto.

#### A7. Elegir remoto/rama en pull y push
- **Qué falta:** `pull` siempre usa el upstream de la rama actual; `push` solo permite elegir
  remoto/branch en el primer `-u` (los parámetros `remote`/`branch` existen en el `api` pero la
  UI de `RepoDetail.onPush` nunca los usa salvo al publicar). No se puede hacer push a un remoto
  secundario ni pull de una rama concreta.
- **Por qué importa:** flujos con `origin` + `upstream` (forks) o con varios remotos son comunes.
- **Cómo encaja:** ya hay soporte en `api.push`; falta la UI (selector de remoto/rama destino en
  el botón Push) y extender `pull` con `remote`/`refspec`.

---

### 3.B — Deseables

Lo que un usuario avanzado espera de un cliente "de primera".

#### B1. Rebase interactivo (squash / fixup / reword / reorder / edit / drop)
- **Qué falta:** el rebase es solo `git rebase <rama>` (`mergeService.rebase`). No hay
  reescritura de historia por commit.
- **Por qué importa:** limpiar una rama antes del PR (aplastar "WIP", reordenar, corregir
  mensajes) es de las funciones más valoradas de clientes como GitKraken/Fork/lazygit.
- **Cómo encaja:** `git rebase -i` no sirve directo (abre editor). Se implementa con
  `GIT_SEQUENCE_EDITOR` apuntando a un script que reciba el "todo list" ya editado por la UI, o
  generando el todo desde `rebase -i --autostash <base>`. Nuevo `rebaseInteractive(repo, base,
  plan[])`. UI: un editor de lista de commits con acciones pick/squash/fixup/reword/drop y
  drag-para-reordenar. Es la pieza más grande pero de más impacto.

#### B2. Rebase: `--onto`, `--autostash`, `--skip`
- **Qué falta:** no hay `--onto` (mover una rama a otra base descartando commits intermedios),
  ni `--autostash` (hoy un árbol sucio bloquea el rebase), ni `--skip` durante un conflicto (solo
  continue/abort en `CONTINUE`/`ABORT`).
- **Por qué importa:** `--onto` es clave para reparentar ramas; autostash evita el "stash manual
  antes de rebasar"; skip es necesario cuando un commit ya no aplica.
- **Cómo encaja:** extender `rebase(repo, onto, {newBase?, autostash?})` y añadir `'skip'` al mapa
  de continuación. UI: opciones en el botón rebase + un botón "Saltar" en el banner de conflicto.

#### B3. Staging por línea, edición de hunk y split de hunk
- **Qué falta:** `hunkService` prepara/quita **hunks enteros**. No hay selección de líneas
  sueltas, ni "editar hunk", ni dividir un hunk grande (lo que hace `git add -p` con `s`/`e`).
- **Por qué importa:** commits atómicos requieren a veces media docena de líneas de un hunk.
- **Cómo encaja:** el patrón ya existe (reconstruir un parche y `git apply --cached`). Ampliar
  `applyHunk` para aceptar un subconjunto de líneas seleccionadas → generar un parche parcial con
  recuento `@@` recalculado. UI: checkboxes por línea en `HunkView.tsx`.

#### B4. Firmar commits/tags (GPG/SSH) y verificar firmas
- **Qué falta:** ningún soporte de firma ni verificación.
- **Por qué importa:** repos corporativos y OSS a menudo exigen commits firmados; ver el estado
  de firma da confianza en la autoría.
- **Cómo encaja:** `commit -S`, `tag -s`, y `git log --show-signature` / `verify-commit` /
  `verify-tag` para mostrar el estado. Opción "firmar" en `CommitPanel` y `TagPanel`; badge de
  firma en el detalle de commit.

#### B5. Herramienta de conflictos 3-way / tomar "ours" / "theirs"
- **Qué falta:** la resolución es manual (abrir en editor externo). No hay vista 3-way ni atajos
  "quedarme con ours/theirs" por archivo o por hunk.
- **Por qué importa:** es lo que diferencia resolver un conflicto en 10 s vs en 10 min.
- **Cómo encaja:** por archivo, `git checkout --ours|--theirs -- <path>` + `add`. Para 3-way,
  leer las tres versiones (`git show :1:file`, `:2:file`, `:3:file`) y ofrecer un panel de mezcla.
  UI: botones "ours"/"theirs" en cada fila de la sección Conflictos de `CommitPanel.tsx`.

#### B6. Onboarding: clonar y crear repos
- **Qué falta:** solo se adoptan repos existentes. No hay `git clone` ni `git init`.
- **Por qué importa:** empezar a trabajar con un repo remoto nuevo obliga a salir a la terminal.
- **Cómo encaja:** `git clone <url> <dir>` (operación de red, con progreso) y `git init <dir>`.
  Nuevo `cloneRepo`/`initRepo` en `repoService.ts` + `api`. UI: botones "Clonar" e "Inicializar"
  junto a "Agregar"/"Escanear" en `App.tsx`.

#### B7. Editar config del repo (`user.name`/`user.email`), ver/editar config, credential helper
- **Qué falta:** solo se escribe config **global de alias**. No hay edición de identidad por repo,
  ni visor de config, ni gestión del credential helper.
- **Por qué importa:** trabajar con varias identidades (trabajo/personal) por repo es común; los
  fallos de autenticación de push/pull hoy no tienen remedio desde la app.
- **Cómo encaja:** `git config --local user.name/email`, `git config --list --show-origin`,
  `git config --global credential.helper`. Nuevo `configService.ts` + `api`. UI: un panel
  "Ajustes del repo".

#### B8. `.gitignore` y hooks
- **Qué falta:** no se puede editar `.gitignore` (ni "ignorar este archivo" desde un untracked),
  ni ver/gestionar hooks.
- **Por qué importa:** "ignorar" es acción frecuente; ver qué hooks corren ayuda a diagnosticar
  commits/push que fallan.
- **Cómo encaja:** para ignorar, append a `.gitignore` (o `git check-ignore` para diagnosticar);
  para hooks, listar `.git/hooks` y `core.hooksPath`. UI: opción "Ignorar" en filas untracked de
  `CommitPanel`; un visor de hooks en ajustes.

#### B9. Filtrado del grafo y paginación
- **Qué falta:** el grafo es fijo (`--all`, `--max-count=400`) sin filtros por rama/autor/fecha,
  sin `--first-parent`, y sin "cargar más". La búsqueda está fijada a 200.
- **Por qué importa:** en repos grandes 400 commits se quedan cortos y el truncado es silencioso;
  `--first-parent` da una vista limpia del historial de merges.
- **Cómo encaja:** exponer `limit`/`skip` (ya hay `limit` opcional en `getCommits`, no cableado) y
  filtros (`--author`, `--since`, `--branches=<glob>`, `--first-parent`). UI: barra de filtros +
  botón "cargar más".

#### B10. Historia siguiendo renombrados (`log --follow`, blame `-C`/`-M`/`--follow`)
- **Qué falta:** no hay historia de un archivo, y el `blame` no sigue movimientos/copias
  (`blameService` usa `--line-porcelain` sin `-C`/`-M`).
- **Por qué importa:** un archivo renombrado pierde su historia; `-C`/`-M` atribuyen mejor las
  líneas movidas.
- **Cómo encaja:** `git log --follow -- <path>` para historia de archivo; añadir `-C -M` (o
  `-w`) como opciones a `getBlame`. UI: "Historia" en el detalle de archivo; toggles en
  `BlameDialog`.

---

### 3.C — Avanzadas

Para paridad con clientes muy completos; no bloquean el uso diario.

- **C1. Worktrees:** `git worktree list/add/remove`. Encaja bien con el modelo multi-repo:
  listar worktrees de un repo y crear uno por rama. Nuevo `worktreeService` + `api`.
- **C2. Git LFS:** detectar `.gitattributes` con LFS, `git lfs status/pull`, indicar punteros LFS
  en el diff. Importante en repos con binarios grandes.
- **C3. `git bisect`:** flujo guiado start/good/bad/reset para cazar regresiones. UI de asistente
  paso a paso apoyada en el grafo.
- **C4. Sparse-checkout / partial clone / monorepo:** `git sparse-checkout set/list`,
  `clone --filter=blob:none`. Relevante en monorepos grandes.
- **C5. Mantenimiento:** `git gc`, `git maintenance run`, `git prune`, prune de tags
  (`fetch --prune-tags`), `git remote prune`. Un panel "Mantenimiento" por repo.
- **C6. Parches y email:** `git format-patch` / `git am`, `git apply` de un `.patch`, `git
  archive`. Útil para colaboración sin push directo.
- **C7. Integración con forjas (PRs):** opcional; crear/ver PRs de GitHub/GitLab desde el cliente.
- **C8. Submódulos:** `submodule update --init --recursive`, ver estado, actualizar. (Frontera
  entre deseable y avanzado según cuánto los use el equipo objetivo.)

---

## 4. Riesgos y limitaciones de los flujos actuales

1. **Callejón sin salida tras amend/rebase.** La app permite reescribir la historia local (amend,
   rebase) pero el `push` es plano: el rechazo por non-fast-forward deja al usuario **atascado sin
   opción de force seguro**. Es la incoherencia más importante del producto hoy. (→ A5)
2. **No hay "deshacer" real.** Sin `reset` y sin descartar archivos, el único camino para tirar
   cambios es `stash + drop` o la terminal. El reflog **muestra** pero no **actúa**. (→ A1, A2)
3. **`pull`/`push` sin control de estrategia ni destino.** Pull siempre hace merge del upstream
   actual; no hay `--rebase`/`--ff-only` ni selección de remoto/rama. Puede generar merges de
   sincronización no deseados en equipos con historia lineal. (→ A6, A7)
4. **`merge` sin opciones.** Es `git merge <rama>` a secas: no hay `--no-ff` (forzar commit de
   merge), `--squash` (traer una feature como un solo commit), ni `--ff-only`. Limita las
   políticas de integración habituales.
5. **`rebase` limitado.** Solo "sobre una rama"; un árbol sucio lo bloquea (sin autostash), no hay
   `--onto`, `--skip` ni interactivo. Cubre el caso simple y poco más. (→ B1, B2)
6. **Búsqueda de contenido incompleta.** Solo pickaxe `-S` (cambia el *número* de apariciones);
   falta `-G` (regex sobre líneas añadidas/quitadas), que encuentra cambios que `-S` no ve.
7. **Límites fijos y silenciosos.** Grafo a 400 y búsqueda a 200 sin "cargar más": en repos
   grandes se pierde historia sin avisar. El `limit` de `getCommits` ni siquiera está cableado a
   la UI. (→ B9)
8. **`getRepoState` no distingue rebase interactivo vs `revert`/`cherry-pick` secuenciales
   complejos** con total fiabilidad (se apoya en la presencia de directorios/ficheros del git
   dir); suficiente hoy, frágil si se añaden operaciones secuenciales.
9. **Escape hatch inerte.** Existe `api.git(args)` genérico pero sin UI: no hay paleta de comandos
   ni terminal integrada, así que cualquier operación no cubierta obliga a salir de la app. Una
   "consola git" sencilla sería un colchón barato mientras se cierran las brechas.
10. **Sin firma ni verificación:** no se puede cumplir políticas de commits firmados. (→ B4)

---

## 5. Roadmap sugerido (fases)

**Fase 1 — Cerrar el ciclo de corrección (imprescindibles).**
`reset` (soft/mixed/hard) con "resetear aquí" en grafo y reflog · descartar archivo
(`restore`) · `git clean` con dry-run · `push --force-with-lease` (cableado al explicador de
errores) · `pull --rebase`/`--ff-only`. Desbloquea el uso diario real y elimina los callejones
sin salida.

**Fase 2 — Comparación y opciones de integración.**
Diff arbitrario entre dos refs (rama/tag/commit) · opciones de `merge` (`--no-ff`, `--squash`,
`--ff-only`) · selección de remoto/rama en pull/push · `-G` en búsqueda de contenido · una
consola git mínima sobre el `api.git` ya existente.

**Fase 3 — Reescritura de historia.**
Rebase interactivo (squash/fixup/reword/reorder/drop) · `rebase --onto`/`--autostash`/`--skip` ·
staging por línea y edición de hunk. El mayor esfuerzo, el mayor salto de percepción.

**Fase 4 — Confianza, onboarding y config.**
Firmar/verificar commits y tags · clonar/init · editar config del repo (identidad, credential
helper) · `.gitignore` y hooks · resolución de conflictos 3-way con ours/theirs.

**Fase 5 — Escala e historia.**
Filtros y paginación del grafo (`--author`/`--since`/`--first-parent`, "cargar más") ·
`log --follow` y blame `-C`/`-M` · mantenimiento (`gc`/`prune`).

**Fase 6 — Estructuras avanzadas.**
Worktrees · submódulos · LFS · bisect · sparse-checkout · parches (`format-patch`/`am`).

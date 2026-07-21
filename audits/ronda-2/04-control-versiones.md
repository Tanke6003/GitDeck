# GitDeck — Assessment de control de versiones (ronda 2)

> Segunda ronda, tras las correcciones de la sesión 2. Fecha: **2026-07-21**.
> Base analizada: `src/shared/ipc.ts` (superficie completa del API, ahora única fuente
> de verdad), `src/shared/types.ts`, los servicios de `src/main/` (`gitService`,
> `commitService`, `mergeService`, `stashService`, `tagService`, `blameService`,
> `hunkService`, `aliasService`, `repoService`) y los componentes de
> `src/renderer/src/components/`. Ronda 1: [`../04-control-versiones.md`](../04-control-versiones.md).

---

## 1. Resumen ejecutivo

La ronda 1 concluía que a GitDeck "le faltaba el otro 40 %: la capa de deshacer,
rehacer y reescribir". **Esa capa ya existe en su núcleo y está bien hecha.** De las
7 brechas imprescindibles (A1–A7), **seis están cerradas** con implementaciones
verificadas contra el código: `git reset` soft/mixed/hard accesible desde el detalle de
commit y desde el reflog (que dejó de ser solo lectura), descartar cambios de un archivo
(`restore` / `clean -f` para untracked) con confirmación destructiva, `git clean` con
dry-run obligatorio antes de confirmar, `push --force-with-lease` ofrecido
automáticamente cuando el push es rechazado por non-fast-forward (con diálogo de
peligro), `pull --rebase`/`--ff-only` con selector persistente, y un diálogo "Comparar"
que hace diff `A..B`, `A...B` y working-tree↔rev con el visor ANSI existente. Además
cayeron tres riesgos señalados en la ronda 1 que no eran brechas A: `merge` ganó
`--no-ff`/`--squash`/`--ff-only`, la búsqueda ganó el modo `-G`, y el grafo ganó
paginación ("cargar 400 más"). Los **callejones sin salida de la ronda 1 están
eliminados**: tras amend/rebase ya no se queda uno atascado, y "tirar cambios" ya no
exige stash+drop ni terminal.

La única brecha A que sigue viva es la **A7 (elegir remoto/rama en pull/push)**, y está
en un estado curioso: el backend la soporta por completo (`PullOpts`/`PushOpts` aceptan
`remote`/`branch` y `gitService` los cablea), pero **ninguna UI los usa**; peor aún, la
publicación de una rama nueva hace `-u origin <rama>` con `origin` *hardcodeado*, así
que un repo cuyo único remoto se llame distinto (o un flujo fork con `origin`+`upstream`)
no puede publicar ni elegir destino. Es la implementación a medias más clara de la ronda.

En cambio, el bloque B/C está prácticamente intacto: no hay rebase interactivo ni
`--onto`/`--autostash`/`--skip`, no hay clone/init, no hay ours/theirs ni 3-way, no hay
staging por línea, ni firma, ni config de identidad, ni `.gitignore` desde la UI, ni
`--follow`/blame `-C -M`. Y hay un cambio de contexto importante: el escape hatch
genérico `api.git` **se eliminó** (decisión defendible de seguridad), con lo que ya no
existe ningún colchón dentro de la app para lo no cubierto — cada brecha restante es
ahora, sí o sí, un viaje a la terminal.

**Veredicto:** GitDeck pasó de "excelente para ver, incompleto para corregir" a un
cliente que **cubre con solvencia el ciclo completo de trabajo diario, incluida la
corrección de errores**. Las carencias restantes son de dos tipos: rematar lo empezado
(destino de push/pull, matices de los flujos nuevos que se detallan en §4) y la
reescritura/colaboración avanzada (rebase interactivo, conflictos ours/theirs,
clone/init, firma). Un usuario intermedio ya puede vivir en GitDeck; el avanzado sigue
saliendo a la terminal para limpiar una rama antes del PR.

---

## 2. Cobertura actual (verificada contra el código)

Sin cambios respecto a la ronda 1 salvo lo indicado en **negrita**:

- **Multi-repo:** agregar por carpeta, escanear, quitar (con confirmación). Sigue sin
  clone/init (`repoService.ts` solo adopta repos existentes).
- **Grafo:** `log --all --date-order` **con paginación real**: `limit` cableado y botón
  "cargar 400 más" cuando `commits.length >= limit` (`RepoDetail.tsx`, `GRAPH_PAGE`).
  Sin filtros (`--author`/`--since`/`--first-parent`).
- **Búsqueda:** mensaje, autor, `-S`, **`-G` (regex sobre líneas cambiadas)**, archivo,
  revisión. Límite 200 fijo con indicador "(máx.)".
- **Detalle de commit:** meta + `diff-tree --cc` (**los merges ya listan archivos**) +
  `show --patch` ANSI. **Acciones nuevas en el drawer: reset** (junto a branch-here,
  cherry-pick y revert).
- **Comparación:** **`git:diffRange` nuevo** — `A..B`, `A...B` (checkbox "3 puntos") y
  working-tree↔rev si B va vacío; autocompletado con datalist de `HEAD` + ramas
  (`CompareDialog.tsx`, `gitService.diffRange`).
- **Red:** fetch `--all --prune`; **pull con estrategia** merge/`--rebase`/`--ff-only`
  (selector junto al botón, persistido en `localStorage`); **push con
  `--force-with-lease`** ofrecido al detectar rechazo non-fast-forward, tras
  confirmación con botón de peligro (`RepoDetail.onForcePush`).
- **Integración:** **merge con `--no-ff`/`--squash`/`--ff-only`** (radio en la vista
  previa, `MergeOpts`); rebase sigue siendo solo `git rebase <rama>`.
- **Deshacer:** **`git reset soft/mixed/hard`** (`mergeService.reset`, `ResetDialog`
  con radiogroup, aviso `role=alert` en hard, foco inicial en Cancelar); **descartar
  archivo** (`commitService.discardFile`: `restore -- <path>` o `clean -f -- <path>` si
  es untracked, confirmación destructiva en `CommitPanel`); **`git clean`** con dry-run
  `-nd` siempre visible antes del `-fd` real y checkbox `-x` (`CleanDialog`).
- **Reflog:** **ya no es solo lectura** — cada entrada ofrece "crear rama aquí"
  (recuperación segura, sin checkout) y "resetear aquí" (abre `ResetDialog` con el
  selector `HEAD@{n}`).
- **Conflictos / operación en curso:** igual que ronda 1 (banner + continue/abort +
  marcar resuelto + abrir en editor externo). Sin ours/theirs ni 3-way ni `--skip`.
- **Stash, tags, blame, hunks, alias:** sin cambios funcionales de fondo. Blame sigue
  sin `-C`/`-M`/`--follow`.
- **Infraestructura (mejora transversal):** `src/shared/ipc.ts` tipa toda la frontera;
  escrituras serializadas por repo (`repoQueue`); lecturas con `ReadResult` (la UI
  distingue "sin datos" de "git falló"); `runGitStdin` con timeout;
  `GIT_TERMINAL_PROMPT=0`.
- **El escape hatch `api.git(args)` fue ELIMINADO** (antes existía sin UI). Ya no hay
  vía genérica dentro de la app.

---

## 3. Estado de las brechas de la ronda 1 y repriorización

### 3.1 Tabla de estado

| Brecha | Estado | Verificación / matices |
|---|---|---|
| **A1** `git reset` + actuar desde reflog/grafo | **CERRADA** | `mergeService.reset` + `ResetDialog` desde `CommitDetailDrawer` (el grafo llega vía click→drawer) y `ReflogDialog`. Matiz: el reflog usa selectores `HEAD@{n}` que caducan tras el primer reset del propio diálogo (ver riesgo R1). |
| **A2** Descartar archivo | **CERRADA** | `discardFile` distingue tracked (`restore`) de untracked (`clean -f`), confirmación con texto distinto para cada caso. Matices: no hay "descartar todo"; en un archivo con cambios staged **y** unstaged solo se descarta el working tree (el mensaje "se pierden los cambios sin commitear" promete más de lo que hace). |
| **A3** `git clean` | **CERRADA** | Dry-run `-nd` obligatorio y siempre visible, `-x` opcional, botón de peligro deshabilitado si no hay nada o el preview falló. Matiz: todo-o-nada (no se puede excluir un archivo de la lista). |
| **A4** Comparar dos revisiones | **CERRADA** | `diffRange` con `..`/`...`/working-tree. Matices: el datalist solo autocompleta HEAD+ramas (los tags hay que teclearlos aunque el backend los acepta); no hay `--stat`/lista de archivos, solo el diff completo en un bloque. |
| **A5** `push --force-with-lease` | **CERRADA** | `PushOpts.forceWithLease`, detección del rechazo por regex sobre el resultado, botón "Reintentar" + `ConfirmDialog` danger con explicación honesta. Matices en riesgos R2/R3 (regex demasiado amplio; el retry pierde el caso `-u`). |
| **A6** `pull --rebase` / `--ff-only` | **CERRADA** | Selector merge/rebase/ff-only persistido. Matiz: la preferencia es **global** (una sola clave `gitdeck.pullMode`), no por repo como sugiere el resumen; y no hay `--autostash`, así que un árbol sucio bloquea `pull --rebase` (hint genérico "commit o stash" existe). |
| **A7** Elegir remoto/rama en pull/push | **PARCIAL** | Backend completo (`PullOpts`/`PushOpts` con `remote`/`branch`, cableados en `gitService.pull/push`), pero la UI nunca los pasa: `onPull` solo manda estrategia y `onPush` solo usa `branch` al publicar, con **`origin` hardcodeado** (`opts.remote ?? 'origin'`). Sin `origin`, publicar falla; con varios remotos, no se puede elegir destino. Es la mitad UI de la brecha. |
| **B1** Rebase interactivo | **ABIERTA** | `rebase(repo, onto)` sigue siendo una línea. |
| **B2** `--onto` / `--autostash` / `--skip` | **ABIERTA** | Sin rastro; el mapa `CONTINUE` solo tiene continue/abort, no skip. |
| **B3** Staging por línea / split de hunk | **ABIERTA** | `hunkService` sigue aplicando hunks enteros. |
| **B4** Firma GPG/SSH | **ABIERTA** | |
| **B5** Ours/theirs y 3-way | **ABIERTA** | La resolución sigue siendo "abrir en editor externo + marcar resuelto". |
| **B6** Clone / init | **ABIERTA** | `repoService` solo adopta. |
| **B7** Config de identidad / credential helper | **ABIERTA** | Solo se escribe config global de alias. |
| **B8** `.gitignore` / hooks | **ABIERTA** | |
| **B9** Filtrado y paginación del grafo | **PARCIAL** | Paginación cerrada ("cargar 400 más"); filtros (`--author`, `--since`, `--branches`, `--first-parent`) y ampliación de la búsqueda (fija en 200) abiertos. |
| **B10** `log --follow` / blame `-C -M` | **ABIERTA** | `blameService` sin `-C`/`-M`/`--follow`. |
| **C1–C8** Worktrees, LFS, bisect, sparse, mantenimiento, parches, forjas, submódulos | **ABIERTAS** | Sin cambios. |

Extras cerrados que en ronda 1 figuraban como riesgos, no como brechas: opciones de
`merge` (riesgo 4), búsqueda `-G` (riesgo 6), límites del grafo (riesgo 7, parcial). El
riesgo 9 (escape hatch inerte) se "resolvió" en la dirección opuesta a la sugerida:
en vez de darle UI, `api.git` se eliminó.

### 3.2 Brechas repriorizadas (lo más importante ahora)

#### P1. Rematar A7: selector de remoto/rama en push (y pull) — *esfuerzo pequeño, deuda visible*
Todo el trabajo de backend está hecho; falta un desplegable de destino en Push (al menos
cuando hay >1 remoto o la rama no tiene upstream) y quitar el `?? 'origin'` ciego. Es la
única brecha imprescindible restante y hoy produce un fallo real: publicar una rama en un
repo sin remoto `origin` es imposible desde la UI. Incluir push de una rama que no es la
actual sería el siguiente paso natural desde `BranchLists`.

#### P2. Ours/theirs por archivo (B5, recortada) — *el paso más débil de flujos ya soportados*
GitDeck ya genera conflictos por seis vías (merge, rebase, cherry-pick, revert,
`pull --rebase`, stash pop) y su resolución sigue siendo la más manual del mercado.
Solo con `git checkout --ours|--theirs -- <path>` + `add` (dos botones en las filas de
la sección Conflictos, con la semántica ours/theirs invertida en rebase bien explicada)
se resuelve el 80 % de los casos. La vista 3-way puede esperar; los botones no.

#### P3. Clone / init (B6) — *la puerta de entrada*
Sigue siendo imposible empezar desde cero. `git clone` (con `NET_TIMEOUT` generoso y,
idealmente, `--progress` hacia la UI) + `git init` + botones junto a "Agregar"/"Escanear".
Sin esto GitDeck es un cliente "de repos ajenos".

#### P4. Rebase interactivo (B1) + `--autostash`/`--skip`/`--onto` (B2)
El mayor salto de percepción pendiente. El patrón técnico ya existe en el código
(`continueOp` ya inyecta `GIT_SEQUENCE_EDITOR`); falta generar el todo-list desde la UI
(pick/reword/squash/fixup/drop/reorder) y pasarlo vía `GIT_SEQUENCE_EDITOR`. En paralelo,
`--autostash` (hoy un árbol sucio bloquea rebase y `pull --rebase`) y `--skip` en el
banner de conflicto son baratos y quitan fricción real.

#### P5. Staging por línea (B3)
Extender `applyHunk` para aceptar un subconjunto de líneas y recalcular el `@@`. El
patrón de parche reconstruido + `git apply --cached` ya está probado con tests.

#### P6. Identidad y firma (B7 + B4)
`git config --local user.name/email` (multi-identidad trabajo/personal) y `commit -S` /
`tag -s` / badge de verificación. Juntas forman el bloque "confianza" y comparten el
futuro panel de ajustes del repo.

#### P7. Resto B: `.gitignore` ("ignorar este archivo" en filas untracked), filtros del
grafo y `--first-parent`, `log --follow` + blame `-C -M`, límite de búsqueda ampliable.

#### P8. C1–C8 sin cambios de prioridad
(worktrees y submódulos primero si el público objetivo los usa; bisect es un buen
candidato a diferenciador aprovechando el grafo).

---

## 4. Riesgos y limitaciones — foco en los flujos NUEVOS

Los flujos nuevos están, en general, **bien protegidos**: todas las operaciones
destructivas confirman, los diálogos destructivos arrancan con el foco en Cancelar, el
clean exige ver el dry-run, y el reset --hard lleva aviso explícito e irreversibilidad
explicada. Aun así:

1. **[bug] Selectores del reflog caducos tras actuar (R1).** `ReflogDialog` carga las
   entradas una vez y resetea usando `entry.ref` (`HEAD@{n}`). Cada reset (o creación de
   rama con checkout) **añade una entrada nueva al reflog y desplaza todos los índices**,
   pero la lista en pantalla no se recarga: un segundo "resetear aquí" en la misma sesión
   del diálogo apunta a `HEAD@{n}` del reflog *nuevo*, es decir, **a un commit distinto
   del que el usuario ve en la fila**. Arreglo barato: resetear por sha (`entry.short`
   como rev, el selector solo como etiqueta) o recargar `entries` en `onResetDone`.
2. **Botón de force ofrecido en rechazos que no son "historia reescrita" (R2).** El
   detector `pushRejected` (`RepoDetail.tsx`) matchea `failed to push|\[rejected\]|fetch
   first|non-fast-forward`. Eso incluye rechazos por hook/branch protection (donde el
   force volverá a fallar: ruido) y el "fetch first" legítimo de **commits ajenos que el
   usuario aún no ha visto**. El lease protege este último caso *mientras la
   remote-tracking esté desactualizada*; pero el flujo natural del usuario ante el error
   es pulsar Fetch y reintentar, y tras el fetch el lease se rearma contra lo recién
   bajado: el force **pisará los commits del compañero** habiéndolos "visto" solo
   nominalmente. Mitigación: mostrar el botón solo si además hubo amend/rebase reciente
   (el reflog lo sabe), o mostrar `HEAD..@{upstream}` (qué se pisaría) en el diálogo de
   confirmación antes del force.
3. **El retry forzado pierde el caso publicación (R3).** `onForcePush` llama
   `push({forceWithLease:true})` sin `setUpstream`: si el push original era la
   publicación de una rama sin upstream que fue rechazada (rama homónima preexistente en
   el remoto), el reintento muere con "no upstream". Callejón menor, pero es
   exactamente el tipo de dead-end que esta ronda quería extinguir.
4. **`reset --hard` no comprueba el árbol.** El diálogo avisa genéricamente, pero no
   dice *si* hay cambios sin commitear en ese momento (dato que la app ya conoce vía
   `repo.dirty`/status). Mostrar "además se perderán N archivos modificados" haría la
   confirmación proporcional al daño real. También se permite resetear con una
   operación (merge/rebase) a medias sin aviso específico.
5. **Descartar archivo con cambios staged+unstaged** solo restaura el working tree
   (la copia staged sobrevive), y el texto de confirmación sugiere que se pierde todo.
   O ajustar el mensaje o usar `restore --staged --worktree --source=HEAD` cuando la
   fila lo amerite. No hay "descartar todos".
6. **`pull --rebase` sin `--autostash`:** con árbol sucio falla ("cannot pull with
   rebase"); el hint genérico ("commitea o stashea") salva el trance, pero es fricción
   evitable en el modo que la app misma recomienda para historia lineal.
7. **Preferencia de pull global, no por repo:** un usuario con un repo "merge" y otro
   "rebase-only" la estará cambiando constantemente (una clave `localStorage` única).
8. **`revert`/`cherry-pick` de un commit de merge fallan** ("is a merge but no -m
   option was given"): el drawer marca el commit como `merge` pero no bloquea ni ofrece
   `-m 1`. El error crudo se muestra, pero no hay patrón en `gitError.ts` que lo
   explique. Brecha pequeña nueva de esta ronda.
9. **Sin escape hatch:** al eliminar `api.git`, toda operación no cubierta obliga a
   salir de la app. Decisión de seguridad razonable, pero eleva el coste de cada brecha
   restante; una paleta de comandos *allowlisted* sería un término medio.
10. **Compare sin tags en el autocompletado** (el backend los acepta; `compareRefs` solo
    junta HEAD+ramas) y sin resumen `--stat`: para "¿qué cambió entre v1.2 y v1.3?" hay
    que teclear los tags y leerse el diff entero.

---

## 5. Roadmap sugerido (fases)

**Fase 1 — Rematar lo empezado (deuda de esta ronda, esfuerzo bajo).**
Selector de remoto/rama en push (quitar `origin` hardcodeado) y pull (A7) · fix de los
selectores caducos del reflog (R1) · restringir/enriquecer la oferta de force-with-lease
(R2, mostrar qué se pisaría) y conservar `-u` en el retry (R3) · aviso cuantificado en
`reset --hard` con árbol sucio · `-m 1` (o bloqueo explicado) en revert/cherry-pick de
merges · tags en el autocompletado de Comparar + `--stat` inicial.

**Fase 2 — Conflictos y onboarding.**
Botones ours/theirs por archivo en la sección Conflictos (con semántica correcta en
rebase) · `git clone` con progreso + `git init` · `--autostash` en rebase y
`pull --rebase` · `--skip` en el banner de operación en curso.

**Fase 3 — Reescritura de historia.**
Rebase interactivo (todo-list UI + `GIT_SEQUENCE_EDITOR`, base técnica ya presente en
`continueOp`) · `rebase --onto` · staging por línea y split de hunk sobre el
`hunkService` existente.

**Fase 4 — Confianza y configuración.**
Identidad por repo (`user.name/email` local) · firmar commits/tags y mostrar
verificación · credential helper · "ignorar este archivo" / editor de `.gitignore` ·
preferencia de pull por repo.

**Fase 5 — Escala e historia.**
Filtros del grafo (`--author`/`--since`/`--first-parent`/por rama) · búsqueda con
límite ampliable · `log --follow` e historia de archivo · blame `-C -M` · vista 3-way
de conflictos · mantenimiento (`gc`/`prune`).

**Fase 6 — Estructuras avanzadas.**
Worktrees · submódulos · LFS · bisect guiado sobre el grafo · sparse-checkout ·
`format-patch`/`am` · (opcional) paleta de comandos git allowlisted como escape hatch
controlado.

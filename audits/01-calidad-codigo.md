# Auditoría de calidad de código — GitDeck

_Fecha: 2026-07-21 · Alcance: `src/` (main, preload, renderer, shared, tests) + configuración de raíz._

## Resumen ejecutivo

GitDeck es un proyecto **de calidad alta y notablemente consistente**: arquitectura de capas
bien separada, tipado estricto sin `any`, comandos git a prueba de inyección y una suite de tests
que corre contra el git real. Los hallazgos son casi todos de **mantenibilidad y consistencia**
(un componente demasiado grande, duplicación de constantes, colores hardcodeados que ignoran el
tema claro y algún comentario/copy obsoleto), no de corrección grave. **Estado general: verde**,
listo para producción con mejoras incrementales recomendadas.

---

## Fortalezas del código

- **Separación de capas estricta y segura.** Solo `src/main` toca `child_process`/git; el renderer
  llega a git únicamente por el puente acotado de `src/preload/index.ts` con `contextIsolation: true`,
  `nodeIntegration: false` (`src/main/index.ts:79-84`). La API expuesta es explícita y tipada
  (`GitDeckApi`).
- **Comandos git a prueba de inyección.** Siempre `execFile`/`spawn` con argumentos como array, nunca
  una shell (`src/main/gitRunner.ts:22-49`). Hay incluso un test que lo verifica
  (`src/main/__tests__/gitService.test.ts:266-272`).
- **Validación de path traversal** antes de abrir archivos del sistema (`src/main/index.ts:271-278`).
- **Contrato uniforme `GitResult`** (comando + stdout + stderr + code) que da transparencia total en la
  UI y facilita el manejo de errores sin excepciones (`src/shared/types.ts:6-15`).
- **Manejo de errores defensivo.** Los servicios devuelven `[]` o `GitResult { ok:false }` en vez de
  lanzar; `explainGitError` traduce fallos comunes de git a mensajes accionables sin sustituir jamás la
  salida cruda (`src/renderer/src/lib/gitError.ts`).
- **Tests contra git real** con fixtures temporales y buena cobertura del parseo más frágil (blame
  `--line-porcelain`, orden de tags, rebase vs cherry-pick). Los comentarios explican el _porqué_, no
  el _qué_ (`src/main/__tests__/fixture.ts`, `blameService.test.ts`).
- **Patrones de React cuidados**: `useCallback`/`useMemo` correctos, e ID de petición para descartar
  respuestas obsoletas de búsqueda y de vista previa de merge (`SearchBar.tsx:33,45-49`,
  `RepoDetail.tsx:47,199-203`).
- **`ansiToHtml` escapa el texto antes de inyectarlo** y usa variables CSS para los 16 colores base,
  de modo que el diff sigue al tema (`src/renderer/src/lib/ansi.ts:15-20,83-101`).
- **Tipado fuerte**: `strict: true` en ambos `tsconfig`, tipos compartidos bien documentados en
  `src/shared/types.ts`, y **cero `any`** en todo `src/`.

---

## Hallazgos por severidad

### Alta

**A1 · `RepoDetail.tsx` concentra demasiadas responsabilidades y duplica el patrón de acción**
`src/renderer/src/components/RepoDetail.tsx` (~834 líneas).
Un único componente gestiona grafo, ramas locales/remotas, remotos, merge, rebase, pull, push,
borrado/renombrado y varios diálogos. El patrón asíncrono
`setBusy(x) → const res = await window.api… → setResult(res) → setBusy(null) → await reloadAll()`
se repite casi idéntico ~10 veces: `onFetch` (`:120`), `onPull` (`:238`), `onPush` (`:247`),
`onRemoveRemote` (`:380`), `onRenameRemote` (`:396`), `onRenameBranch` (`:347`),
`runDeleteBranch` (`:262`), `doMerge` (`:214`), `onRebase` (`:226`), `onDeleteRemoteBranch` (`:314`).
- **Recomendación:** extraer un helper `runAction(label, fn, { after })` que encapsule
  busy/result/reload, y separar la barra lateral en subcomponentes (`BranchList`, `RemoteList`,
  `RemoteBranchList`). Reduce el archivo a la mitad y elimina la duplicación.

### Media

**M1 · `parseRef` clasifica como remota cualquier ref con `/`**
`src/renderer/src/lib/format.ts:38-39`.
`if (ref.includes('/')) return { kind: 'remote', … }`. Una rama **local** con nombre jerárquico
(`feature/login`, `release/2.0`, `bugfix/x`) contiene `/` y se pinta como remota en los chips del
grafo (`CommitGraph.tsx:160-167`).
- **Recomendación:** decidir "remota" comparando el primer segmento contra la lista real de remotos
  (ya disponible en `RepoDetail`) en vez de por la mera presencia de `/`.

**M2 · Colores hardcodeados que ignoran el tema claro**
`src/renderer/src/components/CommitGraph.tsx:12-21` (paleta `LANE_COLORS`) y `:128` (relleno del nodo
merge `#181825`, casi negro), y `src/renderer/src/components/BlameDialog.tsx:51` (paleta inline).
Contradice el enfoque _theme-aware_ que sí aplica `ansi.ts` con variables CSS. En el tema claro
(añadido en el commit reciente `e053370`) estos tonos y sobre todo el nodo merge oscuro se ven fuera
de sitio.
- **Recomendación:** mover las paletas a variables CSS (`--lane-0…7`, `--node-merge-bg`) definidas
  por tema en `assets/main.css`, igual que ya se hace con `--ansi-*`.

**M3 · Duplicación de constantes de infraestructura entre servicios**
`const SEP = '\x1f'` con comentario idéntico en 4 archivos (`gitService.ts:13-14`,
`blameService.ts:4-5`, `stashService.ts:4-5`, `tagService.ts:4-5`) y
`const NET_TIMEOUT = 180_000` en 2 (`gitService.ts:197`, `tagService.ts:75`).
- **Recomendación:** centralizar en un módulo compartido (p.ej. `src/main/gitFormat.ts`) e importarlo.

**M4 · Hack de tipado con `undefined!` en el diálogo nativo**
`src/main/index.ts:282`: `dialog.showOpenDialog(mainWindow ?? undefined!, { … })`.
El `undefined!` fuerza el tipo para sortear las sobrecargas de `showOpenDialog`; es confuso y frágil.
- **Recomendación:** usar la sobrecarga sin ventana cuando no hay `mainWindow`:
  `mainWindow ? dialog.showOpenDialog(mainWindow, opts) : dialog.showOpenDialog(opts)`.

**M5 · `@typescript-eslint/no-explicit-any` desactivado sin necesidad**
`.eslintrc.cjs:16` lo pone en `off`, pero el código base **no usa `any` en ningún sitio**.
- **Recomendación:** reactivarlo (`'error'`). Hoy no rompe nada y blinda el tipado a futuro.
  (No lo activé yo para respetar la decisión explícita del override; ver "Cambios de configuración".)

### Baja

**B1 · Comentario de cabecera obsoleto en `App.tsx`**
`src/renderer/src/App.tsx:6-10`: dice "Fase 1 + arranque de Fase 2… El arbol de commits llega en la
Fase 2", pero el árbol de commits ya está implementado (`CommitGraph`, `RepoDetail`). Engañoso.
- **Recomendación:** actualizar el comentario al estado real de la app.

**B2 · Ruta personal del autor incrustada en la UI**
`src/renderer/src/App.tsx:124`: el estado vacío sugiere `Usa Escanear sobre E:\MTTRSystem`, una ruta
específica de la máquina del desarrollador que no debería llegar al producto.
- **Recomendación:** texto genérico ("una carpeta que contenga tus repositorios").

**B3 · Condición muerta en `canCommit`**
`src/renderer/src/components/CommitPanel.tsx:164`:
`… || (amend && staged.length >= 0)`. `staged.length >= 0` es **siempre verdadero**, así que la rama
equivale a `amend` a secas. Funciona, pero la expresión confunde al lector.
- **Recomendación:** simplificar a `… || amend`.

**B4 · Estilos inline en vez de clase CSS**
`src/renderer/src/components/RepoDetail.tsx:644,652`: `style={{ cursor: 'pointer' }}` repetido.
- **Recomendación:** mover a una clase (`.clickable`) en `main.css`.

**B5 · Keys por índice de array en listas dinámicas**
`CommitGraph.tsx:163` (`key={k}` en los chips de ref) y `HunkView.tsx:81` (`key={i}` por línea del
hunk). Aceptable para listas estáticas, pero preferible una key estable.

**B6 · Extracción del `code` en `runGit` poco legible**
`src/main/gitRunner.ts:35-40`: doble cast encadenado
(`(error as NodeJS.ErrnoException & { code?: number })` … `(error as unknown as { code: number })`).
Funciona pero cuesta leerlo.
- **Recomendación:** un pequeño type guard `hasNumericCode(e)` mejora la legibilidad.

**B7 · Inconsistencia menor de estilo de parseo**
`src/main/gitService.ts:179` usa `line.match(re)` mientras el resto del archivo usa `re.exec(line)`.
Trivial, solo uniformidad.

---

## Cambios de configuración aplicados

### 1. `.editorconfig` (nuevo, en la raíz)

Coherente con `.prettierrc.json` (`tabWidth: 2`, `printWidth: 100`); Prettier sigue siendo la fuente
de verdad del formato. Contenido:

- `charset = utf-8`, `indent_style = space`, `indent_size = 2`, `end_of_line = lf`,
  `insert_final_newline = true`, `trim_trailing_whitespace = true`, `max_line_length = 100`.
- **Override `[*.md]`:** `trim_trailing_whitespace = false` (en Markdown dos espacios finales son un
  salto de línea "duro").
- **Override `[*.{json,yml,yaml}]`:** deja explícito `indent_size = 2`.

### 2. Linting (aditivo y seguro) — `.eslintrc.cjs`

Se añadieron **dependencias de desarrollo**: `eslint-plugin-react-hooks@^4.6.2` (compatible con
ESLint 8) y `eslint-config-prettier@^9.1.2`. Cambios en el config:

- **`plugin:react-hooks/recommended`**: activa `react-hooks/rules-of-hooks` (error) y
  `react-hooks/exhaustive-deps` (warn). Valioso en una app React con muchos hooks; el código actual
  **pasa sin ninguna advertencia**.
- **`prettier`** como último `extends`: apaga reglas de estilo de ESLint que chocarían con el
  formateo de Prettier. Puramente defensivo.
- Reglas nuevas, todas verificadas contra el código actual (0 errores):
  - `eqeqeq: ['error', 'smart']` (permite `== null` / `!= null`, único caso presente en
    `aliasService.ts:99`).
  - `no-var: 'error'`.
  - `object-shorthand: ['error', 'properties']`.
  - `@typescript-eslint/consistent-type-imports`: uniforma los imports de solo-tipo con la palabra
    `type` (ya era el patrón de facto del repo).

**Verificación:** tras los cambios, **`npm run lint` → PASA (exit 0, sin errores ni warnings)** y
**`npm run typecheck` → PASA (exit 0)**.

### Reglas evaluadas y **descartadas** (rompían el lint → se recomiendan, no se aplican)

- **`import/order` (`eslint-plugin-import`)**: probada; genera **48 errores** porque el repo ordena
  los imports de valor antes que los de tipo `@shared/*` y no siempre alfabéticamente entre módulos
  del mismo grupo. Aplicarla exigiría reordenar imports en ~14 archivos (`--fix` los tocaría), lo que
  queda fuera de una auditoría solo-configuración. **Recomendada** como paso aparte:
  `npm i -D eslint-plugin-import` + regla `import/order` con `--fix`.
- **`@typescript-eslint/no-explicit-any: 'error'`**: no rompería (hay 0 `any`), pero revierte un
  override explícito del autor; se deja como **recomendación** (ver M5) en lugar de imponerlo.

---

## Recomendaciones priorizadas

| # | Prioridad | Acción | Referencia |
|---|-----------|--------|------------|
| 1 | Alta | Extraer `runAction()` y trocear la barra lateral en subcomponentes para reducir `RepoDetail.tsx` | `RepoDetail.tsx` (A1) |
| 2 | Media | Corregir `parseRef`: no marcar remota una rama local con `/` | `format.ts:38-39` (M1) |
| 3 | Media | Mover paletas de color a variables CSS por tema (grafo, nodo merge, blame) | `CommitGraph.tsx`, `BlameDialog.tsx` (M2) |
| 4 | Media | Centralizar `SEP` y `NET_TIMEOUT` en un módulo compartido | 4 servicios de `main` (M3) |
| 5 | Media | Reactivar `@typescript-eslint/no-explicit-any` (`'error'`) | `.eslintrc.cjs:16` (M5) |
| 6 | Media | Adoptar `import/order` con `--fix` (config ya recomendada) | todo `src/` |
| 7 | Media | Sustituir el `undefined!` por la sobrecarga sin ventana | `index.ts:282` (M4) |
| 8 | Baja | Actualizar comentario de fase y quitar la ruta `E:\MTTRSystem` de la UI | `App.tsx:6-10,124` (B1, B2) |
| 9 | Baja | Simplificar `canCommit` (`staged.length >= 0` es muerto) | `CommitPanel.tsx:164` (B3) |
| 10 | Baja | Limpiezas menores: estilos inline, keys por índice, casts de `runGit`, `.match` vs `.exec` | (B4–B7) |

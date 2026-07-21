# GitDeck — Resumen de la aplicación

**GitDeck** es un cliente gráfico de Git para escritorio (Windows), pensado como
un "Git GUI mejorado": gestiona **varios repositorios a la vez**, muestra el
**árbol de commits de todas las ramas**, trabaja con **todos los remotos** (no
solo `origin`) y deja **ejecutar tus propios alias** de git. Está construido con
**Electron + TypeScript + React** y ejecuta el **binario `git` real** de tu
sistema, para que todo (incluidos los alias de shell con `!`) se comporte
exactamente igual que en la terminal.

Una idea rectora atraviesa toda la app: **transparencia total**. Cada acción
muestra el comando de git que se ejecutó y su salida cruda (con color ANSI), y
cuando algo falla se acompaña de una explicación legible sin ocultar nunca el
error original.

---

## Arquitectura

La app se separa en cuatro capas con una frontera de seguridad clara:

| Capa | Carpeta | Responsabilidad |
|------|---------|-----------------|
| **Main** (Node) | `src/main` | Único proceso con acceso a `child_process`/git y al disco. Ejecuta el binario git y expone handlers IPC. |
| **Preload** | `src/preload` | Puente seguro (`contextBridge`). Expone un `window.api` tipado; el renderer nunca toca git ni IPC directamente. |
| **Renderer** (React) | `src/renderer` | Toda la UI. Habla con git solo a través de `window.api`. |
| **Shared** | `src/shared` | Tipos TypeScript compartidos por las tres capas. |

- **`gitRunner.ts`** ejecuta git y devuelve siempre `{ ok, cmd, stdout, stderr, code }`
  para poder mostrar el comando y su salida en la UI.
- **Seguridad**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`.
  Los argumentos de git se pasan como array (sin shell), así el texto que escribe
  el usuario no se interpreta ni hace falta escaparlo. La apertura de archivos
  valida que la ruta no se escape de la carpeta del repo.
- Los enlaces externos se abren en el navegador del sistema, no dentro de la app.

---

## Funcionalidades

### 1. Gestión multi-repositorio
- **Agregar** un repo eligiendo su carpeta (selector nativo).
- **Escanear** una carpeta y agregar de golpe todos los repos git que contenga.
- **Quitar** un repo de la lista (no toca el disco).
- La lista de repos persiste en `userData/repos.json` (sobrevive a reinstalaciones).
- Barra lateral con cada repo, su **rama actual** y un punto de estado
  (limpio / con cambios sin guardar).
- Detección de repos **inválidos** (movidos o borrados) con su mensaje de error.
- **Auto-refresco** al volver el foco a la ventana (p. ej. tras usar la terminal).

### 2. Árbol de commits (grafo)
- Log de **todas las ramas** (`--all --date-order`), los más nuevos primero.
- Renderizado del grafo con carriles/aristas para padres, merges y ramificaciones.
- Etiquetas de refs sobre cada commit (ramas, tags, HEAD).
- Click en un commit abre el **panel de detalle**.

### 3. Detalle de un commit (drawer deslizante)
- Mensaje completo (encabezado + cuerpo), autor, email y fecha.
- Lista de **archivos cambiados** con su estado (M/A/D/R…).
- **Diff completo con color** (ANSI convertido a HTML).
- Acciones directas desde el commit:
  - **Crear una rama** que nace en ese commit (con opción de cambiar a ella).
  - **Cherry-pick** (`-x`) del commit sobre la rama actual.
  - **Revert** (crear un commit que lo deshace).
  - **Blame** de cualquier archivo del commit.

### 4. Búsqueda de commits
Cinco modos de búsqueda sobre todas las ramas:
- **Mensaje** (`--grep`, ignora mayúsculas).
- **Autor** (`--author`).
- **Contenido** (pickaxe `-S`: commits donde cambió el texto).
- **Archivo** (rutas que contienen el texto).
- **Hash/revisión** (sha, rama, tag, `HEAD~2`…).

### 5. Ramas (locales y remotas)
- Lista de ramas locales y remotas en una sola pasada.
- Por rama: **tip**, upstream, fecha del último commit, y contador
  **ahead/behind** (↑/↓) frente al upstream; marca **`gone`** si el upstream
  fue borrado en el remoto.
- **Crear rama** desde HEAD (`switch -c`) — también con atajo `Ctrl+B`.
- **Checkout** de una rama local; para una remota (`origin/foo`) crea/usa la
  local que la sigue (`--track`). Avisa si hay cambios sin guardar antes de cambiar.
- **Renombrar** rama (edición en línea).
- **Borrar** rama local (`-d`, con opción de forzar `-D` si no está fusionada,
  explicando el riesgo).
- **Borrar** rama en el remoto (`push --delete`) con confirmación destacada.

### 6. Merge con vista previa
- Antes de fusionar, una **vista previa que no toca el working tree**: muestra
  si ya está al día, si sería **fast-forward**, los **commits que entrarían**
  (`HEAD..branch`) y el resumen de archivos (`diff --stat HEAD...branch`).
- Confirmación explícita para ejecutar el merge; si hay conflictos, lleva a la
  pestaña Commit para resolverlos.

### 7. Rebase / cherry-pick / revert y resolución de conflictos
- **Rebase** de la rama actual sobre otra.
- **Cherry-pick** y **revert** desde el detalle de un commit.
- Detección de **operación a medias** (`merge` / `rebase` / `cherry-pick` /
  `revert`) leyendo las marcas del git dir.
- Banner de operación en curso con **Continuar** (`--continue`) y **Abortar**
  (`--abort`), habilitando Continuar solo cuando no quedan conflictos.
- Lista de **archivos en conflicto**: abrirlos en el editor del sistema y
  marcarlos como resueltos (stage).

### 8. Panel de Commit y staging
- Estado de archivos: **preparados (staged)**, **cambios sin preparar** y
  **conflictos**, con su código porcelain.
- **Stage / unstage** por archivo, o **preparar todo / quitar todo**.
- **Diff** de lo preparado o de lo sin preparar, con color.
- **Staging por hunk**: prepara o quita trozos sueltos de un archivo sin tocar
  el archivo en disco (aplica el parche por stdin). Los archivos nuevos sin
  trackear se preparan enteros (no hay hunks que dividir).
- **Editor de mensaje Conventional Commits**: selector de tipo
  (`feat`, `fix`, `docs`, …), scope opcional, resumen y cuerpo multilínea, con
  contador de longitud del encabezado (recomendado ≤50, máximo 72). El mensaje
  se envía por **stdin** (no `-m`), conservando encabezado + cuerpo.
- **Amend** del último commit.

### 9. Stash
- Pila de stashes (0 = el más reciente) con rama, mensaje y fecha.
- **Guardar** cambios (con mensaje, incluir untracked, o mantener el index).
- **Aplicar**, **pop**, **descartar (drop)**.
- **Crear una rama** a partir de un stash.
- **Ver el diff** que guarda un stash (con color).

### 10. Tags
- Lista de tags (los más nuevos primero), distinguiendo **ligeros** de
  **anotados** (con su mensaje y fecha).
- **Crear** tag ligero o anotado (con mensaje), sobre HEAD u otro objetivo.
- **Borrar** tag local.
- **Publicar** un tag en un remoto, o **publicar todos** los que falten.
- **Borrar** un tag en el remoto.

### 11. Blame
- Vista de **quién escribió cada línea** de un archivo (opcionalmente en una
  revisión concreta): commit, autor corto, fecha y asunto en el tooltip.

### 12. Reflog
- Vista visual del **reflog** (`HEAD@{n}`) para **recuperar commits que
  quedaron sin rama**: qué se hizo, cuándo y a qué sha apuntaba HEAD.

### 13. Alias de git (tu terminal, en la GUI)
- Lista de **todos los alias efectivos** (global + local), con su descripción
  opcional `desc.<name>`, igual que los verías en la terminal.
- Distingue **alias de shell** (empiezan con `!`).
- **Ejecutar** un alias en el repo (con color ANSI), con **timeout** para los
  colgados y un botón para **detenerlo**. Cierra stdin de inmediato para que los
  alias que leen de stdin no se bloqueen.
- **Crear / editar / borrar** alias en la config global (con su `desc`).
- **Favoritos**: marcar alias favoritos, que persisten en
  `userData/favorites.json`.

### 14. Remotos (todos, no solo origin)
- Lista de remotos con sus **URLs de fetch/push**.
- **Agregar**, **quitar** y **renombrar** remotos (edición en línea).
- **Fetch** (`--all --prune`), **Pull** y **Push** (con `-u` automático si la
  rama no tiene upstream), con timeouts amplios para operaciones de red.

### 15. Explicación de errores de git
- Cuando git falla, un traductor reconoce los fallos más comunes y muestra
  **qué pasó y qué hacer**, **sin sustituir nunca la salida cruda**. Cubre, entre
  otros: fallo de autenticación, clave SSH rechazada, sin red / host,
  repo no encontrado, rama sin upstream, push rechazado (non-fast-forward),
  cambios locales que estorban, `index.lock` huérfano, historias no relacionadas,
  conflictos, nada que commitear, rama sin fusionar y nombres ya existentes.

### 16. Experiencia de usuario
- **Temas claro y oscuro** con conmutador (persistente).
- **Atajos de teclado**: `F5` / `Ctrl+R` refrescar, `Ctrl+Shift+F` fetch,
  `Ctrl+B` nueva rama, `Ctrl+F` buscar.
- **Avisos no bloqueantes** (en vez de `window.alert`, que congela el renderer).
- **Diálogos de confirmación** para acciones destructivas, explicando las
  consecuencias.
- Abrir cualquier archivo del repo en la **app por defecto del sistema**.

---

## Calidad y empaquetado

- **Pruebas** (`vitest`) que corren contra el **binario git real** sobre repos
  temporales creados al vuelo, en vez de simular la salida de git. Verifican que
  los parseos aguanten lo que git escribe de verdad, incluidos los casos raros
  (tags anotados vs ligeros, hunks sin salto de línea final, `author-mail` en el
  blame, upstream `gone`…). Hay tests para blame, git service, hunks, merge,
  stash y tags.
- **Typecheck** (node + web), **ESLint** y **Prettier**.
- **Empaquetado** con electron-builder: instalador NSIS
  (`GitDeck-<version>-setup.exe`) o carpeta `win-unpacked`. El instalador **no**
  borra `userData` al desinstalar, así la lista de repos sobrevive a una
  reinstalación.

## Requisitos

- Node.js 20+ y npm 10+.
- **Git** (Git-for-Windows) accesible en el `PATH` — GitDeck ejecuta el binario
  `git` real para que tus alias con `!` de shell funcionen igual que en la terminal.

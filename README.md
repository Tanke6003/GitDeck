# GitDeck

Git GUI mejorado: árbol de commits multi-repo, todos los remotos (origin, hub, …),
creación de ramas, ejecución de tus alias y utilidades. Escritorio (Electron) con
Node.js + TypeScript + React.

> La lista de tareas completa está en `../GITDECK-TAREAS.md`.

## Requisitos

- Node.js 20+ y npm 10+
- Git (Git-for-Windows) accesible en el `PATH` — GitDeck ejecuta el binario `git`
  real (para que tus alias con `!` de shell funcionen igual que en la terminal).

## Desarrollo

```bash
npm install       # instalar dependencias
npm run dev       # levantar la app en modo desarrollo (hot reload)
```

## Otros scripts

```bash
npm run build     # compilar main + preload + renderer a ./out
npm run start     # previsualizar el build
npm run typecheck # chequeo de tipos (node + web)
npm run lint      # eslint
npm run format    # prettier
```

## Arquitectura

- `src/main` — proceso principal (Node). Único con acceso a `child_process`/git.
  - `gitRunner.ts` — ejecuta el binario git y devuelve `{ ok, cmd, stdout, stderr, code }`.
  - `index.ts` — ventana + handlers IPC (única puerta del renderer hacia git).
- `src/preload` — puente seguro (`contextBridge`). Expone `window.api` tipado.
- `src/renderer` — UI en React. Nunca toca git directo; habla por `window.api`.
- `src/shared` — tipos compartidos entre las tres capas.

Seguridad: `contextIsolation: true`, `nodeIntegration: false`.

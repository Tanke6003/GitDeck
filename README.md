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

## Empaquetado (.exe)

```bash
npm run build:win   # instalador NSIS -> dist/GitDeck-<version>-setup.exe
npm run build:dir   # solo la carpeta dist/win-unpacked (mas rapido para probar)
```

La configuración vive en `electron-builder.yml`. El instalador **no** borra
`userData` al desinstalar, así la lista de repos (`repos.json`) sobrevive a una
reinstalación.

### Si el build falla con "Cannot create symbolic link"

electron-builder descarga su toolset `winCodeSign`, cuyo `.7z` trae **symlinks de
macOS** (`libcrypto.dylib`, `libssl.dylib`). Windows no deja crearlos sin Modo
Desarrollador o permisos de admin, 7-Zip devuelve error y electron-builder
reintenta y falla — aunque esos archivos no se usan para nada en Windows.

Solución: dejar el toolset ya extraído en la caché, sin la carpeta `darwin`.
El nombre de la carpeta debe ser exactamente `winCodeSign-2.6.0`:

```bash
CACHE="$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
mkdir -p "$CACHE"
curl -sL -o "$CACHE/winCodeSign-2.6.0.7z" \
  https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z
node_modules/7zip-bin/win/x64/7za.exe x -bd \
  "$CACHE/winCodeSign-2.6.0.7z" "-o$CACHE/winCodeSign-2.6.0" "-x!darwin" -y
```

La alternativa es activar el Modo Desarrollador de Windows (Configuración →
Privacidad y seguridad → Para desarrolladores), que permite crear symlinks sin
elevar.

## Pruebas

```bash
npm test          # una pasada
npm run test:watch
```

Los tests (`src/main/__tests__/`) corren contra el binario **git real**, sobre
repos temporales que se crean al vuelo (`fixture.ts`), en vez de simular la
salida de git: lo que se comprueba es justo que los parseos aguanten lo que git
escribe de verdad, incluidos los casos raros (tags anotados vs ligeros, hunks
sin salto de línea final, `author-mail` en el blame, upstream `gone`…).

## Otros scripts

```bash
npm run build     # typecheck + compilar main + preload + renderer a ./out
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

import type { GitDeckApi } from './index'

declare global {
  interface Window {
    api: GitDeckApi
  }
}

export {}

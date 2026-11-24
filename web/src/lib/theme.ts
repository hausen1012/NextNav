// Theme handling. Templates use `.dark` on <html>; we drive it from a stored
// preference and rewrite the root element synchronously before React mounts
// (see index.html) so there is no flash.

export type Theme = 'light' | 'dark'

const KEY = 'nn-theme'

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme

  // Keep the data attribute in sync: it is what index.html and any
  // CSS-selector-based theming reads.
  root.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* private mode */
  }
}

export function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark')
}
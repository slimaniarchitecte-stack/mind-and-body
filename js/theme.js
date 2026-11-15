// Light, dark or auto. The choice is mirrored in localStorage so the first paint is right.

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try { localStorage.setItem('mb-theme', theme ?? 'auto'); } catch { /* private mode */ }
}

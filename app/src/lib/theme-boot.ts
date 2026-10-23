// Applies last launch's theme before anything renders, so a non-Dark theme
// (Light especially) doesn't paint Dark's picture and colours first. Imported
// first in main.tsx; applyTheme() in store.ts keeps the saved id current, and
// the profile's theme still wins once it loads.
export const THEME_KEY = "anchor:theme";

try {
  const id = localStorage.getItem(THEME_KEY);
  if (id) {
    document.documentElement.dataset.theme = id;
    document.documentElement.classList.toggle("dark", id !== "light");
  }
} catch { /* storage unavailable: start on Dark as before */ }

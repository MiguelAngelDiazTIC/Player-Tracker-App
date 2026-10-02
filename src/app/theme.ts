import { useSyncExternalStore } from "react";

export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const THEME_LABELS: Record<ThemeChoice, string> = {
  light: "Claro",
  dark: "Oscuro",
  system: "Como el sistema",
};

/**
 * La apariencia es una preferencia de este equipo, no un dato del jugador:
 * se guarda en el navegador de la app y no viaja en la exportación.
 */
const STORAGE_KEY = "player-tracker.theme";
const DEFAULT_CHOICE: ThemeChoice = "light";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const listeners = new Set<() => void>();

function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(DARK_QUERY).matches
  );
}

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return (THEME_CHOICES as readonly string[]).includes(stored ?? "")
      ? (stored as ThemeChoice)
      : DEFAULT_CHOICE;
  } catch {
    return DEFAULT_CHOICE;
  }
}

/** El tema que se ve: "como el sistema" se resuelve a claro u oscuro. */
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/** Pone el tema en `<html data-theme>`; los tokens de `index.css` hacen el resto. */
export function applyTheme(choice: ThemeChoice = readThemeChoice()): void {
  document.documentElement.dataset.theme = resolveTheme(choice);
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Sin almacenamiento, el tema vale hasta cerrar la app.
  }
  applyTheme(choice);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Con "como el sistema", el tema sigue los cambios del sistema operativo.
  const media =
    typeof window.matchMedia === "function"
      ? window.matchMedia(DARK_QUERY)
      : null;
  const onSystemChange = () => {
    applyTheme();
    listener();
  };
  media?.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener("change", onSystemChange);
  };
}

/** La elección del usuario y el tema que resulta de ella. */
export function useTheme(): {
  choice: ThemeChoice;
  theme: "light" | "dark";
  setChoice: (choice: ThemeChoice) => void;
} {
  const choice = useSyncExternalStore(subscribe, readThemeChoice);
  return { choice, theme: resolveTheme(choice), setChoice: setThemeChoice };
}

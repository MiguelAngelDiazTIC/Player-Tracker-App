import { Moon, Sun } from "lucide-react";
import { APP_LOGO_URL, APP_NAME } from "../app/brand";
import { sectionsFor, type SectionId } from "../app/sections";
import { useStore } from "../app/store";
import { useTheme } from "../app/theme";

interface SidebarProps {
  activeId: SectionId;
  onSelect: (id: SectionId) => void;
}

export function Sidebar({ activeId, onSelect }: SidebarProps) {
  const { edition } = useStore().services;
  const { theme, setChoice } = useTheme();
  const isDark = theme === "dark";
  const ThemeIcon = isDark ? Sun : Moon;

  return (
    <aside className="glass flex w-60 shrink-0 flex-col gap-4 rounded-md p-4">
      <div className="flex items-center gap-2 px-2">
        <img
          src={APP_LOGO_URL}
          alt=""
          className="shadow-pill size-9 shrink-0 rounded-sm"
        />
        <div>
          <p className="text-lg leading-tight font-bold">{APP_NAME}</p>
          <p className="text-ink/70 text-xs font-semibold tracking-wide uppercase">
            {edition.tagline}
          </p>
        </div>
      </div>

      <nav aria-label="Secciones">
        <ul className="flex flex-col gap-2">
          {sectionsFor(edition).map(({ id, label, icon: Icon }) => {
            const isActive = id === activeId;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  data-tour={`nav-${id}`}
                  onClick={() => onSelect(id)}
                  className={`flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-medium ${
                    isActive
                      ? "bg-surface text-primary shadow-pill font-semibold"
                      : "text-ink/80 hover:bg-surface/60 hover:text-ink active:bg-surface/80"
                  }`}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setChoice(isDark ? "light" : "dark")}
        className="text-ink/80 hover:bg-surface/60 hover:text-ink active:bg-surface/80 flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-medium"
      >
        <ThemeIcon aria-hidden="true" className="size-4 shrink-0" />
        {isDark ? "Modo claro" : "Modo oscuro"}
      </button>
    </aside>
  );
}

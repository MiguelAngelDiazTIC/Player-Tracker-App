import { Crosshair } from "lucide-react";
import { SECTIONS, type SectionId } from "../app/sections";

interface SidebarProps {
  activeId: SectionId;
  onSelect: (id: SectionId) => void;
}

export function Sidebar({ activeId, onSelect }: SidebarProps) {
  return (
    <aside className="glass flex w-60 shrink-0 flex-col gap-4 rounded-md p-4">
      <div className="flex items-center gap-2 px-2">
        <span className="bg-surface text-primary shadow-pill flex size-9 shrink-0 items-center justify-center rounded-full">
          <Crosshair aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="font-bold tracking-wide uppercase">Player Tracker</p>
          <p className="text-ink/70 text-xs font-semibold tracking-wide uppercase">
            Road to Top 1
          </p>
        </div>
      </div>

      <nav aria-label="Secciones">
        <ul className="flex flex-col gap-2">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const isActive = id === activeId;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-current={isActive ? "page" : undefined}
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
    </aside>
  );
}

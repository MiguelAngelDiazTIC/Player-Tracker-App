import { SECTIONS, type SectionId } from "../app/sections";

interface SidebarProps {
  activeId: SectionId;
  onSelect: (id: SectionId) => void;
}

export function Sidebar({ activeId, onSelect }: SidebarProps) {
  return (
    <aside className="glass flex w-60 shrink-0 flex-col gap-4 rounded-md p-4">
      <div className="px-2">
        <p className="text-lg font-bold">Player Tracker</p>
        <p className="text-surface/70 font-mono text-xs tracking-wide uppercase">
          Road to Top 1
        </p>
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
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium ${
                    isActive
                      ? "bg-primary text-surface"
                      : "text-surface/80 hover:bg-surface/10 hover:text-surface active:bg-surface/15"
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

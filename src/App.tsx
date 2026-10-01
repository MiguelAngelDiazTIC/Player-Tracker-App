import { useState } from "react";
import { DEFAULT_SECTION_ID, getSection, type SectionId } from "./app/sections";
import { Sidebar } from "./components/Sidebar";

export default function App() {
  const [activeId, setActiveId] = useState<SectionId>(DEFAULT_SECTION_ID);
  const section = getSection(activeId);

  return (
    <div className="flex h-full gap-4 p-4">
      <Sidebar activeId={activeId} onSelect={setActiveId} />

      <main className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="px-2">
          <h1 className="text-3xl font-bold">{section.label}</h1>
          <p className="text-surface/70">{section.description}</p>
        </header>

        <section
          aria-label={`Contenido de ${section.label}`}
          className="glass flex flex-1 items-center justify-center rounded-md p-4"
        >
          <p className="text-surface/70 font-mono text-xs tracking-wide uppercase">
            Disponible en la fase {section.phase}
          </p>
        </section>
      </main>
    </div>
  );
}

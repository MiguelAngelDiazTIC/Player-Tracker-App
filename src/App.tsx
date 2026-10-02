import { useState } from "react";
import { DEFAULT_SECTION_ID, getSection, type SectionId } from "./app/sections";
import type { Services } from "./app/services";
import { StoreProvider, useStore } from "./app/store";
import { Sidebar } from "./components/Sidebar";
import { Button } from "./components/ui/Button";
import { Notice } from "./components/ui/surfaces";
import { NO_FILTER, type DaySelection } from "./domain/filters";
import { AjustesView } from "./views/ajustes/AjustesView";
import { CalendarioView } from "./views/calendario/CalendarioView";
import { DashboardView } from "./views/dashboard/DashboardView";
import { InsightsView } from "./views/insights/InsightsView";
import { NotasView } from "./views/notas/NotasView";
import { RankedsView } from "./views/rankeds/RankedsView";
import { RevisionView } from "./views/revision/RevisionView";
import { ScrimsView } from "./views/scrims/ScrimsView";
import { DayPage } from "./views/tabla/DayPage";
import { TablaView, type TablaState } from "./views/tabla/TablaView";

const INITIAL_TABLA: TablaState = {
  preset: "all",
  filter: NO_FILTER,
  sorting: [{ id: "date", desc: true }],
};

function Shell() {
  const { error, dismissError } = useStore();
  const [activeId, setActiveId] = useState<SectionId>(DEFAULT_SECTION_ID);
  // Día abierto como página dentro de la Tabla.
  const [openDate, setOpenDate] = useState<string | null>(null);
  // Filtros y orden de la Tabla: se conservan al abrir un día y volver.
  const [tabla, setTabla] = useState<TablaState>(INITIAL_TABLA);
  // Día cuyas partidas se enseñan al llegar a Rankeds desde su página.
  const [rankedDate, setRankedDate] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const section = getSection(activeId);
  const showingDay = activeId === "tabla" && openDate !== null;

  function select(id: SectionId) {
    setActiveId(id);
    setOpenDate(null);
    setRankedDate(null);
  }

  /** Abre el registro de rankeds mostrando solo las partidas de un día. */
  function openRankeds(date: string) {
    select("rankeds");
    setRankedDate(date);
  }

  function openNote(id: string | null) {
    select("notas");
    setNoteId(id);
  }

  /** Enseña en la Tabla solo los días de un insight. */
  function showDays(selection: DaySelection) {
    setTabla({
      preset: "all",
      filter: { ...NO_FILTER, selection },
      sorting: tabla.sorting,
    });
    select("tabla");
  }

  /** Abre la página de un día desde cualquier vista. */
  function openDay(date: string) {
    setActiveId("tabla");
    setOpenDate(date);
  }

  function renderSection() {
    switch (activeId) {
      case "tabla":
        return openDate !== null ? (
          <DayPage
            date={openDate}
            onBack={() => setOpenDate(null)}
            onOpenDay={setOpenDate}
            onOpenScrims={() => select("scrims")}
            onOpenRankeds={openRankeds}
            onOpenNote={openNote}
          />
        ) : (
          <TablaView
            state={tabla}
            onStateChange={setTabla}
            onOpenDay={setOpenDate}
            onOpenSettings={() => select("ajustes")}
          />
        );
      case "rankeds":
        // La clave reinicia el filtro al llegar desde otro día.
        return (
          <RankedsView key={rankedDate ?? "todas"} focusDate={rankedDate} />
        );
      case "scrims":
        return <ScrimsView />;
      case "calendario":
        return <CalendarioView onOpenDay={openDay} />;
      case "dashboard":
        return <DashboardView />;
      case "insights":
        return <InsightsView onShowDays={showDays} />;
      case "revision":
        return <RevisionView onOpenDay={openDay} />;
      case "notas":
        return (
          <NotasView
            selectedId={noteId}
            onSelect={setNoteId}
            onOpenDay={openDay}
          />
        );
      case "ajustes":
        return <AjustesView />;
    }
  }

  return (
    <div className="flex h-full gap-4 p-4">
      <Sidebar activeId={activeId} onSelect={select} />

      <main className="flex min-w-0 flex-1 flex-col gap-4">
        {showingDay ? null : (
          <header className="px-2">
            <h1 className="text-3xl font-bold">{section.label}</h1>
            <p className="text-surface/70">{section.description}</p>
          </header>
        )}

        {error ? (
          <Notice tone="danger">
            <div className="flex items-center gap-2">
              <p className="flex-1 break-words">{error}</p>
              <Button variant="ghost" onClick={dismissError}>
                Cerrar aviso
              </Button>
            </div>
          </Notice>
        ) : null}

        {renderSection()}
      </main>
    </div>
  );
}

interface AppProps {
  services: Services;
}

export default function App({ services }: AppProps) {
  return (
    <StoreProvider services={services}>
      <Shell />
    </StoreProvider>
  );
}

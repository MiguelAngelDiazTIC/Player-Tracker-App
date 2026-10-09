import {
  CalendarDays,
  LayoutDashboard,
  Lightbulb,
  NotebookPen,
  Settings,
  StickyNote,
  Swords,
  Table2,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { Edition } from "./edition";

export interface Section {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const SECTIONS = [
  {
    id: "tabla",
    label: "Tabla",
    description: "El día en filas y columnas, como en tu hoja.",
    icon: Table2,
  },
  {
    id: "rankeds",
    label: "Rankeds",
    description: "Cada partida, para ver en qué mapas y agentes rindes mejor.",
    icon: Trophy,
  },
  {
    id: "scrims",
    label: "Scrims y 10mans",
    description: "Registro aparte, una entrada por partida.",
    icon: Swords,
  },
  {
    id: "calendario",
    label: "Calendario",
    description: "Mapa de calor mensual de la métrica que elijas.",
    icon: CalendarDays,
  },
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Tendencias y rachas, con rankeds y scrims por separado.",
    icon: LayoutDashboard,
  },
  {
    id: "insights",
    label: "Insights",
    description: "Qué hábitos te hacen jugar mejor, con tus números.",
    icon: Lightbulb,
  },
  {
    id: "revision",
    label: "Revisión semanal",
    description: "Resumen de la semana y tus 3 conclusiones.",
    icon: NotebookPen,
  },
  {
    id: "notas",
    label: "Notas",
    description: "VODs, lineups, rivales y objetivos, enlazados con [[ ]].",
    icon: StickyNote,
  },
  {
    id: "ajustes",
    label: "Ajustes",
    description: "Carpeta de datos, campos y exportación.",
    icon: Settings,
  },
] as const satisfies readonly Section[];

export type SectionId = (typeof SECTIONS)[number]["id"];

export type AppSection = Section & { id: SectionId };

export const DEFAULT_SECTION_ID: SectionId = "tabla";

/** Secciones de una edición: sin registro de scrims, la suya no existe. */
export function sectionsFor(
  edition: Pick<Edition, "scrimLog">,
): readonly AppSection[] {
  if (edition.scrimLog) return SECTIONS;
  return SECTIONS.filter((section) => section.id !== "scrims").map(
    (section): AppSection =>
      section.id === "dashboard"
        ? {
            ...section,
            description:
              "Tendencias y rachas, comparadas con el periodo anterior.",
          }
        : section,
  );
}

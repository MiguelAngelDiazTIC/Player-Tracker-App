import {
  CalendarDays,
  LayoutDashboard,
  NotebookPen,
  Settings,
  Swords,
  Table2,
  type LucideIcon,
} from "lucide-react";

export interface Section {
  id: string;
  label: string;
  description: string;
  /** Fase de docs/PLAN.md en la que se construye la vista. */
  phase: number;
  icon: LucideIcon;
}

export const SECTIONS = [
  {
    id: "tabla",
    label: "Tabla",
    description: "El día en filas y columnas, como en tu hoja.",
    phase: 1,
    icon: Table2,
  },
  {
    id: "scrims",
    label: "Scrims y 10mans",
    description: "Registro aparte, una entrada por partida.",
    phase: 1,
    icon: Swords,
  },
  {
    id: "calendario",
    label: "Calendario",
    description: "Mapa de calor mensual de la métrica que elijas.",
    phase: 2,
    icon: CalendarDays,
  },
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Tendencias y rachas, con rankeds y scrims por separado.",
    phase: 2,
    icon: LayoutDashboard,
  },
  {
    id: "revision",
    label: "Revisión semanal",
    description: "Resumen de la semana y tus 3 conclusiones.",
    phase: 2,
    icon: NotebookPen,
  },
  {
    id: "ajustes",
    label: "Ajustes",
    description: "Carpeta de datos, campos y exportación.",
    phase: 1,
    icon: Settings,
  },
] as const satisfies readonly Section[];

export type SectionId = (typeof SECTIONS)[number]["id"];

export const DEFAULT_SECTION_ID: SectionId = "tabla";

export function getSection(id: SectionId): Section {
  return SECTIONS.find((section) => section.id === id) ?? SECTIONS[0];
}

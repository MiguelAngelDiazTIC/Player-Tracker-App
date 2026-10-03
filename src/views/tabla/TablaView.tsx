import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useStore } from "../../app/store";
import { ChoiceCell, ValueInput } from "../../components/cells";
import { ExportButton } from "../../components/ExportButton";
import { FieldChart } from "../../components/charts/FieldChart";
import { STATUS_TINT } from "../../components/choices";
import { ariaSort } from "../../components/sort";
import { SortButton } from "../../components/SortButton";
import { Button } from "../../components/ui/Button";
import { Labeled, Select, TextInput } from "../../components/ui/fields";
import { Chip, Notice } from "../../components/ui/surfaces";
import { formatDate, todayIso } from "../../domain/dates";
import type { Day } from "../../domain/day";
import {
  groupFields,
  type FieldDefinition,
  type FieldValue,
} from "../../domain/fields";
import {
  allTags,
  feelingsPreview,
  filterDays,
  presetRange,
  RANGE_PRESET_LABELS,
  RANGE_PRESETS,
  type DayFilter,
  type RangePreset,
} from "../../domain/filters";
import { countScrimsByDate } from "../../domain/scrims";
import { daysSheet } from "../../domain/sheetExport";
import { fieldAverages, fieldStatus } from "../../domain/thresholds";
import { cx } from "../../lib/cx";

interface DayRow {
  day: Day;
  scrims: number;
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const helper = createColumnHelper<typeof features, DayRow>();

/** Las cabeceras de la tabla salen de los campos; las celdas se pintan aparte. */
function buildColumns(fields: readonly FieldDefinition[]) {
  return helper.columns([
    helper.accessor((row) => row.day.date, { id: "date", header: "Fecha" }),
    ...groupFields(fields).map(({ group, fields: groupFieldList }) =>
      helper.group({
        id: `group:${group}`,
        header: group,
        columns: helper.columns(
          groupFieldList.map((field) =>
            helper.accessor(
              (row): FieldValue | undefined =>
                field.type === "scrim_count"
                  ? row.scrims
                  : (row.day.values[field.key] ?? undefined),
              { id: field.key, header: field.label, sortUndefined: "last" },
            ),
          ),
        ),
      }),
    ),
    helper.accessor((row) => row.day.feelingsMd, {
      id: "feelings",
      header: "Feelings del día",
      enableSorting: false,
    }),
  ]);
}

export interface TablaState {
  preset: RangePreset;
  filter: DayFilter;
  sorting: SortingState;
}

interface TablaViewProps {
  state: TablaState;
  onStateChange: (state: TablaState) => void;
  onOpenDay: (date: string) => void;
  onOpenSettings: () => void;
}

const HEAD_CELL =
  "bg-panel border-ink/10 text-ink/70 sticky border-b p-0 text-xs font-semibold";

export function TablaView({
  state,
  onStateChange,
  onOpenDay,
  onOpenSettings,
}: TablaViewProps) {
  const { days, fields, scrims, createDay, setDayValue } = useStore();
  const today = todayIso();
  const [newDate, setNewDate] = useState(today);

  const activeFields = useMemo(
    () => fields.filter((field) => !field.archived),
    [fields],
  );
  const fieldByKey = useMemo(
    () => new Map(activeFields.map((field) => [field.key, field])),
    [activeFields],
  );
  const columns = useMemo(() => buildColumns(activeFields), [activeFields]);
  const averages = useMemo(
    () => fieldAverages(activeFields, days),
    [activeFields, days],
  );
  const tags = useMemo(() => allTags(days), [days]);
  const counts = useMemo(() => countScrimsByDate(scrims), [scrims]);
  // Los días que pasan los filtros: los mismos para la tabla y sus gráficas.
  const shownDays = useMemo(
    () => filterDays(days, state.filter),
    [days, state.filter],
  );
  const rows = useMemo<DayRow[]>(
    () => shownDays.map((day) => ({ day, scrims: counts[day.date] ?? 0 })),
    [shownDays, counts],
  );

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting: state.sorting },
    onSortingChange: (updater) =>
      onStateChange({
        ...state,
        sorting:
          typeof updater === "function" ? updater(state.sorting) : updater,
      }),
    enableSortingRemoval: false,
    getRowId: (row) => row.day.date,
  });

  const setFilter = (change: Partial<DayFilter>, preset = state.preset) =>
    onStateChange({
      ...state,
      preset,
      filter: { ...state.filter, ...change },
    });

  const exists = days.some((day) => day.date === newDate);
  const headerGroups = table.getHeaderGroups();
  const leafColumns = table.getAllLeafColumns();
  const sortedRows = table.getRowModel().rows;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 px-2">
        <Labeled label="Día" className="w-40">
          <TextInput
            type="date"
            value={newDate}
            max={today}
            onChange={(event) => setNewDate(event.target.value || today)}
          />
        </Labeled>
        <Button
          variant="primary"
          data-tour="add-day"
          onClick={() => {
            if (!exists) createDay(newDate);
            onOpenDay(newDate);
          }}
        >
          {exists
            ? "Abrir día"
            : newDate === today
              ? "Añadir hoy"
              : "Añadir día"}
        </Button>

        <div className="flex-1" />

        <Labeled label="Fechas" className="w-44">
          <Select
            value={state.preset}
            onChange={(event) => {
              const preset = event.target.value as RangePreset;
              setFilter(
                preset === "custom"
                  ? {}
                  : { range: presetRange(preset, today) },
                preset,
              );
            }}
          >
            {RANGE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {RANGE_PRESET_LABELS[preset]}
              </option>
            ))}
          </Select>
        </Labeled>
        {state.preset === "custom" ? (
          <>
            <Labeled label="Desde" className="w-40">
              <TextInput
                type="date"
                value={state.filter.range.from ?? ""}
                onChange={(event) =>
                  setFilter({
                    range: {
                      ...state.filter.range,
                      from: event.target.value || null,
                    },
                  })
                }
              />
            </Labeled>
            <Labeled label="Hasta" className="w-40">
              <TextInput
                type="date"
                value={state.filter.range.to ?? ""}
                onChange={(event) =>
                  setFilter({
                    range: {
                      ...state.filter.range,
                      to: event.target.value || null,
                    },
                  })
                }
              />
            </Labeled>
          </>
        ) : null}
        <Labeled label="Etiqueta" className="w-40">
          <Select
            value={state.filter.tag ?? ""}
            onChange={(event) => setFilter({ tag: event.target.value || null })}
          >
            <option value="">Todas</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </Select>
        </Labeled>
        <Labeled label="Buscar en feelings" className="w-48">
          <TextInput
            type="search"
            value={state.filter.search}
            onChange={(event) => setFilter({ search: event.target.value })}
          />
        </Labeled>
        <ExportButton
          disabled={rows.length === 0}
          sheet={() =>
            daysSheet(
              activeFields,
              sortedRows.map((row) => row.original.day),
              counts,
            )
          }
        />
      </div>

      {state.filter.selection ? (
        <Notice>
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1">
              Solo se muestran los {state.filter.selection.dates.length} días de{" "}
              <strong>{state.filter.selection.label}</strong>.
            </p>
            <Button
              variant="ghost"
              onClick={() => setFilter({ selection: null })}
            >
              Ver todos los días
            </Button>
          </div>
        </Notice>
      ) : null}

      {days.length === 0 ? (
        <div className="glass flex flex-1 flex-col items-center justify-center gap-4 rounded-md p-4 text-center">
          <p className="text-ink/70 max-w-md">
            Aún no hay ningún día. Añade el de hoy o importa tu hoja de cálculo
            para seguir donde la dejaste.
          </p>
          <Button onClick={onOpenSettings}>Importar mi hoja</Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 relative overflow-auto">
          <div className="glass-solid max-h-[60vh] shrink-0 relative overflow-auto rounded-md">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                Registro diario: una fila por día
              </caption>
              <thead>
                {headerGroups.map((group, depth) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => {
                      const isDate = header.column.id === "date";
                      const isLeaf = depth === headerGroups.length - 1;
                      const sorted = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          colSpan={header.colSpan}
                          scope={isLeaf ? "col" : "colgroup"}
                          aria-sort={
                            isLeaf && header.column.getCanSort()
                              ? ariaSort(sorted)
                              : undefined
                          }
                          className={cx(
                            HEAD_CELL,
                            depth === 0 ? "top-0 h-8" : "top-8 h-10",
                            isDate ? "left-0 z-30" : "z-20",
                            !isLeaf && "border-ink/10 border-l",
                          )}
                        >
                          {header.isPlaceholder ? null : !isLeaf ? (
                            <span className="px-2 tracking-wide uppercase">
                              <table.FlexRender header={header} />
                            </span>
                          ) : header.column.getCanSort() ? (
                            <SortButton
                              label={String(header.column.columnDef.header)}
                              sorted={sorted}
                              onToggle={() => header.column.toggleSorting()}
                            />
                          ) : (
                            <span className="px-2 tracking-wide uppercase">
                              <table.FlexRender header={header} />
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {sortedRows.map((row, rowIndex) => {
                  const { day, scrims: scrimCount } = row.original;
                  const label = formatDate(day.date);
                  return (
                    <tr key={row.id} className="group">
                      {leafColumns.map((column) => {
                        if (column.id === "date") {
                          return (
                            <th
                              key={column.id}
                              scope="row"
                              className="bg-panel border-ink/10 sticky left-0 z-10 border-b p-0 font-normal"
                            >
                              <button
                                type="button"
                                onClick={() => onOpenDay(day.date)}
                                title="Abrir la página del día"
                                className="hover:bg-ink/10 active:bg-ink/15 h-10 w-full px-2 font-mono whitespace-nowrap tabular-nums underline-offset-4 hover:underline focus-visible:-outline-offset-2"
                              >
                                {label}
                              </button>
                            </th>
                          );
                        }

                        if (column.id === "feelings") {
                          const preview = feelingsPreview(day.feelingsMd);
                          return (
                            <td
                              key={column.id}
                              className="border-ink/10 w-full max-w-0 min-w-48 border-b p-0"
                            >
                              <button
                                type="button"
                                onClick={() => onOpenDay(day.date)}
                                aria-label={`Feelings del ${label}`}
                                className="hover:bg-ink/10 active:bg-ink/15 flex h-10 w-full items-center gap-2 px-2 text-left focus-visible:-outline-offset-2"
                              >
                                <span
                                  className={cx(
                                    "min-w-0 flex-1 truncate",
                                    preview === "" && "text-ink/70",
                                  )}
                                >
                                  {preview || "Escribir…"}
                                </span>
                                {day.tags.slice(0, 3).map((tag) => (
                                  <Chip key={tag}>#{tag}</Chip>
                                ))}
                              </button>
                            </td>
                          );
                        }

                        const field = fieldByKey.get(column.id);
                        if (!field) return <td key={column.id} />;

                        const value = day.values[field.key] ?? null;
                        const status = fieldStatus(
                          field,
                          value,
                          averages[field.key] ?? null,
                        );
                        const cellLabel = `${field.label}, ${label}`;
                        const nav = { column: field.key, row: rowIndex };
                        const commit = (next: FieldValue) =>
                          setDayValue(day.date, field.key, next);

                        return (
                          <td
                            key={column.id}
                            className={cx(
                              "border-ink/10 min-w-16 border-b p-0",
                              STATUS_TINT[status],
                            )}
                          >
                            {field.type === "scrim_count" ? (
                              <span
                                className="flex h-10 items-center justify-center font-mono tabular-nums"
                                title="Se calcula desde el registro de scrims y 10mans"
                              >
                                {scrimCount}
                              </span>
                            ) : field.type === "bool" ||
                              field.type === "tristate" ? (
                              <ChoiceCell
                                type={field.type}
                                value={value}
                                onCommit={commit}
                                label={cellLabel}
                                nav={nav}
                              />
                            ) : (
                              <ValueInput
                                type={field.type}
                                value={value}
                                onCommit={commit}
                                label={cellLabel}
                                nav={nav}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="text-ink/70 p-4 text-center text-sm">
                Ningún día cumple los filtros.
              </p>
            ) : null}
          </div>
          <p className="text-ink/70 px-2 font-mono text-xs" role="status">
            {rows.length === days.length
              ? `${days.length} ${days.length === 1 ? "día" : "días"}`
              : `${rows.length} de ${days.length} días`}
          </p>
          <section
            aria-label="Gráficas del registro diario"
            className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3"
          >
            {activeFields.map((field) => (
              <FieldChart
                key={field.id}
                field={field}
                days={shownDays}
                allDays={days}
                scrimCounts={counts}
              />
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

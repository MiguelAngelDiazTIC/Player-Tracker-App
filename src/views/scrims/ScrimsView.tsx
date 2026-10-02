import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useStore } from "../../app/store";
import { EditableText, type CellNav } from "../../components/cells";
import { ScrimCharts } from "../../components/charts/ScrimCharts";
import { ariaSort } from "../../components/sort";
import { SortButton } from "../../components/SortButton";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Labeled, Select, TextInput } from "../../components/ui/fields";
import { formatDate, isIsoDate, todayIso } from "../../domain/dates";
import {
  inRange,
  presetRange,
  RANGE_PRESET_LABELS,
  RANGE_PRESETS,
  type DateRange,
  type RangePreset,
} from "../../domain/filters";
import {
  failed,
  isNoData,
  parsed,
  parseNumberText,
  type ParseResult,
} from "../../domain/parse";
import {
  kdRatio,
  SCRIM_KIND_LABELS,
  SCRIM_KINDS,
  SCRIM_RESULT_LABELS,
  SCRIM_RESULTS,
  VALORANT_AGENTS,
  VALORANT_MAPS,
  type ScrimKind,
  type ScrimMatch,
  type ScrimResult,
} from "../../domain/scrims";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const helper = createColumnHelper<typeof features, ScrimMatch>();

const columns = helper.columns([
  helper.accessor("date", { header: "Fecha" }),
  helper.accessor("kind", { header: "Tipo" }),
  helper.accessor("opponent", { header: "Rival" }),
  helper.accessor("map", { header: "Mapa" }),
  helper.accessor("agent", { header: "Agente" }),
  helper.accessor((match) => match.result ?? undefined, {
    id: "result",
    header: "Resultado",
    sortUndefined: "last",
  }),
  helper.accessor((match) => match.roundsWon ?? undefined, {
    id: "rounds",
    header: "Rondas",
    sortUndefined: "last",
  }),
  helper.accessor((match) => match.kills ?? undefined, {
    id: "kills",
    header: "Kills",
    sortUndefined: "last",
  }),
  helper.accessor((match) => match.deaths ?? undefined, {
    id: "deaths",
    header: "Muertes",
    sortUndefined: "last",
  }),
  helper.accessor((match) => kdRatio(match.kills, match.deaths) ?? undefined, {
    id: "kd",
    header: "K/D",
    sortUndefined: "last",
  }),
  helper.accessor((match) => match.acs ?? undefined, {
    id: "acs",
    header: "ACS",
    sortUndefined: "last",
  }),
  helper.accessor("vodUrl", { header: "VOD", enableSorting: false }),
  helper.accessor("notes", { header: "Notas", enableSorting: false }),
]);

function parseCount(text: string): ParseResult<number> {
  if (isNoData(text)) return parsed(null);
  const value = parseNumberText(text);
  if (value === null || !Number.isInteger(value) || value < 0) {
    return failed("Debe ser un número entero, 0 o más");
  }
  return parsed(value);
}

function parseText(text: string): ParseResult<string> {
  return parsed(text.trim());
}

const identity = (text: string) => text;

const CELL = "border-surface/10 border-b p-0";
const SELECT_CELL =
  "hover:bg-surface/10 h-10 w-full bg-transparent px-2 text-sm focus-visible:-outline-offset-2 [&>option]:bg-canvas [&>option]:text-surface";

interface ScrimsFilter {
  preset: RangePreset;
  range: DateRange;
  kind: ScrimKind | "";
}

/** Registro de 10mans y scrims: una fila por partida, aparte de las rankeds. */
export function ScrimsView() {
  const { scrims, addScrim, updateScrim, deleteScrim } = useStore();
  const today = todayIso();
  const [filter, setFilter] = useState<ScrimsFilter>({
    preset: "all",
    range: presetRange("all", today),
    kind: "",
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);
  const [deleting, setDeleting] = useState<ScrimMatch | null>(null);

  const rows = useMemo(
    () =>
      scrims.filter(
        (match) =>
          inRange(match.date, filter.range) &&
          (filter.kind === "" || match.kind === filter.kind),
      ),
    [scrims, filter],
  );

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    getRowId: (match) => match.id,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 px-2">
        <Button variant="primary" onClick={() => addScrim(today)}>
          <Plus aria-hidden="true" className="size-4" />
          Añadir partida
        </Button>
        <div className="flex-1" />
        <Labeled label="Fechas" className="w-44">
          <Select
            value={filter.preset}
            onChange={(event) => {
              const preset = event.target.value as RangePreset;
              setFilter({
                ...filter,
                preset,
                range:
                  preset === "custom"
                    ? filter.range
                    : presetRange(preset, today),
              });
            }}
          >
            {RANGE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {RANGE_PRESET_LABELS[preset]}
              </option>
            ))}
          </Select>
        </Labeled>
        {filter.preset === "custom" ? (
          <>
            <Labeled label="Desde" className="w-40">
              <TextInput
                type="date"
                value={filter.range.from ?? ""}
                onChange={(event) =>
                  setFilter({
                    ...filter,
                    range: {
                      ...filter.range,
                      from: event.target.value || null,
                    },
                  })
                }
              />
            </Labeled>
            <Labeled label="Hasta" className="w-40">
              <TextInput
                type="date"
                value={filter.range.to ?? ""}
                onChange={(event) =>
                  setFilter({
                    ...filter,
                    range: { ...filter.range, to: event.target.value || null },
                  })
                }
              />
            </Labeled>
          </>
        ) : null}
        <Labeled label="Tipo" className="w-40">
          <Select
            value={filter.kind}
            onChange={(event) =>
              setFilter({
                ...filter,
                kind: event.target.value as ScrimKind | "",
              })
            }
          >
            <option value="">Todos</option>
            {SCRIM_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {SCRIM_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Labeled>
      </div>

      {scrims.length === 0 ? (
        <div className="glass flex flex-1 items-center justify-center rounded-md p-4 text-center">
          <p className="text-surface/70 max-w-md">
            Aún no hay partidas. Añade cada 10mans o scrim que juegues: sus
            estadísticas van aparte de las rankeds y la fila del día solo
            muestra cuántas jugaste.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
          <div className="glass-solid max-h-[60vh] shrink-0 overflow-auto rounded-md">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                Scrims y 10mans: una fila por partida
              </caption>
              <thead>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => {
                      const sorted = header.column.getIsSorted();
                      const label = String(header.column.columnDef.header);
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={
                            header.column.getCanSort()
                              ? ariaSort(sorted)
                              : undefined
                          }
                          className={`bg-panel border-surface/10 text-surface/70 sticky top-0 h-10 border-b p-0 font-mono text-xs font-medium ${
                            header.column.id === "date" ? "left-0 z-30" : "z-20"
                          }`}
                        >
                          {header.column.getCanSort() ? (
                            <SortButton
                              label={label}
                              sorted={sorted}
                              onToggle={() => header.column.toggleSorting()}
                            />
                          ) : (
                            <span className="px-2 tracking-wide uppercase">
                              {label}
                            </span>
                          )}
                        </th>
                      );
                    })}
                    <th
                      scope="col"
                      className="bg-panel border-surface/10 sticky top-0 z-20 border-b"
                    >
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row, rowIndex) => {
                  const match = row.original;
                  const name = `partida del ${formatDate(match.date)}`;
                  const nav = (column: string): CellNav => ({
                    column,
                    row: rowIndex,
                  });
                  const change = (patch: Partial<ScrimMatch>) =>
                    updateScrim({ ...match, ...patch });
                  const kd = kdRatio(match.kills, match.deaths);

                  const text = (
                    column: "opponent" | "map" | "agent" | "vodUrl" | "notes",
                    label: string,
                    list?: string,
                  ) => (
                    <EditableText<string>
                      value={match[column] === "" ? null : match[column]}
                      format={identity}
                      parse={parseText}
                      onCommit={(value) => change({ [column]: value ?? "" })}
                      label={`${label}, ${name}`}
                      nav={nav(column)}
                      list={list}
                    />
                  );
                  const count = (
                    column:
                      "roundsWon" | "roundsLost" | "kills" | "deaths" | "acs",
                    label: string,
                  ) => (
                    <EditableText<number>
                      value={match[column]}
                      format={String}
                      parse={parseCount}
                      onCommit={(value) => change({ [column]: value })}
                      label={`${label}, ${name}`}
                      nav={nav(column)}
                      numeric
                    />
                  );

                  return (
                    <tr key={row.id}>
                      <td
                        className={`${CELL} bg-panel sticky left-0 z-10 min-w-36`}
                      >
                        <input
                          type="date"
                          aria-label={`Fecha, ${name}`}
                          value={match.date}
                          onChange={(event) => {
                            if (isIsoDate(event.target.value)) {
                              change({ date: event.target.value });
                            }
                          }}
                          className="hover:bg-surface/10 h-10 w-full bg-transparent px-2 font-mono text-sm tabular-nums focus-visible:-outline-offset-2"
                        />
                      </td>
                      <td className={`${CELL} min-w-28`}>
                        <select
                          aria-label={`Tipo, ${name}`}
                          value={match.kind}
                          onChange={(event) =>
                            change({ kind: event.target.value as ScrimKind })
                          }
                          className={SELECT_CELL}
                        >
                          {SCRIM_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {SCRIM_KIND_LABELS[kind]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`${CELL} min-w-32`}>
                        {text("opponent", "Rival")}
                      </td>
                      <td className={`${CELL} min-w-28`}>
                        {text("map", "Mapa", "valorant-maps")}
                      </td>
                      <td className={`${CELL} min-w-28`}>
                        {text("agent", "Agente", "valorant-agents")}
                      </td>
                      <td className={`${CELL} min-w-32`}>
                        <select
                          aria-label={`Resultado, ${name}`}
                          value={match.result ?? ""}
                          onChange={(event) =>
                            change({
                              result:
                                (event.target.value as ScrimResult | "") ||
                                null,
                            })
                          }
                          className={SELECT_CELL}
                        >
                          <option value="">—</option>
                          {SCRIM_RESULTS.map((result) => (
                            <option key={result} value={result}>
                              {SCRIM_RESULT_LABELS[result]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`${CELL} min-w-28`}>
                        <div className="flex items-center">
                          {count("roundsWon", "Rondas ganadas")}
                          <span aria-hidden="true" className="text-surface/70">
                            –
                          </span>
                          {count("roundsLost", "Rondas perdidas")}
                        </div>
                      </td>
                      <td className={`${CELL} min-w-20`}>
                        {count("kills", "Kills")}
                      </td>
                      <td className={`${CELL} min-w-20`}>
                        {count("deaths", "Muertes")}
                      </td>
                      <td
                        className={`${CELL} min-w-20 text-center font-mono tabular-nums`}
                        title="Kills entre muertes"
                      >
                        {kd === null ? (
                          <span className="text-surface/70">—</span>
                        ) : (
                          kd.toFixed(2)
                        )}
                      </td>
                      <td className={`${CELL} min-w-20`}>
                        {count("acs", "ACS")}
                      </td>
                      <td className={`${CELL} min-w-32`}>
                        {text("vodUrl", "Enlace al VOD")}
                      </td>
                      <td className={`${CELL} min-w-48`}>
                        {text("notes", "Notas")}
                      </td>
                      <td className={`${CELL} min-w-10`}>
                        <button
                          type="button"
                          aria-label={`Eliminar la ${name}`}
                          title="Eliminar partida"
                          onClick={() => setDeleting(match)}
                          className="text-surface/80 hover:bg-danger/25 hover:text-surface active:bg-danger/40 flex size-10 items-center justify-center focus-visible:-outline-offset-2"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="text-surface/70 p-4 text-center text-sm">
                Ninguna partida cumple los filtros.
              </p>
            ) : null}
          </div>
          <p className="text-surface/70 px-2 font-mono text-xs" role="status">
            {rows.length === scrims.length
              ? `${scrims.length} ${scrims.length === 1 ? "partida" : "partidas"}`
              : `${rows.length} de ${scrims.length} partidas`}
          </p>
          <ScrimCharts matches={rows} />
        </div>
      )}

      <datalist id="valorant-maps">
        {VALORANT_MAPS.map((map) => (
          <option key={map} value={map} />
        ))}
      </datalist>
      <datalist id="valorant-agents">
        {VALORANT_AGENTS.map((agent) => (
          <option key={agent} value={agent} />
        ))}
      </datalist>

      {deleting ? (
        <Dialog
          title="¿Eliminar esta partida?"
          onClose={() => setDeleting(null)}
          actions={
            <>
              <Button onClick={() => setDeleting(null)}>Cancelar</Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteScrim(deleting.id);
                  setDeleting(null);
                }}
              >
                Eliminar partida
              </Button>
            </>
          }
        >
          <p>
            {SCRIM_KIND_LABELS[deleting.kind]} del {formatDate(deleting.date)}
            {deleting.opponent ? ` contra ${deleting.opponent}` : ""}. El
            recuento de ese día bajará en la Tabla.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}

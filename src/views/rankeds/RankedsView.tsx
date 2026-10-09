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
import { rankedsSheet } from "../../domain/sheetExport";
import { useStore } from "../../app/store";
import { ExportButton } from "../../components/ExportButton";
import { EditableText, type CellNav } from "../../components/cells";
import {
  ResultsChart,
  ValueChart,
} from "../../components/charts/CategoryCharts";
import { ariaSort } from "../../components/sort";
import { SortButton } from "../../components/SortButton";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Labeled, Select, TextInput } from "../../components/ui/fields";
import { Chip } from "../../components/ui/surfaces";
import { formatDate, isIsoDate, todayIso } from "../../domain/dates";
import {
  inRange,
  presetRange,
  RANGE_PRESET_LABELS,
  RANGE_PRESETS,
  type DateRange,
  type RangePreset,
} from "../../domain/filters";
import { formatPercent, formatStat } from "../../domain/format";
import {
  failed,
  isNoData,
  parsed,
  parseNumberText,
  type ParseResult,
} from "../../domain/parse";
import {
  isSyncedSession,
  rankedBy,
  rankedTotals,
  sessionAcs,
  type RankedSession,
} from "../../domain/ranked";
import {
  kdRatio,
  SCRIM_RESULT_LABELS,
  SCRIM_RESULTS,
  VALORANT_AGENTS,
  VALORANT_MAPS,
  type ScrimResult,
} from "../../domain/scrims";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const helper = createColumnHelper<typeof features, RankedSession>();

const columns = helper.columns([
  helper.accessor("date", { header: "Fecha" }),
  helper.accessor("map", { header: "Mapa" }),
  helper.accessor("agent", { header: "Agente" }),
  helper.accessor((session) => session.result ?? undefined, {
    id: "result",
    header: "Resultado",
    sortUndefined: "last",
  }),
  helper.accessor((session) => session.kills ?? undefined, {
    id: "kills",
    header: "Kills",
    sortUndefined: "last",
  }),
  helper.accessor((session) => session.deaths ?? undefined, {
    id: "deaths",
    header: "Muertes",
    sortUndefined: "last",
  }),
  helper.accessor(
    (session) => kdRatio(session.kills, session.deaths) ?? undefined,
    { id: "kd", header: "K/D", sortUndefined: "last" },
  ),
  helper.accessor((session) => session.rounds ?? undefined, {
    id: "rounds",
    header: "Rondas",
    sortUndefined: "last",
  }),
  helper.accessor((session) => sessionAcs(session) ?? undefined, {
    id: "acs",
    header: "ACS",
    sortUndefined: "last",
  }),
  helper.accessor("source", { header: "Origen", enableSorting: false }),
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

const CELL = "border-ink/10 border-b p-0";
const SELECT_CELL =
  "hover:bg-ink/10 h-10 w-full bg-transparent px-2 text-sm focus-visible:-outline-offset-2 [&>option]:bg-canvas [&>option]:text-ink";

interface RankedsFilter {
  preset: RangePreset;
  range: DateRange;
}

interface RankedsViewProps {
  /** Al venir de la página de un día, solo se muestran sus partidas. */
  focusDate?: string | null;
}

/** Registro de rankeds partida a partida, con sus cifras por mapa y agente. */
export function RankedsView({ focusDate = null }: RankedsViewProps) {
  const { sessions, addSession, updateSession, deleteSession } = useStore();
  const today = todayIso();
  const [filter, setFilter] = useState<RankedsFilter>(() =>
    focusDate
      ? { preset: "custom", range: { from: focusDate, to: focusDate } }
      : { preset: "all", range: presetRange("all", today) },
  );
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);
  const [deleting, setDeleting] = useState<RankedSession | null>(null);

  const rows = useMemo(
    () => sessions.filter((session) => inRange(session.date, filter.range)),
    [sessions, filter],
  );
  const totals = useMemo(() => rankedTotals(rows), [rows]);
  const byMap = useMemo(() => rankedBy(rows, "map"), [rows]);
  const byAgent = useMemo(() => rankedBy(rows, "agent"), [rows]);

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    getRowId: (session) => session.id,
  });

  const kd = (value: number | null) => formatStat("decimal", value);
  const acs = (value: number | null) =>
    value === null ? "—" : String(Math.round(value));
  const record = `${totals.wins}V ${totals.losses}D ${totals.draws}E · ${formatPercent(totals.winRate)}`;
  // Una partida nueva cae dentro del filtro: en el día enfocado o en hoy.
  const newDate = focusDate ?? today;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 px-2">
        <Button variant="primary" onClick={() => addSession(newDate)}>
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
        <ExportButton
          disabled={rows.length === 0}
          sheet={() =>
            rankedsSheet(table.getRowModel().rows.map((row) => row.original))
          }
        />
      </div>

      {sessions.length === 0 ? (
        <div className="glass flex flex-1 items-center justify-center rounded-md p-4 text-center">
          <p className="text-ink/70 max-w-md">
            Aún no hay partidas. Apunta cada ranked con su mapa y su agente para
            ver dónde rindes mejor. Es opcional: la fila del día sigue
            funcionando sin ellas.
          </p>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
          <div className="glass-solid relative max-h-[60vh] shrink-0 overflow-auto rounded-md">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                Rankeds: una fila por partida
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
                          className={`bg-panel border-ink/10 text-ink/70 sticky top-0 h-10 border-b p-0 text-xs font-semibold ${
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
                      className="bg-panel border-ink/10 sticky top-0 z-20 border-b"
                    >
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row, rowIndex) => {
                  const session = row.original;
                  const name = `partida del ${formatDate(session.date)}`;
                  const nav = (column: string): CellNav => ({
                    column,
                    row: rowIndex,
                  });
                  const change = (patch: Partial<RankedSession>) =>
                    updateSession({ ...session, ...patch });
                  const sessionKd = kdRatio(session.kills, session.deaths);
                  const currentAcs = sessionAcs(session);

                  const text = (
                    column: "map" | "agent",
                    label: string,
                    list: string,
                  ) => (
                    <EditableText<string>
                      value={session[column] === "" ? null : session[column]}
                      format={identity}
                      parse={parseText}
                      onCommit={(value) => change({ [column]: value ?? "" })}
                      label={`${label}, ${name}`}
                      nav={nav(column)}
                      list={list}
                    />
                  );
                  const count = (column: "kills" | "deaths", label: string) => (
                    <EditableText<number>
                      value={session[column]}
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
                          value={session.date}
                          onChange={(event) => {
                            if (isIsoDate(event.target.value)) {
                              change({ date: event.target.value });
                            }
                          }}
                          className="hover:bg-ink/10 h-10 w-full bg-transparent px-2 font-mono text-sm tabular-nums focus-visible:-outline-offset-2"
                        />
                      </td>
                      <td className={`${CELL} min-w-28`}>
                        {text("map", "Mapa", "ranked-maps")}
                      </td>
                      <td className={`${CELL} min-w-28`}>
                        {text("agent", "Agente", "ranked-agents")}
                      </td>
                      <td className={`${CELL} min-w-32`}>
                        <select
                          aria-label={`Resultado, ${name}`}
                          value={session.result ?? ""}
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
                        {sessionKd === null ? (
                          <span className="text-ink/70">—</span>
                        ) : (
                          sessionKd.toFixed(2)
                        )}
                      </td>
                      <td className={`${CELL} min-w-20`}>
                        <EditableText<number>
                          value={session.rounds}
                          format={String}
                          parse={parseCount}
                          // El ACS apuntado se conserva al corregir las rondas.
                          onCommit={(rounds) =>
                            change({
                              rounds,
                              score:
                                currentAcs === null || !rounds
                                  ? session.score
                                  : Math.round(currentAcs * rounds),
                            })
                          }
                          label={`Rondas, ${name}`}
                          nav={nav("rounds")}
                          numeric
                        />
                      </td>
                      <td className={`${CELL} min-w-20`}>
                        <EditableText<number>
                          value={
                            currentAcs === null ? null : Math.round(currentAcs)
                          }
                          format={String}
                          parse={(value) =>
                            session.rounds || isNoData(value)
                              ? parseCount(value)
                              : failed("Pon antes las rondas de la partida")
                          }
                          // Se guarda la puntuación total: ACS por rondas.
                          onCommit={(value) =>
                            change({
                              score:
                                value === null
                                  ? null
                                  : value * (session.rounds ?? 0),
                            })
                          }
                          label={`ACS, ${name}`}
                          nav={nav("acs")}
                          numeric
                        />
                      </td>
                      <td className={`${CELL} min-w-28 px-2`}>
                        <Chip>
                          {isSyncedSession(session) ? "Sincronizada" : "Manual"}
                        </Chip>
                      </td>
                      <td className={`${CELL} min-w-10`}>
                        <button
                          type="button"
                          aria-label={`Eliminar la ${name}`}
                          title="Eliminar partida"
                          onClick={() => setDeleting(session)}
                          className="text-ink/80 hover:bg-danger/25 hover:text-ink active:bg-danger/40 flex size-10 items-center justify-center focus-visible:-outline-offset-2"
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
              <p className="text-ink/70 p-4 text-center text-sm">
                Ninguna partida en esas fechas.
              </p>
            ) : null}
          </div>
          <p className="text-ink/70 px-2 font-mono text-xs" role="status">
            {rows.length === sessions.length
              ? `${sessions.length} ${sessions.length === 1 ? "partida" : "partidas"}`
              : `${rows.length} de ${sessions.length} partidas`}
            {totals.kd === null ? "" : ` · K/D ${kd(totals.kd)}`}
            {totals.acs === null ? "" : ` · ACS ${acs(totals.acs)}`}
          </p>

          <section
            aria-label="Gráficas de rankeds"
            className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3"
          >
            <ResultsChart
              title="Resultados por mapa"
              summary={record}
              rows={byMap}
            />
            <ValueChart
              title="K/D por mapa"
              summary={`Global ${kd(totals.kd)}`}
              rows={byMap.map((group) => ({ ...group, value: group.kd }))}
              format={kd}
            />
            <ValueChart
              title="ACS por mapa"
              summary={`Global ${acs(totals.acs)}`}
              rows={byMap.map((group) => ({ ...group, value: group.acs }))}
              format={acs}
            />
            <ResultsChart
              title="Resultados por agente"
              summary={record}
              rows={byAgent}
            />
            <ValueChart
              title="K/D por agente"
              summary={`Global ${kd(totals.kd)}`}
              rows={byAgent.map((group) => ({ ...group, value: group.kd }))}
              format={kd}
            />
            <ValueChart
              title="ACS por agente"
              summary={`Global ${acs(totals.acs)}`}
              rows={byAgent.map((group) => ({ ...group, value: group.acs }))}
              format={acs}
            />
          </section>
        </div>
      )}

      <datalist id="ranked-maps">
        {VALORANT_MAPS.map((map) => (
          <option key={map} value={map} />
        ))}
      </datalist>
      <datalist id="ranked-agents">
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
                  deleteSession(deleting.id);
                  setDeleting(null);
                }}
              >
                Eliminar partida
              </Button>
            </>
          }
        >
          <p>
            Ranked del {formatDate(deleting.date)}
            {deleting.map ? ` en ${deleting.map}` : ""}. La fila de ese día no
            cambia.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}

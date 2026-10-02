import { useMemo, useState } from "react";
import { useStore } from "../../app/store";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/fields";
import { Card, Notice } from "../../components/ui/surfaces";
import type { ImportStrategy } from "../../data/backup";
import { applySheetImport } from "../../data/sheetApply";
import { formatDate } from "../../domain/dates";
import { readSheetFile } from "../../domain/sheetFile";
import {
  findHeaderRow,
  guessMapping,
  parseSheet,
  sheetHeaders,
  type ColumnTarget,
  type SheetCell,
  type SheetMatrix,
} from "../../domain/sheetImport";
import { formatFieldValue } from "../../domain/values";
import { newId } from "../../lib/id";

interface LoadedSheet {
  fileName: string;
  matrix: SheetMatrix;
  headerRow: number;
  headers: string[];
}

type Message = { tone: "success" | "danger"; text: string } | null;

const PREVIEW_ROWS = 8;
const MAX_PROBLEMS_SHOWN = 30;

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function sampleText(cell: SheetCell | undefined): string {
  if (cell === undefined || cell === null) return "";
  return typeof cell === "object" ? cell.text : String(cell);
}

const TH =
  "border-ink/10 text-ink/70 border-b px-2 py-2 text-left text-xs font-semibold tracking-wide uppercase";
const TD = "border-ink/10 border-b px-2 py-2";

/** Importa la hoja de cálculo (CSV o Excel) con vista previa antes de guardar. */
export function SheetImportPanel() {
  const { services, fields, days, reload } = useStore();
  const { repository, platform } = services;
  const [sheet, setSheet] = useState<LoadedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnTarget[]>([]);
  const [strategy, setStrategy] = useState<ImportStrategy>("keep");
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  const activeFields = useMemo(
    () => fields.filter((field) => !field.archived),
    [fields],
  );
  const result = useMemo(
    () =>
      sheet
        ? parseSheet(sheet.matrix, sheet.headerRow, mapping, activeFields)
        : null,
    [sheet, mapping, activeFields],
  );

  async function chooseFile() {
    setMessage(null);
    try {
      const file = await platform.pickFile({
        title: "Hoja de cálculo",
        extensions: ["csv", "xlsx", "xls", "ods"],
      });
      if (!file) return;

      const matrix = readSheetFile(file.bytes, file.name);
      const headerRow = findHeaderRow(matrix);
      const headers = sheetHeaders(matrix, headerRow);
      if (matrix.length === 0) {
        setMessage({ tone: "danger", text: `${file.name} está vacío.` });
        return;
      }
      setSheet({ fileName: file.name, matrix, headerRow, headers });
      setMapping(guessMapping(headers, activeFields));
    } catch (cause) {
      setMessage({
        tone: "danger",
        text: `No se pudo leer el archivo: ${describe(cause)}`,
      });
    }
  }

  async function importSheet() {
    if (!result) return;
    setBusy(true);
    try {
      const backup = await platform.backupDatabase();
      const summary = await applySheetImport(
        repository,
        result,
        strategy,
        newId,
      );
      await reload();
      setSheet(null);
      setMessage({
        tone: "success",
        text:
          `Importación hecha: ${plural(summary.daysWritten, "día", "días")}` +
          (summary.daysSkipped > 0
            ? `, ${plural(summary.daysSkipped, "conservado como estaba", "conservados como estaban")}`
            : "") +
          (summary.scrimsCreated > 0
            ? ` y ${plural(summary.scrimsCreated, "partida vacía creada", "partidas vacías creadas")} en Scrims y 10mans`
            : "") +
          `. Copia de seguridad previa: ${backup}`,
      });
    } catch (cause) {
      setMessage({
        tone: "danger",
        text: `No se pudo importar: ${describe(cause)}`,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!sheet || !result) {
    return (
      <Card title="Importar mi hoja">
        <p className="text-ink/70 text-sm">
          Trae tus días desde un CSV o un Excel. Verás cómo se ha entendido cada
          columna antes de guardar nada.
        </p>
        <div>
          <Button onClick={() => void chooseFile()}>Elegir archivo…</Button>
        </div>
        {message ? (
          <Notice tone={message.tone}>
            <p className="break-words">{message.text}</p>
          </Notice>
        ) : null}
      </Card>
    );
  }

  const existing = new Set(days.map((day) => day.date));
  const repeated = result.days.filter((day) => existing.has(day.date)).length;
  const willWrite =
    strategy === "keep" ? result.days.length - repeated : result.days.length;
  const scrimTotal = Object.values(result.scrimCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const hasDate = mapping.includes("date");
  const firstData = sheet.matrix
    .slice(sheet.headerRow + 1)
    .find((row) => row.some((cell) => sampleText(cell) !== ""));
  const mappedFields = activeFields.filter(
    (field) =>
      field.type !== "scrim_count" && mapping.includes(`field:${field.key}`),
  );

  function setTarget(column: number, target: ColumnTarget) {
    setMapping((current) =>
      current.map((other, index) => {
        if (index === column) return target;
        // Un destino solo puede venir de una columna.
        return target !== "ignore" && other === target ? "ignore" : other;
      }),
    );
  }

  return (
    <Card
      title={`Importar ${sheet.fileName}`}
      actions={
        <Button variant="ghost" onClick={() => setSheet(null)}>
          Cancelar
        </Button>
      }
    >
      <section aria-labelledby="sheet-columns" className="flex flex-col gap-2">
        <h3 id="sheet-columns" className="font-semibold">
          1. Columnas
        </h3>
        <div className="glass-solid relative overflow-auto rounded-md">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Columna de la hoja
                </th>
                <th scope="col" className={TH}>
                  Ejemplo
                </th>
                <th scope="col" className={TH}>
                  Va a
                </th>
              </tr>
            </thead>
            <tbody>
              {sheet.headers.map((header, column) => {
                const sample = sampleText(firstData?.[column]);
                if (header === "" && sample === "") return null;
                const name = header || `Columna ${column + 1}`;
                return (
                  <tr key={column}>
                    <th scope="row" className={`${TD} text-left font-normal`}>
                      {name}
                    </th>
                    <td
                      className={`${TD} text-ink/70 max-w-64 truncate font-mono`}
                    >
                      {sample}
                    </td>
                    <td className={`${TD} w-64`}>
                      <Select
                        aria-label={`Destino de ${name}`}
                        value={mapping[column] ?? "ignore"}
                        onChange={(event) =>
                          setTarget(column, event.target.value as ColumnTarget)
                        }
                      >
                        <option value="ignore">No importar</option>
                        <option value="date">Fecha</option>
                        <option value="feelings">Feelings del día</option>
                        {activeFields.map((field) => (
                          <option key={field.id} value={`field:${field.key}`}>
                            {field.label}
                            {field.type === "scrim_count"
                              ? " (crea partidas vacías)"
                              : ""}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="sheet-check" className="flex flex-col gap-2">
        <h3 id="sheet-check" className="font-semibold">
          2. Revisión
        </h3>
        {!hasDate ? (
          <Notice tone="danger">
            Indica qué columna es la fecha: sin ella no se puede importar.
          </Notice>
        ) : (
          <Notice tone={result.days.length > 0 ? "success" : "warning"}>
            {plural(result.days.length, "día entendido", "días entendidos")}
            {result.days.length > 0
              ? `, del ${formatDate(result.days[0].date)} al ${formatDate(result.days[result.days.length - 1].date)}.`
              : "."}
          </Notice>
        )}

        {result.skippedRows.length > 0 ? (
          <Notice tone="warning">
            <p>
              {plural(
                result.skippedRows.length,
                "fila no se importará",
                "filas no se importarán",
              )}
              :
            </p>
            <ul className="mt-2 list-disc pl-4">
              {result.skippedRows.slice(0, MAX_PROBLEMS_SHOWN).map((row) => (
                <li key={row.row}>
                  Fila {row.row}: {row.reason}
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {result.problems.length > 0 ? (
          <Notice tone="warning">
            <p>
              {plural(
                result.problems.length,
                "celda no se ha entendido y quedará sin dato",
                "celdas no se han entendido y quedarán sin dato",
              )}
              :
            </p>
            <ul className="mt-2 list-disc pl-4">
              {result.problems.slice(0, MAX_PROBLEMS_SHOWN).map((problem) => (
                <li key={`${problem.row}-${problem.column}`}>
                  Fila {problem.row}, {problem.column}:{" "}
                  <span className="font-mono">"{problem.raw}"</span>.{" "}
                  {problem.reason}
                </li>
              ))}
              {result.problems.length > MAX_PROBLEMS_SHOWN ? (
                <li>…y {result.problems.length - MAX_PROBLEMS_SHOWN} más</li>
              ) : null}
            </ul>
          </Notice>
        ) : null}

        {scrimTotal > 0 ? (
          <Notice>
            La hoja suma{" "}
            {plural(
              scrimTotal,
              "partida de 10mans o scrims",
              "partidas de 10mans o scrims",
            )}
            . Se crearán como partidas vacías en su registro, para que el
            recuento de cada día coincida y puedas rellenarlas después.
          </Notice>
        ) : null}

        {result.days.length > 0 ? (
          <div className="glass-solid relative overflow-auto rounded-md">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                Vista previa de los primeros días
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Fecha
                  </th>
                  {mappedFields.map((field) => (
                    <th key={field.id} scope="col" className={TH}>
                      {field.label}
                    </th>
                  ))}
                  <th scope="col" className={TH}>
                    Feelings
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.days.slice(0, PREVIEW_ROWS).map((day) => (
                  <tr key={day.date}>
                    <th
                      scope="row"
                      className={`${TD} text-left font-mono font-normal whitespace-nowrap`}
                    >
                      {formatDate(day.date)}
                    </th>
                    {mappedFields.map((field) => (
                      <td key={field.id} className={`${TD} font-mono`}>
                        {formatFieldValue(
                          field.type,
                          day.values[field.key] ?? null,
                        ) || <span className="text-ink/70">—</span>}
                      </td>
                    ))}
                    <td className={`${TD} max-w-80 truncate`}>
                      {day.feelingsMd}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.days.length > PREVIEW_ROWS ? (
              <p className="text-ink/70 p-2 text-xs">
                …y {result.days.length - PREVIEW_ROWS} días más.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="sheet-save" className="flex flex-col gap-2">
        <h3 id="sheet-save" className="font-semibold">
          3. Guardar
        </h3>
        {repeated > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm">
              {plural(repeated, "día ya existe", "días ya existen")} en la app.
              ¿Qué hago con ellos?
            </legend>
            {(
              [
                ["keep", "Conservar los que ya tengo"],
                ["replace", "Sustituirlos por los de la hoja"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sheet-strategy"
                  className="accent-primary size-4"
                  checked={strategy === value}
                  onChange={() => setStrategy(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        ) : null}
        {message ? (
          <Notice tone={message.tone}>
            <p className="break-words">{message.text}</p>
          </Notice>
        ) : null}
        <div>
          <Button
            variant="primary"
            disabled={busy || !hasDate || willWrite === 0}
            onClick={() => void importSheet()}
          >
            Importar {plural(willWrite, "día", "días")}
          </Button>
        </div>
      </section>
    </Card>
  );
}

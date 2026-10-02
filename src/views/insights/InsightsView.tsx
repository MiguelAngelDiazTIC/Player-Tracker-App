import { TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useStore } from "../../app/store";
import { EditableText } from "../../components/cells";
import { Button } from "../../components/ui/Button";
import { Labeled, Select } from "../../components/ui/fields";
import { Card, Chip, Notice } from "../../components/ui/surfaces";
import { formatDate, todayIso } from "../../domain/dates";
import type { FieldDefinition } from "../../domain/fields";
import type { DaySelection } from "../../domain/filters";
import { formatDelta, formatStat, NO_CHANGE } from "../../domain/format";
import {
  comparisons,
  MIN_DAYS_PER_GROUP,
  performanceFields,
  readiness,
  readSaturationRules,
  SATURATION_SETTING,
  saturationAlerts,
  tagInsights,
  type Comparison,
  type ComparisonGroup,
  type SaturationAlert,
  type SaturationRules,
} from "../../domain/insights";
import {
  failed,
  parsed,
  parseNumberText,
  type ParseResult,
} from "../../domain/parse";
import { aggregateKind } from "../../domain/stats";
import { cx } from "../../lib/cx";

const LEVELS = {
  high: "Día para grindear",
  medium: "Día normal: juega, pero con cabeza",
  low: "Día de pocas partidas",
} as const;

const KIND_TITLES: Record<Comparison["kind"], string> = {
  habit: "Con y sin cada hábito",
  goal: "Según el descanso",
  volume: "Según el volumen de práctica",
};

function days(count: number): string {
  return `${count} ${count === 1 ? "día" : "días"}`;
}

function parseWhole(minimum: number) {
  return (text: string): ParseResult<number> => {
    const value = parseNumberText(text);
    if (value === null || !Number.isInteger(value) || value < minimum) {
      return failed(`Debe ser un número entero, ${minimum} o más`);
    }
    return parsed(value);
  };
}

function parseTag(text: string): ParseResult<string> {
  const tag = text.trim().replace(/^#/, "").toLowerCase();
  return tag === "" ? failed("Escribe una etiqueta") : parsed(tag);
}

const LOW_DATA = (
  <Chip>
    <TriangleAlert aria-hidden="true" className="text-warning mr-1 size-3" />
    Pocos datos
  </Chip>
);

interface MeterProps {
  label: string;
  /** De 0 a 100. */
  value: number;
  tone?: "accent" | "muted";
}

function Meter({ label, value, tone = "accent" }: MeterProps) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className="bg-chart/15 h-2 overflow-hidden rounded-sm"
    >
      <div
        className={cx(
          "h-full rounded-sm",
          tone === "accent" ? "bg-chart" : "bg-surface/35",
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

interface InsightsViewProps {
  /** Enseña en la Tabla los días en los que se basa un insight. */
  onShowDays: (selection: DaySelection) => void;
}

/** Lo que la hoja no podía hacer: cruzar hábitos, sueño y carga con el rendimiento. */
export function InsightsView({ onShowDays }: InsightsViewProps) {
  const store = useStore();
  const { fields, setSetting } = store;
  const allDays = store.days;
  const today = todayIso();

  const metrics = useMemo(() => performanceFields(fields), [fields]);
  const [metricKey, setMetricKey] = useState(metrics[0]?.key);
  const metric: FieldDefinition | undefined =
    metrics.find((field) => field.key === metricKey) ?? metrics[0];

  const savedRules = store.settings[SATURATION_SETTING];
  const rules = useMemo(() => readSaturationRules(savedRules), [savedRules]);
  const saveRules = (next: SaturationRules) =>
    setSetting(SATURATION_SETTING, next);

  const ready = useMemo(
    () => readiness(fields, allDays, rules, today),
    [fields, allDays, rules, today],
  );
  const alerts = useMemo(
    () => saturationAlerts(allDays, rules, today),
    [allDays, rules, today],
  );
  const compared = useMemo(
    () => (metric ? comparisons(fields, allDays, metric) : []),
    [fields, allDays, metric],
  );
  const tags = useMemo(
    () => (metric ? tagInsights(allDays, metric) : []),
    [allDays, metric],
  );

  const loadFields = fields.filter(
    (field) =>
      !field.archived &&
      field.type === "number" &&
      aggregateKind(field) === "total",
  );
  const loadLabel =
    fields.find((field) => field.key === rules.streak.fieldKey)?.label ??
    rules.streak.fieldKey;
  const stat = (value: number | null) =>
    metric ? formatStat(metric.type, value) : "—";

  const describeAlert = (alert: SaturationAlert) =>
    alert.rule === "streak"
      ? `${alert.dates.length} días seguidos con más de ${rules.streak.moreThan} ${loadLabel.toLowerCase()}`
      : `#${rules.tag.tag} ${alert.dates.length} veces en una semana`;
  const alertSpan = (alert: SaturationAlert) =>
    `del ${formatDate(alert.dates[0])} al ${formatDate(alert.dates[alert.dates.length - 1])}`;

  function renderGroup(
    comparison: Comparison,
    group: ComparisonGroup,
    tone: "accent" | "muted",
  ) {
    const top = Math.max(
      comparison.with.mean ?? 0,
      comparison.without.mean ?? 0,
    );
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 truncate" title={group.label}>
            {group.label}
          </span>
          <span className="font-mono font-semibold">{stat(group.mean)}</span>
        </div>
        <Meter
          label={`${comparison.factor}, ${group.label}: ${stat(group.mean)}`}
          value={top === 0 ? 0 : ((group.mean ?? 0) / top) * 100}
          tone={tone}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-surface/70 font-mono text-xs">
            {days(group.dates.length)}
          </span>
          <Button
            variant="ghost"
            disabled={group.dates.length === 0}
            aria-label={`Ver los días de ${comparison.factor}: ${group.label}`}
            onClick={() =>
              onShowDays({
                label: `${comparison.factor}: ${group.label}`,
                dates: group.dates,
              })
            }
          >
            Ver días
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {metric ? (
        <div className="flex flex-wrap items-end gap-2 px-2">
          <Labeled label="Rendimiento medido en" className="w-56">
            <Select
              value={metric.key}
              onChange={(event) => setMetricKey(event.target.value)}
            >
              {metrics.map((field) => (
                <option key={field.id} value={field.key}>
                  {field.label}
                </option>
              ))}
            </Select>
          </Labeled>
          <p className="text-surface/70 pb-2 text-sm">
            Con menos de {MIN_DAYS_PER_GROUP} días en un grupo, la diferencia
            puede ser casualidad.
          </p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 relative overflow-auto">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Preparación de hoy">
            {ready.score === null || ready.level === null ? (
              <p className="text-surface/70 text-sm">
                Aún no hay datos para calcularla: rellena el sueño de hoy y los
                últimos días en la Tabla.
              </p>
            ) : (
              <div>
                <p className="flex items-baseline gap-2">
                  <span className="text-5xl font-semibold">
                    {Math.round(ready.score)}
                  </span>
                  <span className="text-surface/70 text-sm">de 100</span>
                </p>
                <p className="font-semibold">{LEVELS[ready.level]}</p>
              </div>
            )}
            <ul className="flex flex-col gap-4">
              {ready.parts.map((part) => (
                <li key={part.key} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">{part.label}</span>
                    <span className="font-mono">
                      {part.score === null ? "—" : Math.round(part.score)}
                    </span>
                  </div>
                  {part.score === null ? null : (
                    <Meter
                      label={`${part.label}: ${Math.round(part.score)} de 100`}
                      value={part.score}
                    />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-surface/70 text-xs">
                      {part.detail}
                    </span>
                    {part.dates.length > 0 ? (
                      <Button
                        variant="ghost"
                        aria-label={`Ver los días de ${part.label}`}
                        onClick={() =>
                          onShowDays({
                            label: `Preparación: ${part.label}`,
                            dates: part.dates,
                          })
                        }
                      >
                        Ver días
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-surface/70 text-xs">
              Pesa un 40 % el descanso de hoy, un 30 % los hábitos de los 3 días
              anteriores y un 30 % la carga de esos días. Lo que no tiene datos
              no cuenta.
            </p>
          </Card>

          <Card title="Avisos de saturación">
            {alerts.some((alert) => alert.active) ? (
              alerts
                .filter((alert) => alert.active)
                .map((alert) => (
                  <Notice key={alert.id} tone="warning">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1">
                        <strong>{describeAlert(alert)}</strong>,{" "}
                        {alertSpan(alert)}. Toca bajar el ritmo.
                      </p>
                      <Button
                        variant="ghost"
                        aria-label={`Ver los días del aviso: ${describeAlert(alert)}`}
                        onClick={() =>
                          onShowDays({
                            label: describeAlert(alert),
                            dates: alert.dates,
                          })
                        }
                      >
                        Ver días
                      </Button>
                    </div>
                  </Notice>
                ))
            ) : (
              <p className="text-surface/70 text-sm">
                Ahora mismo no hay ningún aviso activo.
              </p>
            )}

            <fieldset className="flex flex-col gap-2">
              <legend className="text-surface/70 mb-2 font-mono text-xs tracking-wide uppercase">
                Reglas
              </legend>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Avisar tras</span>
                <div className="w-16">
                  <EditableText<number>
                    value={rules.streak.days}
                    format={String}
                    parse={parseWhole(2)}
                    onCommit={(value) =>
                      value !== null &&
                      saveRules({
                        ...rules,
                        streak: { ...rules.streak, days: value },
                      })
                    }
                    label="Días seguidos"
                    variant="form"
                    numeric
                  />
                </div>
                <span>días seguidos con más de</span>
                <div className="w-16">
                  <EditableText<number>
                    value={rules.streak.moreThan}
                    format={String}
                    parse={parseWhole(0)}
                    onCommit={(value) =>
                      value !== null &&
                      saveRules({
                        ...rules,
                        streak: { ...rules.streak, moreThan: value },
                      })
                    }
                    label="Límite diario"
                    variant="form"
                    numeric
                  />
                </div>
                <div className="w-40">
                  <Select
                    aria-label="Campo que mide la carga"
                    value={rules.streak.fieldKey}
                    onChange={(event) =>
                      saveRules({
                        ...rules,
                        streak: {
                          ...rules.streak,
                          fieldKey: event.target.value,
                        },
                      })
                    }
                  >
                    {loadFields.map((field) => (
                      <option key={field.id} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>o cuando la etiqueta #</span>
                <div className="w-32">
                  <EditableText<string>
                    value={rules.tag.tag}
                    format={(tag) => tag}
                    parse={parseTag}
                    onCommit={(value) =>
                      value !== null &&
                      saveRules({ ...rules, tag: { ...rules.tag, tag: value } })
                    }
                    label="Etiqueta de saturación"
                    variant="form"
                  />
                </div>
                <span>aparezca</span>
                <div className="w-16">
                  <EditableText<number>
                    value={rules.tag.times}
                    format={String}
                    parse={parseWhole(1)}
                    onCommit={(value) =>
                      value !== null &&
                      saveRules({
                        ...rules,
                        tag: { ...rules.tag, times: value },
                      })
                    }
                    label="Veces que aparece la etiqueta"
                    variant="form"
                    numeric
                  />
                </div>
                <span>veces en una semana.</span>
              </div>
            </fieldset>

            {alerts.some((alert) => !alert.active) ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-surface/70 font-mono text-xs tracking-wide uppercase">
                  Avisos anteriores
                </h3>
                <ul className="flex flex-col gap-1">
                  {alerts
                    .filter((alert) => !alert.active)
                    .map((alert) => (
                      <li
                        key={alert.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0">
                          {describeAlert(alert)}, {alertSpan(alert)}
                        </span>
                        <Button
                          variant="ghost"
                          aria-label={`Ver los días del aviso anterior: ${describeAlert(alert)}, ${alertSpan(alert)}`}
                          onClick={() =>
                            onShowDays({
                              label: describeAlert(alert),
                              dates: alert.dates,
                            })
                          }
                        >
                          Ver días
                        </Button>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>

        {!metric ? (
          <Notice>
            Para comparar el rendimiento hace falta un campo coloreado respecto
            a tu media, como el K/D o el ACS. Puedes marcarlo en Ajustes, en los
            colores del campo.
          </Notice>
        ) : (
          <>
            {(["habit", "goal", "volume"] as const).map((kind) => {
              const group = compared.filter((item) => item.kind === kind);
              if (group.length === 0) return null;
              return (
                <section
                  key={kind}
                  aria-label={`${metric.label}: ${KIND_TITLES[kind]}`}
                  className="flex flex-col gap-2"
                >
                  <h2 className="px-2 text-lg font-bold">
                    {metric.label}: {KIND_TITLES[kind].toLowerCase()}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.map((comparison) => (
                      <article
                        key={comparison.id}
                        aria-label={comparison.factor}
                        className="glass-solid flex flex-col gap-4 rounded-md p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="truncate text-sm font-semibold">
                            {comparison.factor}
                          </h3>
                          {comparison.lowData ? LOW_DATA : null}
                        </div>
                        {renderGroup(comparison, comparison.with, "accent")}
                        {renderGroup(comparison, comparison.without, "muted")}
                        <p className="text-surface/70 text-xs">
                          {comparison.difference === null
                            ? "Falta un grupo para poder comparar."
                            : formatDelta(
                                  metric.type,
                                  comparison.difference,
                                ) === NO_CHANGE
                              ? `Sin diferencia en ${metric.label}.`
                              : `${formatDelta(metric.type, comparison.difference)} de ${metric.label} con «${comparison.with.label}».`}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}

            <section
              aria-label={`${metric.label} según las etiquetas`}
              className="flex flex-col gap-2"
            >
              <h2 className="px-2 text-lg font-bold">
                {metric.label}: según las etiquetas
              </h2>
              {tags.length === 0 ? (
                <p className="text-surface/70 px-2 text-sm">
                  Aún no hay etiquetas. Escribe #tilt, #saturado o la que
                  quieras en los feelings de un día.
                </p>
              ) : (
                <div className="glass-solid relative overflow-auto rounded-md">
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <caption className="sr-only">
                      Etiquetas, cuántos días aparecen y {metric.label} medio de
                      esos días
                    </caption>
                    <thead>
                      <tr>
                        {[
                          "Etiqueta",
                          "Días",
                          `${metric.label} con la etiqueta`,
                          `${metric.label} el resto de días`,
                          "Diferencia",
                          "",
                        ].map((heading, index) => (
                          <th
                            key={index}
                            scope="col"
                            className="border-surface/10 text-surface/70 border-b px-2 py-2 text-left font-mono text-xs font-medium tracking-wide uppercase"
                          >
                            {heading || (
                              <span className="sr-only">Acciones</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tags.map((item) => (
                        <tr key={item.tag}>
                          <th
                            scope="row"
                            className="border-surface/10 border-b px-2 py-2 text-left font-normal"
                          >
                            <Chip>#{item.tag}</Chip>
                          </th>
                          <td className="border-surface/10 border-b px-2 py-2 font-mono">
                            {item.dates.length}
                          </td>
                          <td className="border-surface/10 border-b px-2 py-2 font-mono">
                            {stat(item.withMean)}
                          </td>
                          <td className="border-surface/10 border-b px-2 py-2 font-mono">
                            {stat(item.withoutMean)}
                          </td>
                          <td className="border-surface/10 border-b px-2 py-2">
                            <span className="flex items-center gap-2 font-mono">
                              {item.difference === null
                                ? "—"
                                : formatDelta(metric.type, item.difference)}
                              {item.lowData ? LOW_DATA : null}
                            </span>
                          </td>
                          <td className="border-surface/10 border-b px-2 py-1 text-right">
                            <Button
                              variant="ghost"
                              aria-label={`Ver los días con #${item.tag}`}
                              onClick={() =>
                                onShowDays({
                                  label: `#${item.tag}`,
                                  dates: item.dates,
                                })
                              }
                            >
                              Ver días
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

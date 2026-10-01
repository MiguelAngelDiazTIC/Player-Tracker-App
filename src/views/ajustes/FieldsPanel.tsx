import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useStore } from "../../app/store";
import { EditableText, ValueInput } from "../../components/cells";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Labeled, Select, TextInput } from "../../components/ui/fields";
import { Card, Chip } from "../../components/ui/surfaces";
import {
  appendField,
  changedFields,
  moveField,
  moveGroup,
  setFieldArchived,
  setFieldGroup,
} from "../../domain/fieldOrder";
import {
  FIELD_TYPE_LABELS,
  groupFields,
  isNumericType,
  makeFieldKey,
  USER_FIELD_TYPES,
  type FieldDefinition,
  type FieldType,
  type Thresholds,
} from "../../domain/fields";
import { failed, parsed, type ParseResult } from "../../domain/parse";
import { formatFieldValue } from "../../domain/values";
import { newId } from "../../lib/id";

const GROUPS_LIST = "field-groups";

function parseName(text: string): ParseResult<string> {
  const trimmed = text.trim();
  return trimmed === "" ? failed("No puede quedar vacío") : parsed(trimmed);
}

const identity = (text: string) => text;

function describeThresholds(field: FieldDefinition): string {
  const { thresholds } = field;
  if (thresholds === null) return "Sin color";
  if (thresholds.mode === "average") return "Verde sobre mi media";
  const sign = thresholds.direction === "higher" ? "≥" : "≤";
  const good = formatFieldValue(field.type, thresholds.good);
  if (thresholds.warn === null) return `Verde ${sign} ${good}`;
  return `Verde ${sign} ${good}, aviso ${sign} ${formatFieldValue(field.type, thresholds.warn)}`;
}

interface ThresholdsDialogProps {
  field: FieldDefinition;
  onSave: (thresholds: Thresholds | null) => void;
  onClose: () => void;
}

type Mode = "none" | "fixed" | "average";

function ThresholdsDialog({ field, onSave, onClose }: ThresholdsDialogProps) {
  const initial = field.thresholds;
  const [mode, setMode] = useState<Mode>(initial?.mode ?? "none");
  const [direction, setDirection] = useState<"higher" | "lower">(
    initial?.mode === "fixed" ? initial.direction : "higher",
  );
  const [good, setGood] = useState<number | null>(
    initial?.mode === "fixed" ? initial.good : null,
  );
  const [warn, setWarn] = useState<number | null>(
    initial?.mode === "fixed" ? initial.warn : null,
  );

  const incomplete = mode === "fixed" && good === null;
  const comparison = direction === "higher" ? "o más" : "o menos";

  function save() {
    if (mode === "none") onSave(null);
    else if (mode === "average") onSave({ mode: "average" });
    else if (good !== null) onSave({ mode: "fixed", direction, good, warn });
    onClose();
  }

  return (
    <Dialog
      title={`Colores de ${field.label}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={incomplete} onClick={save}>
            Guardar colores
          </Button>
        </>
      }
    >
      <Labeled label="Cuándo se colorea">
        <Select
          value={mode}
          onChange={(event) => setMode(event.target.value as Mode)}
        >
          <option value="none">Nunca</option>
          <option value="fixed">Según umbrales fijos</option>
          <option value="average">Verde si iguala o supera mi media</option>
        </Select>
      </Labeled>

      {mode === "fixed" ? (
        <>
          <Labeled label="Qué es mejor">
            <Select
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as "higher" | "lower")
              }
            >
              <option value="higher">Cuanto más, mejor</option>
              <option value="lower">Cuanto menos, mejor</option>
            </Select>
          </Labeled>
          <Labeled label={`Verde con este valor ${comparison}`}>
            <ValueInput
              type={field.type}
              value={good}
              onCommit={(value) => setGood(value as number | null)}
              label="Umbral verde"
              variant="form"
            />
          </Labeled>
          <Labeled
            label={`Naranja con este valor ${comparison}`}
            hint="Opcional. Lo que no llegue se pinta en rojo."
          >
            <ValueInput
              type={field.type}
              value={warn}
              onCommit={(value) => setWarn(value as number | null)}
              label="Umbral naranja"
              variant="form"
            />
          </Labeled>
        </>
      ) : null}
    </Dialog>
  );
}

const ICON_BUTTON =
  "text-surface/80 hover:bg-surface/10 hover:text-surface active:bg-surface/15 flex size-9 shrink-0 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-50";

/** Qué se registra cada día: añadir, renombrar, reordenar y archivar campos. */
export function FieldsPanel() {
  const { fields, saveFields } = useStore();
  const [editing, setEditing] = useState<FieldDefinition | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("number");
  const [group, setGroup] = useState("");

  const groups = groupFields(fields.filter((field) => !field.archived));
  const archived = fields.filter((field) => field.archived);

  /** Guarda solo los campos que cambian respecto a lo que hay. */
  const save = (next: FieldDefinition[]) =>
    saveFields(changedFields(fields, next));

  const update = (field: FieldDefinition, patch: Partial<FieldDefinition>) =>
    saveFields([{ ...field, ...patch }]);

  function addField(event: FormEvent) {
    event.preventDefault();
    const name = label.trim();
    if (name === "") return;
    save(
      appendField(fields, {
        id: newId(),
        key: makeFieldKey(
          name,
          fields.map((field) => field.key),
        ),
        label: name,
        type,
        group: group.trim() || "Otros",
        order: 0,
        thresholds: null,
        archived: false,
      }),
    );
    setLabel("");
  }

  return (
    <Card title="Campos">
      <p className="text-surface/70 text-sm">
        Lo que registras cada día. El orden y los grupos son los de la Tabla.
        Archivar un campo lo oculta sin borrar sus datos.
      </p>

      {groups.map(
        ({ group: groupName, fields: groupFieldList }, groupIndex) => (
          <section
            key={groupName}
            aria-label={`Grupo ${groupName}`}
            className="glass-solid flex flex-col rounded-md"
          >
            <div className="border-surface/10 flex items-center gap-2 border-b px-2">
              <h3 className="text-surface/70 flex-1 font-mono text-xs tracking-wide uppercase">
                {groupName || "Sin grupo"}
              </h3>
              <button
                type="button"
                className={ICON_BUTTON}
                aria-label={`Subir el grupo ${groupName}`}
                title="Subir grupo"
                disabled={groupIndex === 0}
                onClick={() => save(moveGroup(fields, groupName, -1))}
              >
                <ChevronUp aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                className={ICON_BUTTON}
                aria-label={`Bajar el grupo ${groupName}`}
                title="Bajar grupo"
                disabled={groupIndex === groups.length - 1}
                onClick={() => save(moveGroup(fields, groupName, 1))}
              >
                <ChevronDown aria-hidden="true" className="size-4" />
              </button>
            </div>

            <ul>
              {groupFieldList.map((field, index) => (
                <li
                  key={field.id}
                  className="border-surface/10 flex flex-wrap items-center gap-2 border-b p-2 last:border-b-0"
                >
                  <div className="w-48">
                    <EditableText<string>
                      value={field.label}
                      format={identity}
                      parse={parseName}
                      onCommit={(value) =>
                        value && update(field, { label: value })
                      }
                      label={`Nombre de ${field.label}`}
                      variant="form"
                    />
                  </div>
                  <div className="w-64">
                    <Chip>{FIELD_TYPE_LABELS[field.type]}</Chip>
                  </div>
                  <div className="w-40">
                    <EditableText<string>
                      value={field.group}
                      format={identity}
                      parse={parseName}
                      onCommit={(value) =>
                        value && save(setFieldGroup(fields, field.id, value))
                      }
                      label={`Grupo de ${field.label}`}
                      variant="form"
                      list={GROUPS_LIST}
                    />
                  </div>
                  <div className="flex-1" />
                  {isNumericType(field.type) ? (
                    <Button variant="ghost" onClick={() => setEditing(field)}>
                      <SlidersHorizontal
                        aria-hidden="true"
                        className="size-4"
                      />
                      {describeThresholds(field)}
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    aria-label={`Subir ${field.label}`}
                    title="Subir"
                    disabled={index === 0}
                    onClick={() => save(moveField(fields, field.id, -1))}
                  >
                    <ChevronUp aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    aria-label={`Bajar ${field.label}`}
                    title="Bajar"
                    disabled={index === groupFieldList.length - 1}
                    onClick={() => save(moveField(fields, field.id, 1))}
                  >
                    <ChevronDown aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    aria-label={`Archivar ${field.label}`}
                    title="Archivar"
                    onClick={() =>
                      save(setFieldArchived(fields, field.id, true))
                    }
                  >
                    <Archive aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}

      {archived.length > 0 ? (
        <section aria-label="Campos archivados" className="flex flex-col gap-2">
          <h3 className="text-surface/70 font-mono text-xs tracking-wide uppercase">
            Archivados
          </h3>
          <ul className="flex flex-wrap gap-2">
            {archived.map((field) => (
              <li key={field.id}>
                <Button
                  onClick={() =>
                    save(setFieldArchived(fields, field.id, false))
                  }
                  title="Recuperar este campo"
                >
                  <ArchiveRestore aria-hidden="true" className="size-4" />
                  Recuperar {field.label}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form onSubmit={addField} className="flex flex-wrap items-end gap-2">
        <Labeled label="Nuevo campo" className="w-48">
          <TextInput
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Nombre"
          />
        </Labeled>
        <Labeled label="Tipo" className="w-64">
          <Select
            value={type}
            onChange={(event) => setType(event.target.value as FieldType)}
          >
            {USER_FIELD_TYPES.map((option) => (
              <option key={option} value={option}>
                {FIELD_TYPE_LABELS[option]}
              </option>
            ))}
          </Select>
        </Labeled>
        <Labeled label="Grupo" className="w-40">
          <TextInput
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            list={GROUPS_LIST}
            placeholder="Otros"
          />
        </Labeled>
        <Button type="submit" disabled={label.trim() === ""}>
          Añadir campo
        </Button>
      </form>

      <datalist id={GROUPS_LIST}>
        {groups.map((entry) => (
          <option key={entry.group} value={entry.group} />
        ))}
      </datalist>

      {editing ? (
        <ThresholdsDialog
          field={editing}
          onSave={(thresholds) => update(editing, { thresholds })}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

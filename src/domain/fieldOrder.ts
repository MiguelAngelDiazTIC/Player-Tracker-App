import {
  groupFields,
  sortFields,
  type FieldDefinition,
  type FieldGroup,
} from "./fields";

/** Numera de nuevo: grupos en su orden y, al final, los campos archivados. */
function renumber(
  groups: readonly FieldGroup[],
  archived: readonly FieldDefinition[],
): FieldDefinition[] {
  return [...groups.flatMap((entry) => entry.fields), ...archived].map(
    (field, order) => ({ ...field, order }),
  );
}

function split(fields: readonly FieldDefinition[]) {
  return {
    groups: groupFields(fields.filter((field) => !field.archived)),
    archived: sortFields(fields.filter((field) => field.archived)),
  };
}

function swap<T>(items: T[], from: number, to: number): boolean {
  if (from < 0 || to < 0 || to >= items.length) return false;
  [items[from], items[to]] = [items[to], items[from]];
  return true;
}

/** Sube (`-1`) o baja (`1`) un campo dentro de su grupo. */
export function moveField(
  fields: readonly FieldDefinition[],
  id: string,
  delta: -1 | 1,
): FieldDefinition[] {
  const { groups, archived } = split(fields);
  for (const entry of groups) {
    const index = entry.fields.findIndex((field) => field.id === id);
    if (index !== -1) swap(entry.fields, index, index + delta);
  }
  return renumber(groups, archived);
}

/** Sube o baja un grupo entero. */
export function moveGroup(
  fields: readonly FieldDefinition[],
  group: string,
  delta: -1 | 1,
): FieldDefinition[] {
  const { groups, archived } = split(fields);
  const index = groups.findIndex((entry) => entry.group === group);
  swap(groups, index, index + delta);
  return renumber(groups, archived);
}

/** Cambia un campo de grupo; queda el último del grupo de destino. */
export function setFieldGroup(
  fields: readonly FieldDefinition[],
  id: string,
  group: string,
): FieldDefinition[] {
  const moved = fields.map((field) =>
    field.id === id
      ? { ...field, group, order: Number.MAX_SAFE_INTEGER }
      : field,
  );
  const { groups, archived } = split(moved);
  return renumber(groups, archived);
}

/** Archiva o recupera un campo. Sus datos se conservan en los días. */
export function setFieldArchived(
  fields: readonly FieldDefinition[],
  id: string,
  isArchived: boolean,
): FieldDefinition[] {
  const changed = fields.map((field) =>
    field.id === id
      ? { ...field, archived: isArchived, order: Number.MAX_SAFE_INTEGER }
      : field,
  );
  const { groups, archived } = split(changed);
  return renumber(groups, archived);
}

/** Añade un campo nuevo al final de su grupo. */
export function appendField(
  fields: readonly FieldDefinition[],
  field: FieldDefinition,
): FieldDefinition[] {
  const { groups, archived } = split([
    ...fields,
    { ...field, order: Number.MAX_SAFE_INTEGER },
  ]);
  return renumber(groups, archived);
}

/** Campos cuyo contenido cambió, para guardar solo esos. */
export function changedFields(
  before: readonly FieldDefinition[],
  after: readonly FieldDefinition[],
): FieldDefinition[] {
  const previous = new Map(before.map((field) => [field.id, field]));
  return after.filter(
    (field) => JSON.stringify(previous.get(field.id)) !== JSON.stringify(field),
  );
}

import type { Day } from "../domain/day";
import { withManualScrimCount } from "../domain/fields";
import { countScrimsByDate } from "../domain/scrims";
import type { Repository } from "./repository";

/**
 * Para una edición sin registro de scrims: si los datos traen la columna
 * calculada (una carpeta o una copia de la edición base), la convierte en un
 * número a mano y apunta en cada día las partidas que tenía en el registro.
 * Un valor ya escrito a mano no se pisa, y las partidas se quedan en la base
 * de datos por si la copia vuelve a abrirse en la edición base.
 * Devuelve cuántos días ha cambiado.
 */
export async function foldScrimLogIntoDays(
  repository: Repository,
): Promise<number> {
  const fields = await repository.listFields();
  const calculated = fields.filter((field) => field.type === "scrim_count");
  if (calculated.length === 0) return 0;

  const counts = countScrimsByDate(await repository.listScrims());
  const changed: Day[] = [];
  for (const day of await repository.listDays()) {
    const count = counts[day.date] ?? 0;
    const missing = calculated.filter(
      (field) => day.values[field.key] === undefined,
    );
    if (count === 0 || missing.length === 0) continue;
    changed.push({
      ...day,
      values: {
        ...day.values,
        ...Object.fromEntries(missing.map((field) => [field.key, count])),
      },
    });
  }

  await repository.saveDays(changed);
  await repository.saveFields(withManualScrimCount(calculated));
  return changed.length;
}

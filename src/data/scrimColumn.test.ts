// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emptyDay } from "../domain/day";
import { emptyScrimMatch } from "../domain/scrims";
import { createMemoryDriver } from "../test/memoryDriver";
import { createRepository } from "./repository";
import { foldScrimLogIntoDays } from "./scrimColumn";

/** Una carpeta de la edición base: la columna de scrims se calcula. */
async function baseRepository() {
  const repository = createRepository(createMemoryDriver());
  await repository.init();
  return repository;
}

const scrimsType = async (repository: ReturnType<typeof createRepository>) =>
  (await repository.listFields()).find((field) => field.key === "scrims")?.type;

describe("foldScrimLogIntoDays", () => {
  it("apunta en cada día sus partidas y deja la columna como número", async () => {
    const repository = await baseRepository();
    await repository.saveDays([
      emptyDay("2026-09-14"),
      { ...emptyDay("2026-09-15"), values: { rankeds: 5 } },
    ]);
    await repository.saveScrims([
      emptyScrimMatch("a", "2026-09-14"),
      emptyScrimMatch("b", "2026-09-14"),
      // Sin fila de día: no se crea una solo para el recuento.
      emptyScrimMatch("c", "2026-09-20"),
    ]);

    expect(await foldScrimLogIntoDays(repository)).toBe(1);

    expect(await scrimsType(repository)).toBe("number");
    expect(await repository.listDays()).toEqual([
      { ...emptyDay("2026-09-14"), values: { scrims: 2 } },
      { ...emptyDay("2026-09-15"), values: { rankeds: 5 } },
    ]);
    expect(await repository.listScrims()).toHaveLength(3);
  });

  it("no pisa un valor escrito a mano", async () => {
    const repository = await baseRepository();
    await repository.saveDays([
      { ...emptyDay("2026-09-14"), values: { scrims: 5 } },
    ]);
    await repository.saveScrims([emptyScrimMatch("a", "2026-09-14")]);

    expect(await foldScrimLogIntoDays(repository)).toBe(0);

    const [day] = await repository.listDays();
    expect(day.values.scrims).toBe(5);
    expect(await scrimsType(repository)).toBe("number");
  });

  it("con la columna ya a mano no toca nada", async () => {
    const repository = await baseRepository();
    await repository.saveDays([emptyDay("2026-09-14")]);
    await repository.saveScrims([emptyScrimMatch("a", "2026-09-14")]);
    await foldScrimLogIntoDays(repository);
    await repository.saveDays([emptyDay("2026-09-14")]);

    expect(await foldScrimLogIntoDays(repository)).toBe(0);

    const [day] = await repository.listDays();
    expect(day.values.scrims).toBeUndefined();
  });
});

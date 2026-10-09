import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import App from "./App";
import type { EditionId } from "./app/edition";
import { applySheetImport } from "./data/sheetApply";
import { readSheetFile } from "./domain/sheetFile";
import {
  findHeaderRow,
  guessMapping,
  parseSheet,
  sheetHeaders,
} from "./domain/sheetImport";
import {
  createTestServices,
  fixtureFile,
  type TestServices,
} from "./test/testServices";

// TipTap necesita un navegador de verdad; ver App.test.tsx.
vi.mock("./views/tabla/FeelingsEditor", () => ({
  FeelingsEditor: ({ label = "Feelings del día" }: { label?: string }) => (
    <textarea aria-label={label} />
  ),
}));

const TODAY = new Date(2026, 9, 2, 12, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Importa la hoja de ejemplo con los campos de la edición. */
async function seedSheet(services: TestServices) {
  const { bytes, name } = fixtureFile("hoja.csv");
  const fields = await services.repository.listFields();
  const matrix = readSheetFile(bytes, name);
  const headerRow = findHeaderRow(matrix);
  const mapping = guessMapping(sheetHeaders(matrix, headerRow), fields);
  const sheet = parseSheet(matrix, headerRow, mapping, fields);
  let next = 0;
  await applySheetImport(
    services.repository,
    sheet,
    "replace",
    () => `scrim-${(next += 1)}`,
  );
}

async function renderApp({
  edition = "saiz",
  seeded = true,
  tutorialSeen = true,
}: { edition?: EditionId; seeded?: boolean; tutorialSeen?: boolean } = {}) {
  const services = await createTestServices({ edition, tutorialSeen });
  if (seeded) await seedSheet(services);
  const user = userEvent.setup();
  render(<App services={services} />);
  await screen.findByRole("navigation", { name: "Secciones" });
  return { services, user };
}

const goTo = (user: ReturnType<typeof userEvent.setup>, section: string) =>
  user.click(
    within(screen.getByRole("navigation", { name: "Secciones" })).getByRole(
      "button",
      { name: section },
    ),
  );

const tile = (label: string) => {
  const element = within(screen.getByRole("main")).getByText(
    label,
  ).parentElement;
  if (!element) throw new Error(`Falta la tarjeta ${label}`);
  return element;
};

const scrimTotal = async (services: TestServices) =>
  (await services.repository.listDays()).reduce(
    (total, day) =>
      total + (typeof day.values.scrims === "number" ? day.values.scrims : 0),
    0,
  );

describe("edición Saiz", () => {
  it("no tiene la sección de scrims y se presenta con su nombre", async () => {
    const { user } = await renderApp({ seeded: false });

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Tabla",
      "Rankeds",
      "Calendario",
      "Dashboard",
      "Insights",
      "Revisión semanal",
      "Notas",
      "Ajustes",
    ]);
    expect(screen.getByText("Saiz Edition")).toBeInTheDocument();

    await goTo(user, "Dashboard");
    expect(screen.getByRole("banner")).toHaveTextContent(
      "Tendencias y rachas, comparadas con el periodo anterior.",
    );

    await goTo(user, "Ajustes");
    expect(
      screen.getByRole("region", { name: "Acerca de MikaLog" }),
    ).toHaveTextContent(/MikaLog Saiz Edition versión \d+\.\d+\.\d+/);
  });

  it("la columna de scrims se escribe a mano", async () => {
    const { services, user } = await renderApp({ seeded: false });

    await user.click(screen.getByRole("button", { name: "Añadir hoy" }));
    await user.click(screen.getByRole("button", { name: "Volver a la Tabla" }));
    const cell = screen.getByLabelText("10mans / scrims, 02/10/2026");
    await user.type(cell, "3{Enter}");

    expect(cell).toHaveValue("3");
    await waitFor(async () => {
      const [day] = await services.repository.listDays();
      expect(day.values.scrims).toBe(3);
    });
    expect(await services.repository.listScrims()).toEqual([]);
  });

  it("la hoja deja el recuento en el día, sin crear partidas", async () => {
    const { services } = await renderApp();

    expect(screen.getByLabelText("10mans / scrims, 14/09/2026")).toHaveValue(
      "4",
    );
    expect(await scrimTotal(services)).toBe(18);
    expect(await services.repository.listScrims()).toEqual([]);
  });

  it("el Dashboard suma la columna y no enseña las tarjetas de scrims", async () => {
    const { user } = await renderApp();
    await goTo(user, "Dashboard");
    await user.click(screen.getByRole("radio", { name: "Últimos 30 días" }));

    expect(tile("10mans / scrims")).toHaveTextContent("18Total del periodo");
    expect(
      screen.queryByRole("heading", { name: "Scrims y 10mans" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("K/D en scrims")).not.toBeInTheDocument();
  });

  it("la columna tiene su gráfica de barras bajo la Tabla", async () => {
    await renderApp();

    expect(
      screen.getByRole("heading", { name: "10mans / scrims" }),
    ).toBeInTheDocument();
  });

  it("exporta a Excel sin la pestaña de scrims", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Ajustes");

    await user.click(
      screen.getByRole("button", { name: "Exportar todo a Excel" }),
    );
    await screen.findByText(/Guardado en/);

    const [file] = services.savedBinaries;
    expect(XLSX.read(file.bytes, { type: "array" }).SheetNames).toEqual([
      "Días",
      "Rankeds",
      "Revisiones",
    ]);
    expect(
      within(
        screen.getByRole("region", { name: "Exportar a Excel o CSV" }),
      ).queryByRole("option", { name: "Scrims y 10mans" }),
    ).not.toBeInTheDocument();
  });

  it("el tutorial no pasa por la sección de scrims", async () => {
    const { user } = await renderApp({ seeded: false, tutorialSeen: false });

    expect(
      screen.getByRole("dialog", {
        name: "Te doy la bienvenida a MikaLog Saiz Edition",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Empezar" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    const titles = [];
    for (let stop = 0; stop < 5; stop += 1) {
      const balloon = screen.getByRole("dialog");
      expect(balloon).toHaveTextContent(`${stop + 1} de 5`);
      titles.push(within(balloon).getByRole("heading").textContent);
      if (stop < 4) await user.keyboard("{ArrowRight}");
    }
    expect(titles).toEqual([
      "Tabla",
      "La página del día",
      "Dashboard",
      "Insights",
      "Ajustes",
    ]);
    expect(screen.getByRole("button", { name: "Terminar" })).toBeVisible();
  });
});

describe("copias entre ediciones", () => {
  /** Exporta el JSON de una app con la hoja importada. */
  async function exportFrom(edition: EditionId) {
    const { services, user } = await renderApp({ edition });
    await goTo(user, "Ajustes");
    await user.click(screen.getByRole("button", { name: "Exportar JSON" }));
    await screen.findByText(/Exportados 13 días/);
    cleanup();
    const [exported] = services.savedFiles;
    return {
      services,
      file: {
        name: exported.name,
        bytes: new TextEncoder().encode(exported.text),
      },
    };
  }

  it("una copia de la base pasa el recuento a la columna y conserva las partidas", async () => {
    const origin = await exportFrom("base");
    const { services, user } = await renderApp({ seeded: false });
    services.filesToPick.push(origin.file);

    await goTo(user, "Ajustes");
    await user.click(screen.getByRole("button", { name: "Importar JSON…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Importar datos",
    });
    expect(dialog).toHaveTextContent("Contiene 13 días y 13 campos");
    expect(dialog).toHaveTextContent(
      "El archivo trae 18 partidas de scrims o 10mans",
    );
    await user.click(within(dialog).getByRole("button", { name: "Importar" }));
    await screen.findByText("Importación hecha: 13 días.");

    const fields = await services.repository.listFields();
    expect(fields.find((field) => field.key === "scrims")?.type).toBe("number");
    expect(await scrimTotal(services)).toBe(18);
    expect(await services.repository.listScrims()).toEqual(
      await origin.services.repository.listScrims(),
    );

    await goTo(user, "Tabla");
    expect(screen.getByLabelText("10mans / scrims, 14/09/2026")).toHaveValue(
      "4",
    );

    // Las partidas guardadas no asoman en el resumen de su semana.
    await goTo(user, "Revisión semanal");
    await user.click(screen.getByRole("button", { name: "Semana anterior" }));
    await user.click(screen.getByRole("button", { name: "Semana anterior" }));
    expect(tile("10mans / scrims")).toHaveTextContent("18Total de la semana");
    expect(screen.queryByText(/Scrims y 10mans:/)).not.toBeInTheDocument();
  });

  it("una copia de Saiz se abre en la base con la columna como número", async () => {
    const origin = await exportFrom("saiz");
    const { services, user } = await renderApp({
      edition: "base",
      seeded: false,
    });
    services.filesToPick.push(origin.file);

    await goTo(user, "Ajustes");
    await user.click(screen.getByRole("button", { name: "Importar JSON…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Importar datos",
    });
    await user.click(within(dialog).getByRole("button", { name: "Importar" }));
    await screen.findByText(/Importación hecha: 13 días y 0 partidas/);

    expect(await services.repository.listDays()).toEqual(
      await origin.services.repository.listDays(),
    );
    await goTo(user, "Tabla");
    expect(screen.getByLabelText("10mans / scrims, 14/09/2026")).toHaveValue(
      "4",
    );
  });
});

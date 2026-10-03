import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import App from "./App";
import { applySheetImport } from "./data/sheetApply";
import { DEFAULT_FIELDS } from "./domain/fields";
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

// TipTap necesita un navegador de verdad para medir el texto; aquí basta con
// un área de texto que guarde igual que el editor.
vi.mock("./views/tabla/FeelingsEditor", () => ({
  FeelingsEditor: ({
    markdown,
    onChange,
    label = "Feelings del día",
  }: {
    markdown: string;
    onChange: (markdown: string, text: string) => void;
    label?: string;
  }) => (
    <textarea
      aria-label={label}
      defaultValue={markdown}
      onBlur={(event) => onChange(event.target.value, event.target.value)}
    />
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

/** Deja en la base de datos los 13 días de la hoja de ejemplo. */
async function seedSheet(services: TestServices) {
  const { bytes, name } = fixtureFile("hoja.csv");
  const matrix = readSheetFile(bytes, name);
  const headerRow = findHeaderRow(matrix);
  const mapping = guessMapping(sheetHeaders(matrix, headerRow), DEFAULT_FIELDS);
  const sheet = parseSheet(matrix, headerRow, mapping, DEFAULT_FIELDS);
  let next = 0;
  await applySheetImport(
    services.repository,
    sheet,
    "replace",
    () => `scrim-${(next += 1)}`,
  );
}

async function renderApp(seeded = true) {
  const services = await createTestServices();
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

const rowDates = () =>
  screen.getAllByRole("rowheader").map((cell) => cell.textContent);

describe("estructura", () => {
  it("muestra las nueve secciones y abre en la Tabla", async () => {
    await renderApp(false);

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Tabla",
      "Rankeds",
      "Scrims y 10mans",
      "Calendario",
      "Dashboard",
      "Insights",
      "Revisión semanal",
      "Notas",
      "Ajustes",
    ]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Tabla",
    );
    expect(within(nav).getByRole("button", { name: "Tabla" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("se recorre y se activa con el teclado", async () => {
    const { user } = await renderApp(false);

    await user.tab();
    expect(screen.getByRole("button", { name: "Tabla" })).toHaveFocus();
    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Rankeds",
    );
  });

  it("sin datos, invita a importar la hoja y lleva a Ajustes", async () => {
    const { user } = await renderApp(false);

    await user.click(screen.getByRole("button", { name: "Importar mi hoja" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ajustes",
    );
  });
});

describe("Tabla", () => {
  it("muestra una fila por día, del más reciente al más antiguo", async () => {
    await renderApp();

    expect(rowDates()).toHaveLength(13);
    expect(rowDates()[0]).toBe("26/09/2026");
    expect(rowDates()[12]).toBe("14/09/2026");
    expect(screen.getByLabelText("Rankeds, 14/09/2026")).toHaveValue("6");
    expect(screen.getByLabelText("Horas de sueño, 20/09/2026")).toHaveValue(
      "8h09",
    );
    expect(screen.getByLabelText("K/D, 15/09/2026")).toHaveValue("1.08");
    expect(screen.getByText("13 días")).toBeInTheDocument();
  });

  it("agrupa las columnas como la hoja", async () => {
    await renderApp();

    const [groups, columns] = screen
      .getAllByRole("row")
      .slice(0, 2)
      .map((row) =>
        within(row)
          .getAllByRole("columnheader")
          .map((cell) => cell.textContent),
      );
    expect(groups).toEqual([
      "",
      "Juego",
      "Hábitos core",
      "Sueño",
      "Rendimiento",
      "",
    ]);
    expect(columns).toEqual([
      "Fecha",
      "Rankeds",
      "10mans / scrims",
      "DMs",
      "Kovaaks",
      "Gimnasio",
      "Suplementación",
      "Nutrición",
      "Sleep score",
      "Horas de sueño",
      "K/D",
      "ACS",
      "Feelings del día",
    ]);
  });

  it("guarda una celda con Enter y baja a la fila siguiente", async () => {
    const { services, user } = await renderApp();

    const cell = screen.getByLabelText("Rankeds, 26/09/2026");
    await user.clear(cell);
    await user.type(cell, "11{Enter}");

    expect(screen.getByLabelText("Rankeds, 25/09/2026")).toHaveFocus();
    expect(cell).toHaveValue("11");
    await waitFor(async () => {
      const days = await services.repository.listDays();
      expect(
        days.find((day) => day.date === "2026-09-26")?.values.rankeds,
      ).toBe(11);
    });
  });

  it("no guarda lo que no entiende y lo explica", async () => {
    const { services, user } = await renderApp();

    const cell = screen.getByLabelText("K/D, 25/09/2026");
    await user.clear(cell);
    await user.type(cell, "abc{Enter}");

    expect(cell).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent("No es un número");

    await user.keyboard("{Escape}");
    expect(cell).toHaveValue("1.20");
    expect(cell).toBeValid();
    const days = await services.repository.listDays();
    expect(days.find((day) => day.date === "2026-09-25")?.values.kd).toBe(1.2);
  });

  it("vaciar una celda la deja sin dato", async () => {
    const { services, user } = await renderApp();

    await user.clear(screen.getByLabelText("ACS, 14/09/2026"));
    await user.tab();

    await waitFor(async () => {
      const [first] = await services.repository.listDays();
      expect(first.values).not.toHaveProperty("acs");
    });
  });

  it("rota un hábito entre sus estados", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByLabelText("Nutrición, 25/09/2026: no"));
    expect(
      screen.getByLabelText("Nutrición, 25/09/2026: sin dato"),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText("Gimnasio, 14/09/2026: hecho"));
    expect(
      screen.getByLabelText("Gimnasio, 14/09/2026: descanso"),
    ).toBeInTheDocument();
  });

  it("colorea por umbral y por encima de la media", async () => {
    await renderApp();

    const tint = (label: string) =>
      screen.getByLabelText(label).closest("td")?.className ?? "";

    expect(tint("Sleep score, 15/09/2026")).toContain("bg-success/20");
    expect(tint("Sleep score, 18/09/2026")).toContain("bg-warning/25");
    expect(tint("Sleep score, 14/09/2026")).toContain("bg-danger/25");
    expect(tint("K/D, 21/09/2026")).toContain("bg-success/20");
    expect(tint("K/D, 16/09/2026")).not.toContain("bg-");
    expect(tint("Nutrición, 25/09/2026: no")).toContain("bg-danger/25");
  });

  it("ordena al pulsar una cabecera y lo anuncia", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: /^Fecha/ }));
    expect(rowDates()[0]).toBe("14/09/2026");
    expect(
      screen.getByRole("columnheader", { name: /^Fecha/ }),
    ).toHaveAttribute("aria-sort", "ascending");

    // Las columnas numéricas empiezan por el valor más alto.
    await user.click(screen.getByRole("button", { name: /^K\/D/ }));
    expect(rowDates()[0]).toBe("21/09/2026");
    await user.click(screen.getByRole("button", { name: /^K\/D/ }));
    expect(rowDates()[0]).toBe("16/09/2026");
  });

  it("filtra por etiqueta, por texto y por fechas", async () => {
    const { user } = await renderApp();

    await user.selectOptions(screen.getByLabelText("Etiqueta"), "saturado");
    expect(rowDates()).toEqual(["24/09/2026", "23/09/2026"]);
    expect(screen.getByText("2 de 13 días")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Etiqueta"), "");
    await user.type(screen.getByLabelText("Buscar en feelings"), "energia");
    expect(rowDates()).toEqual(["15/09/2026"]);

    await user.clear(screen.getByLabelText("Buscar en feelings"));
    await user.selectOptions(screen.getByLabelText("Fechas"), "7d");
    expect(rowDates()).toEqual(["26/09/2026"]);
  });
});

describe("página del día", () => {
  it("crea el día de hoy con un clic y lo abre", async () => {
    const { services, user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "Añadir hoy" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "viernes, 2 de octubre de 2026",
    );
    await waitFor(async () => {
      expect(await services.repository.listDays()).toHaveLength(14);
    });
  });

  it("guarda campos, hábitos y feelings con sus etiquetas", async () => {
    const { services, user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Añadir hoy" }));

    await user.type(screen.getByLabelText("Rankeds"), "7");
    await user.type(screen.getByLabelText("Horas de sueño"), "7h30");
    await user.click(
      within(screen.getByRole("group", { name: "Gimnasio" })).getByRole(
        "radio",
        { name: "Hecho" },
      ),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Feelings del día" }),
      "Fino, pero con algo de #tilt",
    );
    await user.click(screen.getByRole("button", { name: "Volver a la Tabla" }));

    expect(screen.getByLabelText("Rankeds, 02/10/2026")).toHaveValue("7");
    expect(
      screen.getByLabelText("Gimnasio, 02/10/2026: hecho"),
    ).toBeInTheDocument();
    await waitFor(async () => {
      const days = await services.repository.listDays();
      expect(days.at(-1)).toEqual({
        date: "2026-10-02",
        values: { rankeds: 7, sleep_hours: 450, gym: "done" },
        feelingsMd: "Fino, pero con algo de #tilt",
        tags: ["tilt"],
      });
    });
  });

  it("abre un día desde su fila y navega al anterior y al siguiente", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "20/09/2026" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "domingo, 20 de septiembre de 2026",
    );
    expect(screen.getByLabelText("Rankeds")).toHaveValue("12");

    await user.click(screen.getByRole("button", { name: "Día siguiente" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "lunes, 21 de septiembre de 2026",
    );
    await user.click(screen.getByRole("button", { name: "Día anterior" }));
    await user.click(screen.getByRole("button", { name: "Día anterior" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "sábado, 19 de septiembre de 2026",
    );
  });

  it("elimina un día solo tras confirmarlo", async () => {
    const { services, user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "20/09/2026" }));

    await user.click(screen.getByRole("button", { name: "Eliminar día" }));
    const dialog = screen.getByRole("dialog", {
      name: "¿Eliminar el 20/09/2026?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar día" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Eliminar día",
      }),
    );

    expect(rowDates()).toHaveLength(12);
    expect(rowDates()).not.toContain("20/09/2026");
    await waitFor(async () => {
      expect(await services.repository.listDays()).toHaveLength(12);
    });
  });
});

describe("Scrims y 10mans", () => {
  it("lista las partidas creadas desde la hoja", async () => {
    const { user } = await renderApp();
    await goTo(user, "Scrims y 10mans");

    expect(screen.getByText("18 partidas")).toBeInTheDocument();
  });

  it("añade una partida y el día muestra el recuento", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Scrims y 10mans");

    await user.click(screen.getByRole("button", { name: "Añadir partida" }));
    await user.type(
      screen.getByLabelText("Kills, partida del 02/10/2026"),
      "21",
    );
    await user.type(
      screen.getByLabelText("Muertes, partida del 02/10/2026"),
      "14",
    );
    await user.tab();

    expect(screen.getByText("19 partidas")).toBeInTheDocument();
    expect(screen.getAllByTitle("Kills entre muertes")[0]).toHaveTextContent(
      "1.50",
    );

    await goTo(user, "Tabla");
    await user.click(screen.getByRole("button", { name: "Añadir hoy" }));
    await user.click(screen.getByRole("button", { name: "Volver a la Tabla" }));
    const today = screen.getByRole("button", { name: "02/10/2026" });
    const row = today.closest("tr");
    if (!row) throw new Error("Falta la fila de hoy");
    expect(within(row).getAllByRole("cell")[1]).toHaveTextContent("1");

    await waitFor(async () => {
      const scrims = await services.repository.listScrims();
      expect(scrims.at(-1)).toMatchObject({
        date: "2026-10-02",
        kills: 21,
        deaths: 14,
      });
    });
  });

  it("elimina una partida tras confirmarlo", async () => {
    const { user } = await renderApp();
    await goTo(user, "Scrims y 10mans");

    await user.click(
      screen.getAllByRole("button", {
        name: "Eliminar la partida del 19/09/2026",
      })[0],
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Eliminar partida",
      }),
    );

    expect(screen.getByText("17 partidas")).toBeInTheDocument();
  });
});

describe("Ajustes", () => {
  it("importa la hoja con vista previa", async () => {
    const { services, user } = await renderApp(false);
    services.filesToPick.push(fixtureFile("hoja.csv"));
    await goTo(user, "Ajustes");

    await user.click(screen.getByRole("button", { name: "Elegir archivo…" }));

    expect(
      await screen.findByText(
        "13 días entendidos, del 14/09/2026 al 26/09/2026.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Destino de Horas de sueño")).toHaveValue(
      "field:sleep_hours",
    );
    expect(services.backups).toBe(0);

    await user.click(screen.getByRole("button", { name: "Importar 13 días" }));

    expect(
      await screen.findByText(/Importación hecha: 13 días/),
    ).toHaveTextContent("18 partidas vacías creadas");
    expect(services.backups).toBe(1);

    await goTo(user, "Tabla");
    expect(rowDates()).toHaveLength(13);
    expect(screen.getByLabelText("Rankeds, 14/09/2026")).toHaveValue("6");
  });

  it("pregunta qué hacer con los días que ya existen", async () => {
    const { services, user } = await renderApp();
    await user.clear(screen.getByLabelText("Rankeds, 14/09/2026"));
    await user.type(screen.getByLabelText("Rankeds, 14/09/2026"), "50{Enter}");

    services.filesToPick.push(fixtureFile("hoja.csv"));
    await goTo(user, "Ajustes");
    await user.click(screen.getByRole("button", { name: "Elegir archivo…" }));

    expect(
      await screen.findByText(/13 días ya existen en la app/),
    ).toBeInTheDocument();
    // Conservar es la opción por defecto: no hay nada nuevo que importar.
    expect(
      screen.getByRole("button", { name: "Importar 0 días" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("radio", { name: "Sustituirlos por los de la hoja" }),
    );
    await user.click(screen.getByRole("button", { name: "Importar 13 días" }));
    await screen.findByText(/Importación hecha: 13 días/);

    await goTo(user, "Tabla");
    expect(screen.getByLabelText("Rankeds, 14/09/2026")).toHaveValue("6");
  });

  it("exporta a JSON e importa en otra instalación sin perder nada", async () => {
    const origin = await renderApp();
    await goTo(origin.user, "Ajustes");
    await origin.user.click(
      screen.getByRole("button", { name: "Exportar JSON" }),
    );
    await screen.findByText(/Exportados 13 días y 18 partidas/);
    const [exported] = origin.services.savedFiles;
    expect(exported.name).toBe("mikalog-2026-10-02.json");
    document.body.innerHTML = "";

    const target = await renderApp(false);
    target.services.filesToPick.push({
      name: exported.name,
      bytes: new TextEncoder().encode(exported.text),
    });
    await goTo(target.user, "Ajustes");
    await target.user.click(
      screen.getByRole("button", { name: "Importar JSON…" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Importar datos",
    });
    expect(dialog).toHaveTextContent(
      "Contiene 13 días, 18 partidas y 11 campos",
    );
    await target.user.click(
      within(dialog).getByRole("button", { name: "Importar" }),
    );
    await screen.findByText(/Importación hecha: 13 días y 18 partidas/);

    expect(await target.services.repository.listDays()).toEqual(
      await origin.services.repository.listDays(),
    );
    expect(await target.services.repository.listScrims()).toEqual(
      await origin.services.repository.listScrims(),
    );
    expect(target.services.backups).toBe(1);
  });

  it("rechaza un JSON que no es una exportación y no cambia nada", async () => {
    const { services, user } = await renderApp();
    services.filesToPick.push({
      name: "otro.json",
      bytes: new TextEncoder().encode('{"format":"otra-app"}'),
    });
    await goTo(user, "Ajustes");

    await user.click(screen.getByRole("button", { name: "Importar JSON…" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "otro.json no es una exportación válida de MikaLog",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(services.backups).toBe(0);
  });

  it("añade, renombra y archiva campos, y la Tabla lo refleja", async () => {
    const { user } = await renderApp();
    await goTo(user, "Ajustes");

    await user.type(screen.getByLabelText("Nuevo campo"), "Cafés");
    await user.type(screen.getByLabelText("Grupo"), "Hábitos core");
    await user.click(screen.getByRole("button", { name: "Añadir campo" }));

    const rename = screen.getByLabelText("Nombre de Kovaaks");
    await user.clear(rename);
    await user.type(rename, "Kovaak's{Enter}");
    await user.click(screen.getByRole("button", { name: "Archivar DMs" }));
    await user.click(screen.getByRole("button", { name: "Subir Cafés" }));

    await goTo(user, "Tabla");
    const headers = within(screen.getAllByRole("row")[1])
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual([
      "Fecha",
      "Rankeds",
      "10mans / scrims",
      "Kovaak's",
      "Gimnasio",
      "Suplementación",
      "Cafés",
      "Nutrición",
      "Sleep score",
      "Horas de sueño",
      "K/D",
      "ACS",
      "Feelings del día",
    ]);

    await goTo(user, "Ajustes");
    await user.click(screen.getByRole("button", { name: "Recuperar DMs" }));
    await goTo(user, "Tabla");
    expect(screen.getByLabelText("DMs, 14/09/2026")).toHaveValue("3");
  });

  it("cambia los colores de un campo", async () => {
    const { user } = await renderApp();
    await goTo(user, "Ajustes");

    const group = screen.getByRole("region", { name: "Grupo Juego" });
    await user.click(
      within(group).getAllByRole("button", { name: "Sin color" })[0],
    );
    const dialog = screen.getByRole("dialog", { name: "Colores de Rankeds" });
    await user.selectOptions(
      within(dialog).getByLabelText("Cuándo se colorea"),
      "fixed",
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Qué es mejor"),
      "lower",
    );
    await user.type(within(dialog).getByLabelText("Umbral verde"), "8");
    await user.tab();
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar colores" }),
    );

    await goTo(user, "Tabla");
    const tint = (label: string) =>
      screen.getByLabelText(label).closest("td")?.className ?? "";
    expect(tint("Rankeds, 14/09/2026")).toContain("bg-success/20");
    expect(tint("Rankeds, 20/09/2026")).toContain("bg-danger/25");
  });
});

describe("gráficas", () => {
  const chartTitles = (section: string) =>
    within(screen.getByRole("region", { name: section }))
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);

  it("hay una gráfica por cada columna con números o hábitos", async () => {
    await renderApp();

    expect(chartTitles("Gráficas del registro diario")).toEqual([
      "Rankeds",
      "10mans / scrims",
      "DMs",
      "Kovaaks",
      "Gimnasio",
      "Suplementación",
      "Nutrición",
      "Sleep score",
      "Horas de sueño",
      "K/D",
      "ACS",
    ]);
  });

  it("resumen cada gráfica y siguen los filtros de la tabla", async () => {
    const { user } = await renderApp();
    const summaryOf = (title: string) =>
      screen.getByRole("heading", { level: 3, name: title }).parentElement
        ?.textContent;

    expect(summaryOf("Rankeds")).toBe("RankedsTotal 89");
    expect(summaryOf("K/D")).toBe("K/DMedia 1.20");
    expect(summaryOf("Horas de sueño")).toBe(
      "Horas de sueñoMedia 7h10 · objetivo 7h",
    );
    expect(summaryOf("Nutrición")).toBe("Nutrición12 de 13 días");

    await user.selectOptions(screen.getByLabelText("Etiqueta"), "saturado");
    expect(summaryOf("Rankeds")).toBe("RankedsTotal 14");
    expect(summaryOf("K/D")).toBe("K/DMedia 1.15");
  });

  it("el registro de scrims tiene las suyas", async () => {
    const { user } = await renderApp();
    await goTo(user, "Scrims y 10mans");

    expect(chartTitles("Gráficas de scrims y 10mans")).toEqual([
      "K/D por partida",
      "ACS por partida",
      "Resultados por mapa",
    ]);
  });
});

describe("Calendario", () => {
  it("pinta el mes con la métrica elegida y abre un día", async () => {
    const { user } = await renderApp();
    await goTo(user, "Calendario");

    expect(
      screen.getByRole("heading", { level: 2, name: "octubre de 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sin datos este mes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(
      screen.getByText("Media 1.20 · 13 días con dato"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "lunes, 21 de septiembre de 2026: K/D 1.72",
      }),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Métrica"), "rankeds");
    expect(screen.getByText("Total 89 · 13 días con dato")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Métrica"), "nutrition");
    expect(
      screen.getByText("92 % cumplido · 12 de 13 días"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "viernes, 25 de septiembre de 2026: Nutrición No",
      }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "viernes, 25 de septiembre de 2026",
    );
  });
});

describe("Dashboard", () => {
  const tile = (label: string) => {
    const element = within(screen.getByRole("main")).getByText(
      label,
    ).parentElement;
    if (!element) throw new Error(`Falta la tarjeta ${label}`);
    return element;
  };

  it("resume el periodo y lo compara con el anterior", async () => {
    const { user } = await renderApp();
    await goTo(user, "Dashboard");

    // Últimos 7 días (26/09-02/10): solo el 26/09 tiene datos.
    expect(tile("Rankeds")).toHaveTextContent("8Total del periodo");
    expect(tile("Rankeds")).toHaveTextContent("−38que los 7 días anteriores");
    expect(tile("K/D")).toHaveTextContent("1.20Media de 1 día");

    await user.click(screen.getByRole("radio", { name: "Últimos 30 días" }));
    expect(tile("Rankeds")).toHaveTextContent("89Total del periodo");
    expect(tile("Horas de sueño")).toHaveTextContent("7h10Media de 13 días");
  });

  it("muestra rachas y cumplimiento de hábitos", async () => {
    const { user } = await renderApp();
    await goTo(user, "Dashboard");
    await user.click(screen.getByRole("radio", { name: "Últimos 30 días" }));

    expect(screen.getByText("Mejor racha: 11 días")).toBeInTheDocument();
    expect(
      screen.getByRole("meter", { name: "Cumplimiento de Nutrición" }),
    ).toHaveAttribute("aria-valuenow", "92");
  });

  it("separa las cifras de scrims", async () => {
    const { user } = await renderApp();
    await goTo(user, "Dashboard");
    await user.click(screen.getByRole("radio", { name: "Últimos 30 días" }));

    expect(tile("Partidas")).toHaveTextContent("18Total del periodo");
    expect(tile("K/D en scrims")).toHaveTextContent("Sin datos en el periodo");
  });
});

describe("Revisión semanal", () => {
  it("resume la semana 14-20/09 como el cálculo a mano", async () => {
    const { user } = await renderApp();
    await goTo(user, "Revisión semanal");

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Semana del 28/09/2026 al 04/10/2026",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Semana anterior" }));
    await user.click(screen.getByRole("button", { name: "Semana anterior" }));

    const tile = (label: string) =>
      within(screen.getByRole("main")).getByText(label).parentElement;
    expect(
      screen.getByRole("heading", { level: 3, name: /Resumen/ }),
    ).toHaveTextContent("Resumen: 7 días registrados");
    expect(tile("Rankeds")).toHaveTextContent("47Total de la semana");
    expect(tile("Horas de sueño")).toHaveTextContent("7h19Media de 7 días");
    expect(tile("K/D")).toHaveTextContent("1.15Media de 7 días");
    expect(tile("Gimnasio")).toHaveTextContent("7 de 7");
    expect(screen.getByText("#autopilot × 1")).toBeInTheDocument();
  });

  it("guarda las tres conclusiones de cada semana por separado", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Revisión semanal");

    await user.type(
      screen.getByLabelText("1. Qué ha funcionado esta semana"),
      "Dormir más de 7h",
    );
    await user.type(
      screen.getByLabelText("3. Qué cambio la semana que viene"),
      "Menos rankeds seguidas",
    );
    await user.tab();

    await user.click(screen.getByRole("button", { name: "Semana anterior" }));
    expect(
      screen.getByLabelText("1. Qué ha funcionado esta semana"),
    ).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Semana siguiente" }));
    expect(
      screen.getByLabelText("1. Qué ha funcionado esta semana"),
    ).toHaveValue("Dormir más de 7h");

    await waitFor(async () => {
      expect(await services.repository.listReviews()).toEqual([
        {
          weekStart: "2026-09-28",
          conclusions: ["Dormir más de 7h", "", "Menos rankeds seguidas"],
        },
      ]);
    });
  });

  it("abre un día de la semana desde el resumen", async () => {
    const { user } = await renderApp();
    await goTo(user, "Revisión semanal");
    await user.click(screen.getByRole("button", { name: "Semana anterior" }));

    await user.click(screen.getByRole("button", { name: "24/09" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "jueves, 24 de septiembre de 2026",
    );
  });
});

describe("Insights", () => {
  // El 26/09 es el último día de la hoja: hay sueño de "hoy" y avisos activos.
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 8, 26, 12, 0));
  });

  it("puntúa la preparación del día y explica de dónde sale", async () => {
    const { user } = await renderApp();
    await goTo(user, "Insights");

    const card = screen.getByRole("region", { name: "Preparación de hoy" });
    expect(card).toHaveTextContent("91de 100");
    expect(
      within(card).getByRole("meter", { name: "Preparación de hoy" }),
    ).toHaveAttribute("aria-valuenow", "91");
    expect(card).toHaveTextContent("Día para grindear");
    expect(card).toHaveTextContent("7 de 9 cumplidos en los 3 días anteriores");
    expect(
      within(card).getByRole("meter", { name: "Hábitos: 78 de 100" }),
    ).toBeInTheDocument();
  });

  it("avisa de la saturación y lleva a los días que la disparan", async () => {
    const { user } = await renderApp();
    await goTo(user, "Insights");

    expect(screen.getByRole("status")).toHaveTextContent(
      "#saturado 2 veces en una semana, del 23/09/2026 al 24/09/2026",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Ver los días del aviso: #saturado 2 veces en una semana",
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Tabla",
    );
    expect(rowDates()).toEqual(["24/09/2026", "23/09/2026"]);
    expect(
      screen.getByText(/Solo se muestran los 2 días de/),
    ).toHaveTextContent("#saturado 2 veces en una semana");

    await user.click(
      screen.getByRole("button", { name: "Ver todos los días" }),
    );
    expect(rowDates()).toHaveLength(13);
  });

  it("compara el rendimiento con y sin cada hábito, avisando de pocos datos", async () => {
    const { user } = await renderApp();
    await goTo(user, "Insights");

    const nutrition = screen.getByRole("article", { name: "Nutrición" });
    expect(nutrition).toHaveTextContent("Pocos datos");
    expect(nutrition).toHaveTextContent("Sí1.2012 días");
    expect(nutrition).toHaveTextContent("No1.201 día");
    expect(nutrition).toHaveTextContent("Sin diferencia en K/D.");

    const gym = screen.getByRole("article", { name: "Gimnasio" });
    expect(gym).toHaveTextContent("Hecho1.298 días");
    expect(gym).toHaveTextContent("Descanso o no hecho1.065 días");
    expect(gym).toHaveTextContent("+0.23 de K/D con «Hecho».");

    await user.click(
      within(nutrition).getByRole("button", {
        name: "Ver los días de Nutrición: No",
      }),
    );
    expect(rowDates()).toEqual(["25/09/2026"]);
  });

  it("parte el sueño por su objetivo y cambia de métrica", async () => {
    const { user } = await renderApp();
    await goTo(user, "Insights");

    const sleep = screen.getByRole("article", { name: "Sleep score" });
    expect(sleep).toHaveTextContent("80 o más1.199 días");
    expect(sleep).toHaveTextContent("Menos de 801.233 días");

    await user.click(screen.getByRole("radio", { name: "ACS" }));
    expect(
      screen.getByRole("article", { name: "Sleep score" }),
    ).toHaveTextContent("Menos de 80236.73 días");
  });

  it("relaciona las etiquetas con el rendimiento", async () => {
    const { user } = await renderApp();
    await goTo(user, "Insights");

    const table = screen.getByRole("table", { name: /Etiquetas/ });
    const [, saturated, autopilot] = within(table).getAllByRole("row");
    expect(saturated).toHaveTextContent("#saturado21.151.21");
    expect(autopilot).toHaveTextContent("#autopilot10.92");

    await user.click(
      within(table).getByRole("button", {
        name: "Ver los días con #autopilot",
      }),
    );
    expect(rowDates()).toEqual(["16/09/2026"]);
  });

  it("deja cambiar las reglas de saturación y las guarda", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Insights");

    const streakDays = screen.getByLabelText("Días seguidos");
    await user.clear(streakDays);
    await user.type(streakDays, "2{Enter}");

    expect(
      screen.getByText(
        "2 días seguidos con más de 8 rankeds, del 17/09/2026 al 18/09/2026",
      ),
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect(await services.repository.getSettings()).toEqual({
        "saturation.rules": {
          streak: { fieldKey: "rankeds", days: 2, moreThan: 8 },
          tag: { tag: "saturado", times: 2 },
        },
      });
    });
  });
});

describe("Rankeds", () => {
  it("apunta una partida y calcula su K/D y su ACS", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Rankeds");
    await user.click(screen.getByRole("button", { name: "Añadir partida" }));

    const cell = (label: string) =>
      screen.getByLabelText(`${label}, partida del 02/10/2026`);
    await user.type(cell("Mapa"), "Ascent");
    await user.type(cell("Kills"), "20");
    await user.type(cell("Muertes"), "10");

    // El ACS necesita las rondas para guardar la puntuación total.
    await user.type(cell("ACS"), "260{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pon antes las rondas de la partida",
    );
    await user.keyboard("{Escape}");
    await user.type(cell("Rondas"), "20");
    await user.type(cell("ACS"), "260");
    await user.tab();

    expect(screen.getByTitle("Kills entre muertes")).toHaveTextContent("2.00");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 partida · K/D 2.00 · ACS 260",
    );
    await waitFor(async () => {
      expect(await services.repository.listRankedSessions()).toMatchObject([
        {
          date: "2026-10-02",
          map: "Ascent",
          kills: 20,
          deaths: 10,
          rounds: 20,
          score: 5200,
          source: "manual",
        },
      ]);
    });
  });

  it("conserva el ACS al corregir las rondas", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Rankeds");
    await user.click(screen.getByRole("button", { name: "Añadir partida" }));

    const cell = (label: string) =>
      screen.getByLabelText(`${label}, partida del 02/10/2026`);
    await user.type(cell("Rondas"), "20");
    await user.type(cell("ACS"), "250");
    await user.clear(cell("Rondas"));
    await user.type(cell("Rondas"), "24");
    await user.tab();

    expect(cell("ACS")).toHaveValue("250");
    await waitFor(async () => {
      const [session] = await services.repository.listRankedSessions();
      expect(session).toMatchObject({ rounds: 24, score: 6000 });
    });
  });

  it("desde un día, muestra solo sus partidas y pasa las cifras al día", async () => {
    const { services, user } = await renderApp();
    await services.repository.saveRankedSessions([
      {
        id: "a",
        date: "2026-09-20",
        map: "Ascent",
        agent: "Jett",
        result: "win",
        kills: 20,
        deaths: 10,
        score: 5200,
        rounds: 20,
        source: "manual",
        externalMatchId: null,
      },
      {
        id: "b",
        date: "2026-09-20",
        map: "Bind",
        agent: "Raze",
        result: "loss",
        kills: 10,
        deaths: 20,
        score: 3600,
        rounds: 24,
        source: "manual",
        externalMatchId: null,
      },
      {
        id: "c",
        date: "2026-09-21",
        map: "Ascent",
        agent: "Jett",
        result: "win",
        kills: 5,
        deaths: 5,
        score: 1000,
        rounds: 10,
        source: "manual",
        externalMatchId: null,
      },
    ]);
    document.body.innerHTML = "";
    render(<App services={services} />);
    await screen.findByRole("navigation", { name: "Secciones" });

    await user.click(screen.getByRole("button", { name: "20/09/2026" }));
    const card = screen.getByRole("region", { name: "Partidas de ranked" });
    expect(card).toHaveTextContent("Partidas2K/D1.00ACS200");

    await user.click(
      within(card).getByRole("button", { name: "Usar estas cifras en el día" }),
    );
    expect(screen.getByLabelText("Rankeds")).toHaveValue("2");
    expect(screen.getByLabelText("K/D")).toHaveValue("1.00");
    expect(screen.getByLabelText("ACS")).toHaveValue("200");

    await user.click(
      within(card).getByRole("button", { name: "Ver partidas" }),
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Rankeds",
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 de 3 partidas");
  });
});

describe("Notas", () => {
  it("crea notas, las enlaza con [[ ]] y muestra quién las menciona", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Notas");

    await user.click(screen.getByRole("button", { name: "Nueva nota" }));
    await user.type(
      screen.getByLabelText("Título de la nota"),
      "Team Ñu{Enter}",
    );
    await user.click(screen.getByLabelText("Texto de la nota"));
    await user.paste("Repasar [[Lineups Ascent]] antes del [[20/09/2026]]");
    await user.tab();

    const links = screen.getByRole("region", { name: "Enlaza a" });
    expect(
      within(links).getByRole("button", { name: "Día 20/09/2026" }),
    ).toBeInTheDocument();
    await user.click(
      within(links).getByRole("button", {
        name: "Crear la nota «Lineups Ascent»",
      }),
    );

    // La nota nueva ya tiene título y sabe quién la menciona.
    expect(screen.getByLabelText("Título de la nota")).toHaveValue(
      "Lineups Ascent",
    );
    const mentions = screen.getByRole("region", { name: "La mencionan" });
    await user.click(within(mentions).getByRole("button", { name: "Team Ñu" }));
    expect(screen.getByLabelText("Título de la nota")).toHaveValue("Team Ñu");

    await waitFor(async () => {
      const notes = await services.repository.listNotes();
      expect(notes.map((note) => [note.title, note.links])).toEqual([
        ["Team Ñu", ["Lineups Ascent", "20/09/2026"]],
        ["Lineups Ascent", []],
      ]);
    });
  });

  it("desde un día se ven las notas que lo mencionan, y al revés", async () => {
    const { user } = await renderApp();
    await goTo(user, "Notas");
    await user.click(screen.getByRole("button", { name: "Nueva nota" }));
    await user.type(
      screen.getByLabelText("Título de la nota"),
      "VOD scrim{Enter}",
    );
    await user.click(screen.getByLabelText("Texto de la nota"));
    await user.paste("Del [[20/09/2026]]");
    await user.tab();

    await user.click(screen.getByRole("button", { name: "Día 20/09/2026" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "domingo, 20 de septiembre de 2026",
    );
    const linked = screen.getByRole("region", { name: "Notas enlazadas" });
    await user.click(within(linked).getByRole("button", { name: "VOD scrim" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Notas",
    );
    expect(screen.getByLabelText("Título de la nota")).toHaveValue("VOD scrim");
  });

  it("busca y elimina notas tras confirmarlo", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Notas");
    for (const title of ["Lineups Ascent", "Rival: Team Ñu"]) {
      await user.click(screen.getByRole("button", { name: "Nueva nota" }));
      await user.type(
        screen.getByLabelText("Título de la nota"),
        `${title}{Enter}`,
      );
    }

    await user.type(screen.getByLabelText("Buscar"), "team nu");
    const list = screen.getByRole("region", { name: "Tus notas" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Rival: Team Ñu"]);

    await user.click(screen.getByRole("button", { name: "Eliminar nota" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Eliminar nota",
      }),
    );
    await waitFor(async () => {
      const notes = await services.repository.listNotes();
      expect(notes.map((note) => note.title)).toEqual(["Lineups Ascent"]);
    });
  });
});

describe("Objetivos", () => {
  it("se añaden, se cumplen y se guardan con los ajustes", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Dashboard");
    const card = screen.getByRole("region", { name: "Objetivos" });

    await user.type(
      within(card).getByLabelText("Nuevo objetivo"),
      "Llegar a Radiant",
    );
    await user.type(within(card).getByLabelText("Fecha límite"), "2026-12-31");
    await user.click(
      within(card).getByRole("button", { name: "Añadir objetivo" }),
    );

    expect(card).toHaveTextContent(
      "Llegar a RadiantQuedan 90 días (31/12/2026)",
    );

    await user.click(
      within(card).getByRole("checkbox", { name: /Llegar a Radiant/ }),
    );
    expect(card).toHaveTextContent("Fecha límite: 31/12/2026");
    await waitFor(async () => {
      const settings = await services.repository.getSettings();
      expect(settings.goals).toMatchObject([
        { title: "Llegar a Radiant", deadline: "2026-12-31", done: true },
      ]);
    });

    await user.click(
      within(card).getByRole("button", {
        name: "Eliminar el objetivo Llegar a Radiant",
      }),
    );
    expect(card).toHaveTextContent("Aún no hay objetivos");
  });
});

describe("modo oscuro", () => {
  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("se cambia desde la barra lateral y se recuerda", async () => {
    const { user } = await renderApp(false);

    await user.click(screen.getByRole("button", { name: "Modo oscuro" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("player-tracker.theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Modo claro" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("player-tracker.theme")).toBe("light");
  });

  it("se elige en Ajustes, también siguiendo al sistema", async () => {
    const { user } = await renderApp(false);
    await goTo(user, "Ajustes");
    const panel = screen.getByRole("region", { name: "Apariencia" });
    expect(within(panel).getByRole("radio", { name: "Claro" })).toBeChecked();

    await user.click(within(panel).getByRole("radio", { name: "Oscuro" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    // La barra lateral ofrece volver al claro: los dos controles van a una.
    expect(
      screen.getByRole("button", { name: "Modo claro" }),
    ).toBeInTheDocument();

    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMedia);
    await user.click(
      within(panel).getByRole("radio", { name: "Como el sistema" }),
    );
    expect(window.localStorage.getItem("player-tracker.theme")).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
    vi.unstubAllGlobals();
  });
});

describe("fundido al cambiar de tema", () => {
  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "startViewTransition");
  });

  /** jsdom no trae transiciones de vista: se simula una que aplica el cambio. */
  function fakeViewTransition() {
    const start = vi.fn((update: () => void) => {
      update();
      return {};
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: start,
    });
    return start;
  }

  it("cambia de tema dentro de una transición de vista", async () => {
    const start = fakeViewTransition();
    const { user } = await renderApp(false);

    await user.click(screen.getByRole("button", { name: "Modo oscuro" }));

    expect(start).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("no hace fundido si la elección no cambia lo que se ve", async () => {
    const start = fakeViewTransition();
    // El sistema está en claro, igual que la app.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const { user } = await renderApp(false);
    await goTo(user, "Ajustes");

    await user.click(screen.getByRole("radio", { name: "Como el sistema" }));

    expect(start).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("player-tracker.theme")).toBe("system");
  });
});

describe("exportar a Excel y CSV", () => {
  const csvLines = (bytes: Uint8Array) =>
    new TextDecoder("utf-8").decode(bytes).split("\r\n");

  it("exporta todo a un Excel con una pestaña por registro", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Ajustes");

    await user.click(
      screen.getByRole("button", { name: "Exportar todo a Excel" }),
    );
    await screen.findByText("Guardado en C:/exportado/mikalog-2026-10-02.xlsx");

    const [file] = services.savedBinaries;
    expect(XLSX.read(file.bytes, { type: "array" }).SheetNames).toEqual([
      "Días",
      "Scrims y 10mans",
      "Rankeds",
      "Revisiones",
    ]);
    // La primera pestaña: cabecera y los 13 días.
    expect(readSheetFile(file.bytes, file.name)).toHaveLength(14);
  });

  it("exporta un registro a CSV", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Ajustes");
    const panel = within(
      screen.getByRole("region", { name: "Exportar a Excel o CSV" }),
    );

    await user.selectOptions(
      panel.getByLabelText("Registro"),
      "Scrims y 10mans",
    );
    await user.click(panel.getByRole("button", { name: "Exportar CSV" }));
    await panel.findByText(/Guardado en/);

    const [file] = services.savedBinaries;
    expect(file.name).toBe("mikalog-scrims-y-10mans-2026-10-02.csv");
    // Cabecera y las 18 partidas.
    expect(csvLines(file.bytes)).toHaveLength(19);
  });

  it("desde la Tabla exporta solo lo que se ve, en su orden", async () => {
    const { services, user } = await renderApp();
    await user.selectOptions(screen.getByLabelText("Etiqueta"), "saturado");

    await user.click(
      screen.getByRole("button", { name: "Exportar lo que ves" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "CSV (.csv)" }));
    await screen.findByText(
      "Guardado en C:/exportado/mikalog-dias-2026-10-02.csv",
    );

    const lines = csvLines(services.savedBinaries[0].bytes);
    expect(lines.map((line) => line.split(";")[0])).toEqual([
      "Fecha",
      "24/09/2026",
      "23/09/2026",
    ]);
  });

  it("el menú de exportar se cierra con Escape y devuelve el foco", async () => {
    const { services, user } = await renderApp();
    const button = screen.getByRole("button", { name: "Exportar lo que ves" });

    await user.click(button);
    expect(
      screen.getByRole("menuitem", { name: "Excel (.xlsx)" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(services.savedBinaries).toEqual([]);
  });

  it("los registros de scrims y rankeds también exportan a Excel", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Scrims y 10mans");
    await user.click(
      screen.getByRole("button", { name: "Exportar lo que ves" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Excel (.xlsx)" }));
    await screen.findByText(/Guardado en/);

    const [file] = services.savedBinaries;
    expect(file.name).toBe("mikalog-scrims-y-10mans-2026-10-02.xlsx");
    expect(readSheetFile(file.bytes, file.name)).toHaveLength(19);

    // Sin partidas no hay nada que exportar.
    await goTo(user, "Rankeds");
    expect(
      screen.getByRole("button", { name: "Exportar lo que ves" }),
    ).toBeDisabled();
  });
});

describe("copias automáticas", () => {
  it("al abrir la app guarda una copia y Ajustes la enseña", async () => {
    const { services, user } = await renderApp();
    await waitFor(() =>
      expect([...services.copies.keys()]).toEqual(["copia-2026-10-02.json"]),
    );

    await goTo(user, "Ajustes");
    const panel = within(
      screen.getByRole("region", { name: "Copias automáticas" }),
    );
    await panel.findByText("Última copia: 02/10/2026 · 1 copia guardada");
  });

  it("no repite la copia si la última es reciente", async () => {
    const services = await createTestServices();
    services.copies.set("copia-2026-09-28.json", "{}");
    render(<App services={services} />);
    const user = userEvent.setup();
    await screen.findByRole("navigation", { name: "Secciones" });

    await goTo(user, "Ajustes");
    await screen.findByText("Última copia: 28/09/2026 · 1 copia guardada");
    expect(services.copies.size).toBe(1);
  });

  it("se desactivan, y aun así se puede hacer una copia a mano", async () => {
    const services = await createTestServices();
    await services.repository.setSetting("backup.auto", {
      enabled: false,
      everyDays: 7,
    });
    render(<App services={services} />);
    const user = userEvent.setup();
    await screen.findByRole("navigation", { name: "Secciones" });

    await goTo(user, "Ajustes");
    const panel = within(
      screen.getByRole("region", { name: "Copias automáticas" }),
    );
    await panel.findByText("Aún no hay ninguna copia.");
    expect(panel.getByLabelText("Frecuencia")).toBeDisabled();
    expect(services.copies.size).toBe(0);

    await user.click(
      panel.getByRole("button", { name: "Hacer una copia ahora" }),
    );
    await panel.findByText("Copia guardada: copia-2026-10-02.json");
    await panel.findByText("Última copia: 02/10/2026 · 1 copia guardada");
  });

  it("guarda la frecuencia elegida", async () => {
    const { services, user } = await renderApp(false);
    await goTo(user, "Ajustes");
    const panel = within(
      screen.getByRole("region", { name: "Copias automáticas" }),
    );

    await user.selectOptions(panel.getByLabelText("Frecuencia"), "Cada día");
    await user.click(panel.getByRole("radio", { name: "Desactivadas" }));

    await waitFor(async () =>
      expect((await services.repository.getSettings())["backup.auto"]).toEqual({
        enabled: false,
        everyDays: 1,
      }),
    );
  });
});

describe("tutorial del primer arranque", () => {
  /** La app en un equipo que aún no ha visto el tutorial. */
  async function renderFirstRun(seeded = false) {
    const services = await createTestServices({ tutorialSeen: false });
    if (seeded) await seedSheet(services);
    const user = userEvent.setup();
    render(<App services={services} />);
    await screen.findByRole("navigation", { name: "Secciones" });
    return { services, user };
  }

  const next = (user: ReturnType<typeof userEvent.setup>, name = "Siguiente") =>
    user.click(screen.getByRole("button", { name }));

  it("aparece con la carpeta vacía y el foco en «Empezar»", async () => {
    await renderFirstRun();

    const dialog = screen.getByRole("dialog", {
      name: "Te doy la bienvenida a MikaLog",
    });
    expect(dialog).toHaveTextContent("Paso 1 de 3");
    expect(screen.getByRole("button", { name: "Empezar" })).toHaveFocus();
  });

  it("no aparece si la carpeta ya tiene días ni si ya se vio", async () => {
    await renderFirstRun(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    document.body.innerHTML = "";

    await renderApp(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("se puede saltar, y no vuelve a salir", async () => {
    const { services, user } = await renderFirstRun();

    await user.click(screen.getByRole("button", { name: "Saltar tutorial" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(services.platform.tutorialSeen).toBe(true);
    expect(await services.repository.listDays()).toEqual([]);
  });

  it("de principio a fin, acaba en la página del día de hoy", async () => {
    const { services, user } = await renderFirstRun();

    await next(user, "Empezar");
    const start = screen.getByRole("dialog", {
      name: "¿Cómo quieres empezar?",
    });
    expect(
      within(start).getByRole("radio", { name: /Empezar de cero/ }),
    ).toBeChecked();

    await next(user, "Atrás");
    expect(
      screen.getByRole("dialog", { name: "Te doy la bienvenida a MikaLog" }),
    ).toBeInTheDocument();
    await next(user, "Empezar");

    await next(user);
    const titles = [];
    for (let stop = 0; stop < 6; stop += 1) {
      const balloon = screen.getByRole("dialog");
      expect(balloon).toHaveTextContent(`${stop + 1} de 6`);
      titles.push(within(balloon).getByRole("heading").textContent);
      // El recorrido también avanza con la flecha derecha.
      if (stop < 5) await user.keyboard("{ArrowRight}");
    }
    expect(titles).toEqual([
      "Tabla",
      "La página del día",
      "Scrims y 10mans",
      "Dashboard",
      "Insights",
      "Ajustes",
    ]);
    expect(screen.getByRole("button", { name: "Terminar" })).toHaveFocus();

    await next(user, "Terminar");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "viernes, 2 de octubre de 2026",
    );
    expect(services.platform.tutorialSeen).toBe(true);
    await waitFor(async () => {
      expect(await services.repository.listDays()).toHaveLength(1);
    });
  });

  it("si eliges importar la hoja, acaba en Ajustes", async () => {
    const { services, user } = await renderFirstRun();

    await next(user, "Empezar");
    await user.click(screen.getByRole("radio", { name: /Importar mi hoja/ }));
    await next(user);
    for (let stop = 0; stop < 5; stop += 1) await next(user);
    await next(user, "Terminar");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ajustes",
    );
    expect(
      screen.getByRole("region", { name: "Importar mi hoja" }),
    ).toBeInTheDocument();
    expect(await services.repository.listDays()).toEqual([]);
  });

  it("Escape sale del recorrido sin crear nada", async () => {
    const { services, user } = await renderFirstRun();
    await next(user, "Empezar");
    await next(user);
    expect(screen.getByRole("dialog", { name: "Tabla" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(services.platform.tutorialSeen).toBe(true);
    expect(await services.repository.listDays()).toEqual([]);
  });

  it("se repite desde Ajustes", async () => {
    const { user } = await renderApp();
    await goTo(user, "Ajustes");

    await user.click(screen.getByRole("button", { name: "Ver el tutorial" }));

    expect(
      screen.getByRole("dialog", { name: "Te doy la bienvenida a MikaLog" }),
    ).toBeInTheDocument();
    // Detrás queda la Tabla, que es lo que señala el recorrido.
    expect(
      screen.getByRole("heading", { level: 1, hidden: true }),
    ).toHaveTextContent("Tabla");
  });
});

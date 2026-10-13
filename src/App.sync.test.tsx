import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { EditionId } from "./app/edition";
import type { HttpResponse } from "./data/henrikSource";
import { createTestServices, type TestServices } from "./test/testServices";

// TipTap necesita un navegador de verdad; ver App.test.tsx.
vi.mock("./views/tabla/FeelingsEditor", () => ({
  FeelingsEditor: ({ label = "Feelings del día" }: { label?: string }) => (
    <textarea aria-label={label} />
  ),
}));

const TODAY = new Date(2026, 9, 2, 12, 0);
const KEY = "HDEV-clave-de-prueba";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

type User = ReturnType<typeof userEvent.setup>;

/** Partida de `stored-matches` a una hora local de octubre de 2026. */
function stored(
  id: string,
  day: number,
  hour: number,
  patch: { agent?: string; map?: string; kills?: number; deaths?: number } = {},
) {
  return {
    meta: {
      id,
      map: { name: patch.map ?? "Lotus" },
      started_at: new Date(2026, 9, day, hour).toISOString(),
    },
    stats: {
      team: "Red",
      character: { name: patch.agent ?? "Fade" },
      score: 4000,
      kills: patch.kills ?? 20,
      deaths: patch.deaths ?? 10,
    },
    teams: { red: 13, blue: 7 },
  };
}

const ok = (data: unknown[]): HttpResponse => ({
  status: 200,
  body: { results: { after: 0 }, data },
  retryAfterSeconds: null,
});

async function renderApp({
  edition = "base",
  configured = true,
  tutorialSeen = true,
}: { edition?: EditionId; configured?: boolean; tutorialSeen?: boolean } = {}) {
  const services = await createTestServices({ edition, tutorialSeen });
  if (configured) {
    await services.repository.setSetting("riot.id", "Saiz#ARK");
    await services.repository.setSetting("riot.region", "eu");
    services.secrets.set("henrikdev-api-key", KEY);
  }
  const user = userEvent.setup();
  render(<App services={services} />);
  await screen.findByRole("navigation", { name: "Secciones" });
  return { services, user };
}

const goTo = (user: User, section: string) =>
  user.click(
    within(screen.getByRole("navigation", { name: "Secciones" })).getByRole(
      "button",
      { name: section },
    ),
  );

const syncPanel = () =>
  within(screen.getByRole("region", { name: "Sincronizar partidas" }));

/** Abre la página de hoy, creando el día. */
async function openToday(user: User) {
  await user.click(screen.getByRole("button", { name: "Añadir hoy" }));
  return within(screen.getByRole("region", { name: "Partidas de ranked" }));
}

const dayValues = async (services: TestServices, date: string) =>
  (await services.repository.listDays()).find((day) => day.date === date)
    ?.values;

describe.each<EditionId>(["base", "saiz"])(
  "sincronizar partidas en la edición %s",
  (edition) => {
    it("la tarjeta de Ajustes trae la guía para sacar la clave", async () => {
      const { user } = await renderApp({ edition, configured: false });
      await goTo(user, "Ajustes");
      const panel = syncPanel();

      const steps = panel.getAllByRole("listitem");
      expect(steps).toHaveLength(4);
      expect(steps[0]).toHaveTextContent(
        "https://discord.com/invite/X3GaVkX2YN",
      );
      expect(steps[2]).toHaveTextContent("#get-a-key");
      expect(steps[3]).toHaveTextContent("empieza por HDEV-");
      expect(
        panel.getByText(/solo hacia api\.henrikdev\.xyz/),
      ).toBeInTheDocument();
      expect(
        panel.getByRole("button", { name: "Probar conexión" }),
      ).toBeDisabled();
    });

    it("sincroniza un día y repetirlo no duplica partidas", async () => {
      const { services, user } = await renderApp({ edition });
      const matches = [
        stored("m3", 2, 11, {
          agent: "Raze",
          map: "Bind",
          kills: 10,
          deaths: 20,
        }),
        stored("m2", 2, 10),
        stored("m1", 2, 9),
        stored("ayer", 1, 22),
      ];
      services.httpResponses.push(ok(matches), ok(matches));
      const card = await openToday(user);

      await user.click(card.getByRole("button", { name: "Sincronizar" }));

      expect(await card.findByRole("status")).toHaveTextContent(
        "3 partidas encontradas, 3 nuevas. Rankeds, K/D, ACS, agentes y mapas actualizados en 1 día.",
      );
      expect(card.getByText("Partidas").parentElement).toHaveTextContent("3");
      expect(screen.getByLabelText("Rankeds")).toHaveValue("3");
      // 50 kills entre 40 muertes; 12000 de puntuación entre 60 rondas.
      expect(screen.getByLabelText("K/D")).toHaveValue("1.25");
      expect(screen.getByLabelText("ACS")).toHaveValue("200");
      expect(screen.getByLabelText("Agentes")).toHaveValue("Fade ×2, Raze ×1");
      expect(screen.getByLabelText("Mapas")).toHaveValue("Lotus ×2, Bind ×1");

      await user.click(card.getByRole("button", { name: "Sincronizar" }));
      expect(await card.findByRole("status")).toHaveTextContent(
        "3 partidas encontradas, 0 nuevas.",
      );

      await waitFor(async () => {
        const sessions = await services.repository.listRankedSessions();
        expect(
          sessions.map((session) => [
            session.externalMatchId,
            session.source,
            session.date,
          ]),
        ).toEqual([
          ["riot:m1", "henrikdev", "2026-10-02"],
          ["riot:m2", "henrikdev", "2026-10-02"],
          ["riot:m3", "henrikdev", "2026-10-02"],
        ]);
      });
      expect(await dayValues(services, "2026-10-02")).toMatchObject({
        rankeds: 3,
        kd: 1.25,
        acs: 200,
        agents: "Fade ×2, Raze ×1",
        maps: "Lotus ×2, Bind ×1",
      });
      // Solo se conecta al pulsar, con la clave en la cabecera.
      expect(services.httpCalls).toHaveLength(2);
      expect(services.httpCalls[0]).toEqual({
        url: "https://api.henrikdev.xyz/valorant/v1/stored-matches/eu/Saiz/ARK?mode=competitive&size=60&page=1",
        headers: { Authorization: KEY },
      });
    });
  },
);

describe("Ajustes > Sincronizar partidas", () => {
  it("guarda la clave en el almacén de credenciales, no en los datos", async () => {
    const { services, user } = await renderApp({ configured: false });
    await goTo(user, "Ajustes");
    const panel = syncPanel();

    await user.type(panel.getByLabelText("Riot ID"), "Saiz#ARK{Enter}");
    await user.selectOptions(panel.getByLabelText("Región"), "Europa");
    const key = panel.getByLabelText("Clave de HenrikDev");
    await waitFor(() => expect(key).toBeEnabled());
    await user.type(key, KEY);
    await user.tab();

    await waitFor(() =>
      expect(services.secrets.get("henrikdev-api-key")).toBe(KEY),
    );
    expect(key).toHaveAttribute("type", "password");

    services.httpResponses.push({
      status: 200,
      body: { data: { region: "eu", account_level: 312 } },
      retryAfterSeconds: null,
    });
    await user.click(panel.getByRole("button", { name: "Probar conexión" }));
    expect(
      await panel.findByText(/Conectada: Saiz#ARK, nivel 312/),
    ).toBeVisible();
    expect(services.httpCalls[0]).toEqual({
      url: "https://api.henrikdev.xyz/valorant/v2/account/Saiz/ARK",
      headers: { Authorization: KEY },
    });

    // Ni en los ajustes ni en la copia en JSON.
    await waitFor(async () => {
      expect(await services.repository.getSettings()).toMatchObject({
        "riot.id": "Saiz#ARK",
        "riot.region": "eu",
        "sync.source": "henrikdev",
      });
    });
    expect(
      JSON.stringify(await services.repository.getSettings()),
    ).not.toContain(KEY);
    await user.click(screen.getByRole("button", { name: "Exportar JSON" }));
    await screen.findByText(/Exportados 0 días/);
    expect(services.savedFiles[0].text).not.toContain(KEY);
  });

  it("avisa si la clave no tiene pinta de clave y si HenrikDev la rechaza", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Ajustes");
    const panel = syncPanel();
    const key = panel.getByLabelText("Clave de HenrikDev");
    await waitFor(() => expect(key).toHaveValue(KEY));

    await user.clear(key);
    await user.type(key, "otra-cosa");
    await user.tab();
    expect(panel.getByText(/Las claves empiezan por HDEV-/)).toBeVisible();

    services.httpResponses.push({
      status: 401,
      body: null,
      retryAfterSeconds: null,
    });
    await user.click(panel.getByRole("button", { name: "Probar conexión" }));
    expect(await panel.findByRole("alert")).toHaveTextContent(
      "Clave no válida: HenrikDev no la acepta.",
    );
  });

  it("borrar la clave la quita del almacén", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Ajustes");
    const key = syncPanel().getByLabelText("Clave de HenrikDev");
    await waitFor(() => expect(key).toHaveValue(KEY));

    await user.clear(key);
    await user.tab();

    await waitFor(() => expect(services.secrets.size).toBe(0));
    expect(
      syncPanel().getByRole("button", { name: "Probar conexión" }),
    ).toBeDisabled();
  });

  it("pasa al almacén la clave que una versión antigua guardó en los ajustes", async () => {
    const services = await createTestServices();
    await services.repository.setSetting("henrikdev.apiKey", KEY);
    const user = userEvent.setup();
    render(<App services={services} />);
    await screen.findByRole("navigation", { name: "Secciones" });

    await goTo(user, "Ajustes");

    await waitFor(() =>
      expect(services.secrets.get("henrikdev-api-key")).toBe(KEY),
    );
    await waitFor(async () => {
      expect(
        (await services.repository.getSettings())["henrikdev.apiKey"],
      ).toBe("");
    });
  });

  it("elige qué colas cuentan, con el competitivo siempre", async () => {
    const { services, user } = await renderApp();
    await goTo(user, "Ajustes");
    const panel = syncPanel();

    expect(panel.getByRole("checkbox", { name: "Competitivo" })).toBeChecked();
    expect(panel.getByRole("checkbox", { name: "Competitivo" })).toBeDisabled();
    await user.click(panel.getByRole("checkbox", { name: "Premier" }));

    await waitFor(async () => {
      expect((await services.repository.getSettings())["riot.queues"]).toEqual([
        "premier",
      ]);
    });

    // Una petición por cola.
    await goTo(user, "Tabla");
    const card = await openToday(user);
    await user.click(card.getByRole("button", { name: "Sincronizar" }));
    await card.findByRole("status");
    expect(
      services.httpCalls.map((call) =>
        new URL(call.url).searchParams.get("mode"),
      ),
    ).toEqual(["competitive", "premier"]);
  });
});

describe("botones de sincronizar", () => {
  it("sin configurar no llama a nadie y lleva a la tarjeta de Ajustes", async () => {
    const { services, user } = await renderApp({ configured: false });
    const card = await openToday(user);

    await user.click(card.getByRole("button", { name: "Sincronizar" }));
    expect(await card.findByRole("status")).toHaveTextContent(
      "Para sincronizar hacen falta tu Riot ID, tu región y una clave de HenrikDev.",
    );
    expect(services.httpCalls).toEqual([]);

    await user.click(card.getByRole("button", { name: "Ir a Ajustes" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ajustes",
    );
    expect(
      screen.getByRole("region", { name: "Sincronizar partidas" }),
    ).toBeInTheDocument();
  });

  it("sin partidas ese día no toca el día", async () => {
    const { services, user } = await renderApp();
    services.httpResponses.push(ok([stored("ayer", 1, 22)]));
    const card = await openToday(user);

    await user.click(card.getByRole("button", { name: "Sincronizar" }));

    expect(await card.findByRole("status")).toHaveTextContent(
      "HenrikDev no tiene partidas de este día.",
    );
    expect(await dayValues(services, "2026-10-02")).toEqual({});
    expect(await services.repository.listRankedSessions()).toEqual([]);
  });

  it("con demasiadas peticiones dice cuánto esperar y no guarda nada", async () => {
    const { services, user } = await renderApp();
    services.httpResponses.push({
      status: 429,
      body: null,
      retryAfterSeconds: 23,
    });
    const card = await openToday(user);

    await user.click(card.getByRole("button", { name: "Sincronizar" }));

    expect(await card.findByRole("alert")).toHaveTextContent(
      "Demasiadas peticiones: la clave tiene un límite por minuto. Vuelve a pulsar dentro de 23 segundos.",
    );
    expect(await services.repository.listRankedSessions()).toEqual([]);
  });

  it("Rankeds sincroniza los últimos 7 días con una sola petición", async () => {
    const { services, user } = await renderApp();
    services.httpResponses.push(
      ok([
        stored("hoy", 2, 10),
        stored("ayer-2", 1, 22, { agent: "Jett" }),
        stored("ayer-1", 1, 20, { agent: "Jett" }),
        // Fuera de los 7 días (26/09 a 02/10).
        stored("viejo", -5, 20),
      ]),
    );
    await goTo(user, "Rankeds");

    await user.click(
      screen.getByRole("button", { name: "Sincronizar los últimos 7 días" }),
    );

    expect(
      await screen.findByText(
        "3 partidas encontradas, 3 nuevas. Rankeds, K/D, ACS, agentes y mapas actualizados en 2 días.",
      ),
    ).toBeVisible();
    expect(services.httpCalls).toHaveLength(1);
    await waitFor(async () => {
      expect(await dayValues(services, "2026-10-01")).toMatchObject({
        rankeds: 2,
        agents: "Jett ×2",
      });
    });
    expect(await dayValues(services, "2026-10-02")).toMatchObject({
      rankeds: 1,
      agents: "Fade ×1",
    });
    // Los días sin partidas no se crean.
    expect(await services.repository.listDays()).toHaveLength(2);
    expect(await services.repository.listRankedSessions()).toHaveLength(3);
  });

  it("no pisa una partida corregida a mano", async () => {
    const { services, user } = await renderApp();
    const matches = [stored("m1", 2, 9)];
    services.httpResponses.push(ok(matches), ok(matches));
    const card = await openToday(user);
    await user.click(card.getByRole("button", { name: "Sincronizar" }));
    await card.findByRole("status");

    await waitFor(async () => {
      expect(await services.repository.listRankedSessions()).toHaveLength(1);
    });
    const [session] = await services.repository.listRankedSessions();
    await services.repository.saveRankedSessions([
      { ...session, agent: "Neon" },
    ]);
    document.body.innerHTML = "";
    render(<App services={services} />);
    await screen.findByRole("navigation", { name: "Secciones" });

    await user.click(screen.getByRole("button", { name: "02/10/2026" }));
    const again = within(
      screen.getByRole("region", { name: "Partidas de ranked" }),
    );
    await user.click(again.getByRole("button", { name: "Sincronizar" }));
    await again.findByRole("status");

    expect(screen.getByLabelText("Agentes")).toHaveValue("Neon ×1");
    await waitFor(async () => {
      expect(await services.repository.listRankedSessions()).toMatchObject([
        { agent: "Neon" },
      ]);
    });
  });
});

describe("tutorial", () => {
  it("«Configurar ahora» cierra el tutorial en la tarjeta de sincronizar", async () => {
    const { services, user } = await renderApp({
      configured: false,
      tutorialSeen: false,
    });

    await user.click(screen.getByRole("button", { name: "Empezar" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    const step = screen.getByRole("dialog", {
      name: "Rellena tus partidas solo (opcional)",
    });
    expect(within(step).getAllByRole("listitem")).toHaveLength(4);
    await user.click(
      within(step).getByRole("button", { name: "Configurar ahora" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ajustes",
    );
    expect(
      screen.getByRole("region", { name: "Sincronizar partidas" }),
    ).toBeInTheDocument();
    expect(services.platform.tutorialSeen).toBe(true);
    expect(await services.repository.listDays()).toEqual([]);
  });
});

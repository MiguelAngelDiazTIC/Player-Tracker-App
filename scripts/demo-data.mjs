// Genera datos de ejemplo para probar la app sin datos reales.
//
//   npm run demo:data    crea .demo/player-tracker-demo.json
//   npm run demo         abre la app con una identidad aparte ("demo")
//
// El JSON tiene el mismo formato que "Exportar JSON", así que se carga desde
// Ajustes > Importar JSON. Son datos inventados: unas 11 semanas de días,
// scrims, rankeds, notas, revisiones y objetivos, acabando en la fecha de hoy.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DAYS = 75;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".demo", "player-tracker-demo.json");

// Generador con semilla: los mismos datos en cada ejecución (salvo las fechas).
let seed = 20260914;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
const between = (min, max) => min + random() * (max - min);
const whole = (min, max) => Math.round(between(min, max));
const chance = (probability) => random() < probability;
const pick = (list) => list[Math.floor(random() * list.length)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, decimals = 0) =>
  Math.round(value * 10 ** decimals) / 10 ** decimals;

const pad = (value) => String(value).padStart(2, "0");
const iso = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shown = (date) => {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
};
const today = new Date();
today.setHours(12, 0, 0, 0);
const dateAt = (daysAgo) => {
  const date = new Date(today);
  date.setDate(date.getDate() - daysAgo);
  return date;
};

// La plantilla por defecto de la app (src/domain/fields.ts).
const fieldDefinitions = [
  ["rankeds", "Rankeds", "number", "Juego", null],
  ["scrims", "10mans / scrims", "scrim_count", "Juego", null],
  ["dms", "DMs", "number", "Juego", null],
  ["kovaaks", "Kovaaks", "number", "Juego", null],
  ["gym", "Gimnasio", "tristate", "Hábitos core", null],
  ["supplements", "Suplementación", "bool", "Hábitos core", null],
  ["nutrition", "Nutrición", "bool", "Hábitos core", null],
  [
    "sleep_score",
    "Sleep score",
    "scale",
    "Sueño",
    { mode: "fixed", direction: "higher", good: 80, warn: 70 },
  ],
  [
    "sleep_hours",
    "Horas de sueño",
    "duration",
    "Sueño",
    { mode: "fixed", direction: "higher", good: 420, warn: 360 },
  ],
  ["kd", "K/D", "decimal", "Rendimiento", { mode: "average" }],
  ["acs", "ACS", "number", "Rendimiento", { mode: "average" }],
].map(([key, label, type, group, thresholds], order) => ({
  id: `default-${key}`,
  key,
  label,
  type,
  group,
  order,
  thresholds,
  archived: false,
}));

const MAPS = [
  // [mapa, lo bien que se le da al jugador]
  ["Ascent", 0.18],
  ["Haven", 0.1],
  ["Split", 0.05],
  ["Lotus", 0],
  ["Sunset", -0.04],
  ["Bind", -0.08],
  ["Abyss", -0.16],
];
const AGENTS = [
  ["Cypher", 0.08],
  ["Cypher", 0.08],
  ["Cypher", 0.08],
  ["Viper", 0],
  ["Vyse", -0.05],
  ["Fade", 0.03],
  ["Sova", -0.02],
];

const FEELINGS = {
  great: [
    "Día muy #fino. Aim limpio desde la primera partida y decisiones rápidas.",
    "De los mejores días de la semana: he entrado a las rankeds con energía y no he tirado ninguna ronda fácil. #fino",
    "Me he sentido super bien, comunicando mucho y sin precipitarme en los retakes.",
  ],
  good: [
    "Buen día en general. Alguna partida floja, pero he mantenido el mental.",
    "Rankeds decentes. He notado que con el calentamiento largo empiezo mejor.",
    "Día normal tirando a bueno, sin grandes errores. Mañana más.",
    "He jugado tranquilo y #clean, priorizando no morir primero.",
  ],
  bad: [
    "Día raro: malas decisiones y poca paciencia. Un poco de #tilt en las últimas partidas.",
    "He jugado en #autopilot casi todo el rato, repitiendo los mismos peeks.",
    "No me he encontrado. Mucho #tilt tras perder dos partidas seguidas por rondas tontas.",
  ],
  tired: [
    "He dormido fatal y se ha notado: lento de reacción y sin ganas de comunicar.",
    "Poco sueño y mucha cafeína. El aim estaba, la cabeza no.",
  ],
  saturated: [
    "Demasiadas partidas seguidas. Me noto #saturado y jugando por inercia.",
    "Otra vez #saturado: llevo días de mucho grind y ya no disfruto las últimas rankeds.",
    "Estoy #saturado. Mañana menos partidas y un paseo antes de jugar.",
  ],
};

// --- Días ---------------------------------------------------------------
const days = [];
const dayByDate = new Map();
for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
  const date = dateAt(daysAgo);
  const weekday = (date.getDay() + 6) % 7; // 0 = lunes
  // Algún día sin registrar, pero no en las dos últimas semanas.
  if (daysAgo > 14 && chance(0.07)) continue;

  const grinding = daysAgo >= 1 && daysAgo <= 6;
  const badNight = chance(0.1);
  const sleepHours = Math.round(
    badNight
      ? between(230, 330)
      : clamp(between(370, 500) + (weekday >= 5 ? 35 : 0), 300, 570),
  );
  const sleepScore = Math.round(
    clamp(42 + ((sleepHours - 240) / 300) * 50 + between(-7, 7), 35, 98),
  );
  const gymDay = [0, 1, 3, 4].includes(weekday);
  const gym = gymDay ? (chance(0.1) ? "missed" : "done") : "rest";
  const supplements = !chance(0.07);
  const nutrition = !chance(weekday >= 5 ? 0.35 : 0.1);
  const rankeds = grinding
    ? whole(9, 12)
    : Math.max(0, [8, 8, 6, 8, 7, 3, 9][weekday] + whole(-3, 2));
  const habits = (gym !== "missed") + supplements + nutrition;

  const kd = round(
    clamp(
      1.12 +
        (sleepScore - 76) * 0.009 +
        (habits - 2.6) * 0.07 -
        (rankeds > 9 ? 0.1 : 0) +
        between(-0.2, 0.2),
      0.62,
      1.95,
    ),
    2,
  );
  const acs = Math.round(clamp(148 + kd * 62 + between(-16, 16), 140, 330));

  const mood =
    grinding && chance(0.5)
      ? "saturated"
      : badNight
        ? "tired"
        : kd >= 1.4
          ? "great"
          : kd < 0.98
            ? "bad"
            : "good";
  const feelingsMd = pick(FEELINGS[mood]);

  const values = {
    dms: chance(0.15) ? 0 : whole(1, 12),
    kovaaks: chance(0.12) ? 0 : pick([15, 20, 20, 25]),
    gym,
    supplements,
    nutrition,
    sleep_hours: sleepHours,
  };
  // Algún sleep score sin dato, como la "X" de la hoja.
  if (!chance(0.05)) values.sleep_score = sleepScore;
  values.rankeds = rankeds;
  if (rankeds > 0) {
    values.kd = kd;
    values.acs = acs;
  }

  const day = { date: iso(date), values, feelingsMd, tags: [] };
  days.push(day);
  dayByDate.set(day.date, day);
}

// --- Rankeds partida a partida (últimas tres semanas) --------------------
const rankedSessions = [];
for (const day of days) {
  const daysAgo = Math.round(
    (today - new Date(`${day.date}T12:00:00`)) / 864e5,
  );
  if (daysAgo > 21 || !day.values.rankeds) continue;

  let kills = 0;
  let deaths = 0;
  let score = 0;
  let rounds = 0;
  for (let index = 0; index < day.values.rankeds; index += 1) {
    const [map, mapBonus] = pick(MAPS);
    const [agent, agentBonus] = pick(AGENTS);
    const form = clamp(
      day.values.kd + mapBonus + agentBonus + between(-0.3, 0.3),
      0.4,
      2.6,
    );
    const matchRounds = whole(15, 26);
    const matchDeaths = whole(9, 19);
    const matchKills = Math.max(3, Math.round(matchDeaths * form));
    const matchScore = Math.round(
      matchRounds * clamp(150 + form * 62 + between(-25, 25), 110, 380),
    );
    const win = chance(clamp(0.5 + (form - 1.1) * 0.45, 0.15, 0.88));
    rankedSessions.push({
      id: `demo-ranked-${rankedSessions.length + 1}`,
      date: day.date,
      map,
      agent,
      result:
        matchRounds === 24 && chance(0.06) ? "draw" : win ? "win" : "loss",
      kills: matchKills,
      deaths: matchDeaths,
      score: matchScore,
      rounds: matchRounds,
      source: "manual",
      externalMatchId: null,
    });
    kills += matchKills;
    deaths += matchDeaths;
    score += matchScore;
    rounds += matchRounds;
  }
  // Las cifras del día salen de sus partidas, como al sincronizar.
  day.values.kd = round(kills / deaths, 2);
  day.values.acs = Math.round(score / rounds);
}

// --- Scrims y 10mans -----------------------------------------------------
const OPPONENTS = [
  "Lobos Grises",
  "Night Owls",
  "Team Ñu",
  "Zeta Dos",
  "Los Cuervos",
  "Ronin EU",
];
const SCRIM_NOTES = [
  "",
  "",
  "Buen ataque, floja la defensa de B.",
  "Perdimos las dos pistol rounds.",
  "Mucho mejor la comunicación en los retakes.",
  "Nos leyeron los executes de A; hay que variar.",
  "Partida muy igualada, decidida en el clutch final.",
];
const scrimMatches = [];
for (const day of days) {
  const weekday = (new Date(`${day.date}T12:00:00`).getDay() + 6) % 7;
  const matches = [1, 3].includes(weekday)
    ? whole(1, 3)
    : weekday === 6 && chance(0.4)
      ? whole(1, 2)
      : 0;
  for (let index = 0; index < matches; index += 1) {
    const isScrim = chance(0.35);
    const [map, mapBonus] = pick(MAPS);
    const [agent] = pick(AGENTS);
    const form = clamp(1.05 + mapBonus + between(-0.35, 0.35), 0.5, 2.2);
    const win = chance(clamp(0.48 + (form - 1.05) * 0.5, 0.2, 0.85));
    const loserRounds = whole(3, 11);
    const totalRounds = 13 + loserRounds;
    const deaths = whole(10, 18);
    scrimMatches.push({
      id: `demo-scrim-${scrimMatches.length + 1}`,
      date: day.date,
      kind: isScrim ? "scrim" : "10mans",
      opponent: isScrim ? pick(OPPONENTS) : "",
      map,
      agent,
      result: win ? "win" : "loss",
      roundsWon: win ? 13 : loserRounds,
      roundsLost: win ? loserRounds : 13,
      kills: Math.max(4, Math.round(deaths * form)),
      deaths,
      acs: Math.round(clamp(150 + form * 60 + between(-20, 20), 120, 350)),
      vodUrl:
        isScrim && chance(0.6)
          ? `https://example.com/vod/${1000 + scrimMatches.length}`
          : "",
      notes: pick(SCRIM_NOTES),
      totalRounds,
    });
  }
}
for (const match of scrimMatches) delete match.totalRounds;

// --- Etiquetas (se extraen del texto, como hace la app) -------------------
const lastScrim = scrimMatches.findLast((match) => match.kind === "scrim");
const linkedDay = days[days.length - 9];
linkedDay.feelingsMd += " He repasado la [[Rutina de aim]] antes de jugar.";
days[days.length - 3].feelingsMd +=
  " Hoy tocaba aplicar los [[Lineups Ascent]] en ranked.";
for (const day of days) {
  day.tags = [
    ...new Set(
      [
        ...day.feelingsMd.matchAll(
          /(?<![\p{L}\p{N}_/#])#([\p{L}][\p{L}\p{N}_-]*)/gu,
        ),
      ].map((match) => match[1].toLowerCase()),
    ),
  ];
}

// --- Notas enlazadas -----------------------------------------------------
const rivalDate = shown(lastScrim?.date ?? days[days.length - 5].date);
const links = (text) => [
  ...new Set(
    [...text.matchAll(/\[\[([^[\]\n]+)\]\]/g)].map((m) => m[1].trim()),
  ),
];
const notes = [
  [
    "Lineups Ascent",
    `## Ataque A\n\n- Molly de Viper para la caja de generador.\n- Dardo de Sova desde lobby a heaven.\n\n## Defensa B\n\n- Cámara de Cypher en el mercado.\n\nProbar contra [[Rival: Lobos Grises]], que siempre entran por B.`,
  ],
  [
    "Rival: Lobos Grises",
    `Juegan muy rápido las primeras rondas y fuerzan mucho tras perder pistolas.\n\n- Su duelista entra siempre primero por B main.\n- Flojos en retakes si les quitas la información.\n\nÚltimo scrim: [[${rivalDate}]]. Preparar los [[Lineups Ascent]].`,
  ],
  [
    "Rutina de aim",
    `Antes de las rankeds, 20 minutos:\n\n1. Kovaaks: tracking suave (5 min).\n2. Kovaaks: clicks estáticos (5 min).\n3. 2 deathmatches centrados en el crosshair placement.\n\nSi llego #saturado, solo los deathmatches.`,
  ],
  [
    "Objetivos de la semana",
    `- Dormir 7h o más al menos 5 días.\n- No pasar de 8 rankeds al día.\n- Repasar la [[Rutina de aim]] todos los días.\n- Ver el VOD del scrim del [[${rivalDate}]].`,
  ],
  [
    "VOD: derrota en Abyss",
    `Perdimos por entrar siempre igual a A.\n\n- Ronda 7: muero primero sin intercambio.\n- Ronda 15: retake sin utilidad.\n\nRelacionado con [[Rival: Lobos Grises]].`,
  ],
].map(([title, bodyMd], index) => ({
  id: `demo-nota-${index + 1}`,
  title,
  bodyMd,
  links: links(bodyMd),
}));

// --- Revisiones semanales (las cuatro últimas semanas completas) ---------
const monday = new Date(today);
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const REVIEWS = [
  [
    "Los días de 7h o más de sueño mi K/D sube.",
    "Demasiadas rankeds seguidas a final de semana.",
    "Parar a las 8 partidas y dar un paseo antes de la última tanda.",
  ],
  [
    "El calentamiento largo antes de rankear.",
    "Me salté la nutrición el fin de semana.",
    "Preparar la comida del sábado el viernes.",
  ],
  [
    "Comunicar más en los retakes.",
    "Dos noches de menos de 6h.",
    "Móvil fuera de la habitación a las 23:30.",
  ],
  [
    "Jugar Cypher en Ascent y Haven.",
    "Abyss: entro siempre igual.",
    "Ver el VOD de Abyss y cambiar la entrada a A.",
  ],
];
const weeklyReviews = REVIEWS.map((conclusions, index) => {
  const start = new Date(monday);
  start.setDate(start.getDate() - 7 * (index + 1));
  return { weekStart: iso(start), conclusions };
}).reverse();

// --- Objetivos -----------------------------------------------------------
const yearEnd = `${today.getFullYear()}-12-31`;
const settings = {
  goals: [
    {
      id: "demo-goal-1",
      title: "Llegar a Radiant",
      deadline: yearEnd,
      done: false,
    },
    {
      id: "demo-goal-2",
      title: "Dormir 7h de media este mes",
      deadline: iso(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      done: false,
    },
    {
      id: "demo-goal-3",
      title: "Subir el ACS medio a 230",
      deadline: null,
      done: false,
    },
    {
      id: "demo-goal-4",
      title: "Cuatro semanas seguidas de gimnasio",
      deadline: iso(dateAt(10)),
      done: true,
    },
  ],
};

const data = {
  format: "player-tracker",
  version: 1,
  exportedAt: new Date().toISOString(),
  fieldDefinitions,
  days,
  scrimMatches,
  weeklyReviews,
  rankedSessions,
  notes,
  settings,
  attachments: [],
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(data, null, 2));
console.log(
  `Datos de ejemplo en ${output}\n` +
    `  ${days.length} días (del ${shown(days[0].date)} al ${shown(days[days.length - 1].date)}), ` +
    `${scrimMatches.length} scrims y 10mans, ${rankedSessions.length} rankeds, ` +
    `${notes.length} notas, ${weeklyReviews.length} revisiones y ${settings.goals.length} objetivos.`,
);

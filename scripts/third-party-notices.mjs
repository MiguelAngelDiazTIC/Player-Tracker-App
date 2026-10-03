// Genera THIRD-PARTY-NOTICES.md: las licencias de todo lo que se reparte con
// la app (paquetes de npm que entran en el instalador y crates de Rust).
// Uso: npm run notices
//
// Falla si aparece una licencia que no está en la lista de compatibles con la
// GPL-3.0, para enterarse al añadir una dependencia.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(root, "THIRD-PARTY-NOTICES.md");
// El instalador solo se compila para Windows.
const TARGET = "x86_64-pc-windows-msvc";

const COMPATIBLE = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSL-1.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "OFL-1.1",
  "Unicode-3.0",
  "Unicode-DFS-2016",
  "Unlicense",
  "Zlib",
]);

/**
 * ¿Hay alguna forma de cumplir la expresión solo con licencias compatibles?
 * Entiende `A OR B`, `A AND B`, `A/B` (forma antigua de OR) y `A WITH excepción`.
 */
function isCompatible(expression) {
  return expression
    .replace(/[()]/g, " ")
    .split(/\s+OR\s+|\//i)
    .some((option) =>
      option
        .split(/\s+AND\s+/i)
        .every((part) =>
          COMPATIBLE.has(part.replace(/\s+WITH\s+.*$/i, "").trim()),
        ),
    );
}

const LICENSE_FILE = /^(licen[sc]e|copying|notice|unlicense)/i;

/** Textos de licencia que trae un paquete en su carpeta, ya normalizados. */
function licenseTexts(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENSE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) =>
      readFileSync(join(folder, name), "utf8")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+$/gm, "")
        .trim(),
    )
    .filter((text) => text !== "");
}

/** Paquetes de npm que no son de desarrollo: los que acaban en el instalador. */
function npmPackages() {
  const lock = JSON.parse(
    readFileSync(join(root, "package-lock.json"), "utf8"),
  );
  return Object.entries(lock.packages)
    .filter(([path, info]) => path !== "" && !info.dev && !info.devOptional)
    .filter(([path]) => existsSync(join(root, path, "package.json")))
    .map(([path]) => {
      const folder = join(root, path);
      const info = JSON.parse(
        readFileSync(join(folder, "package.json"), "utf8"),
      );
      const repository =
        typeof info.repository === "string"
          ? info.repository
          : (info.repository?.url ?? "");
      return {
        kind: "npm",
        name: info.name,
        version: info.version,
        license:
          typeof info.license === "string" ? info.license : "(sin indicar)",
        url: info.homepage ?? repository.replace(/^git\+/, ""),
        texts: licenseTexts(folder),
      };
    });
}

/** Crates de Rust que se enlazan en el ejecutable (sin los de compilación). */
function rustPackages() {
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--format-version",
        "1",
        "--locked",
        "--filter-platform",
        TARGET,
        "--manifest-path",
        join(root, "src-tauri", "Cargo.toml"),
      ],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    ),
  );
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const used = new Set();
  const pending = [metadata.resolve.root];
  while (pending.length > 0) {
    const id = pending.pop();
    if (used.has(id)) continue;
    used.add(id);
    for (const dependency of nodes.get(id).deps) {
      // `kind: null` es una dependencia normal; "build" y "dev" no se reparten.
      if (dependency.dep_kinds.some((item) => item.kind === null)) {
        pending.push(dependency.pkg);
      }
    }
  }
  return metadata.packages
    .filter((item) => used.has(item.id) && item.id !== metadata.resolve.root)
    .map((item) => ({
      kind: "Rust",
      name: item.name,
      version: item.version,
      license: item.license ?? "(sin indicar)",
      url: item.repository ?? item.homepage ?? "",
      texts: licenseTexts(dirname(item.manifest_path)),
    }));
}

const packages = [...npmPackages(), ...rustPackages()].sort(
  (a, b) =>
    a.name.localeCompare(b.name, "en") ||
    a.version.localeCompare(b.version, "en") ||
    a.kind.localeCompare(b.kind, "en"),
);

const incompatible = packages.filter((item) => !isCompatible(item.license));
if (incompatible.length > 0) {
  console.error("Licencias que no están en la lista de compatibles:");
  for (const item of incompatible) {
    console.error(`  ${item.name} ${item.version}: ${item.license}`);
  }
  process.exit(1);
}

// Un mismo texto (la Apache-2.0, por ejemplo) se escribe una sola vez.
const byText = new Map();
for (const item of packages) {
  for (const text of item.texts) {
    const users = byText.get(text) ?? [];
    users.push(`${item.name} ${item.version}`);
    byText.set(text, users);
  }
}
const texts = [...byText.entries()].sort(
  ([, a], [, b]) => b.length - a.length || a[0].localeCompare(b[0], "en"),
);

const lines = [
  "# Licencias de terceros",
  "",
  "MikaLog se reparte con el software de esta lista. Cada uno conserva su",
  "licencia y su copyright. Este archivo lo genera `npm run notices`; no se",
  "edita a mano.",
  "",
  `## Paquetes (${packages.length})`,
  "",
  ...packages.map(
    (item) =>
      `- ${item.name} ${item.version} (${item.kind}): ${item.license}${item.url ? `. ${item.url}` : ""}`,
  ),
  "",
  "## Textos de las licencias",
  "",
  ...texts.flatMap(([text, users], index) => [
    `### Texto ${index + 1}`,
    "",
    `Lo usan: ${[...new Set(users)].join(", ")}.`,
    "",
    // Sangrado en vez de vallas: algún texto contiene sus propias vallas.
    ...text.split("\n").map((line) => (line === "" ? "" : `    ${line}`)),
    "",
  ]),
];

writeFileSync(OUTPUT, `${lines.join("\n").trimEnd()}\n`);
console.log(
  `THIRD-PARTY-NOTICES.md: ${packages.length} paquetes, ${texts.length} textos de licencia.`,
);

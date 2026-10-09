# MikaLog (repositorio Player-Tracker-App)

App de escritorio (Tauri 2 + React + TypeScript + SQLite) para que un jugador de Valorant se registre cada día.

- Concepto: [docs/IDEA.md](docs/IDEA.md)
- Plan de desarrollo, decisiones cerradas y fases: [docs/PLAN.md](docs/PLAN.md). Síguelo fase a fase y para al final de cada una para que el usuario la revise.
- Diseño: antes de cualquier trabajo visual, carga la skill `typeui-glassmorphism` y aplica [docs/DESIGN.md](docs/DESIGN.md).
- Habla con el usuario en español.

## Cómo está organizado

- `src/domain/`: lógica pura (campos, fechas, duraciones, importador de la hoja, formato de exportación). Todo con pruebas.
- `src/data/`: SQLite detrás de la interfaz `SqlDriver`, migraciones, repositorio e importación/exportación.
- `src/app/`: estado de la app (`storeCore.ts`), la interfaz `Platform`, que aísla lo que depende de Tauri, y las ediciones (`edition.ts`: `base` y `saiz`, elegidas al compilar; llegan en `services.edition`).
- `src/platform/`: implementación de `Platform` con Tauri y el arranque (carpeta de datos).
- `src/views/` y `src/components/`: pantallas y componentes.
- `server/`: servidor de sincronización con Riot (Cloudflare Workers, sin dependencias). Su contrato está en `server/README.md` y el formato de cada partida en `src/domain/riotMatches.ts`.
- `src/test/`: SQLite en memoria (`node:sqlite`) y servicios de prueba; las pruebas de interfaz usan la app entera sobre ellos.

Antes de dar algo por hecho: `npm run lint`, `npm run format:check`, `npm run typecheck` y `npm test`.

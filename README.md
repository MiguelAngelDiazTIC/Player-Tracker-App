# Player-Tracker-App

App de escritorio, al estilo de Notion u Obsidian, para que un jugador de Valorant se trackee a sí mismo: partidas, hábitos, sueño, K/D, ACS y cómo se ha sentido cada día.

- [La idea](docs/IDEA.md): concepto, vistas, insights, sincronización de estadísticas y estilo visual.
- [El plan](docs/PLAN.md): tecnologías, modelo de datos y fases de desarrollo.
- [El diseño](docs/DESIGN.md): tokens, componentes y reglas de accesibilidad.

## Desarrollo

Hecha con Tauri 2, React, TypeScript, Vite y Tailwind CSS. En Windows hacen falta Node 24, Rust (rustup) y las Build Tools de C++ de Visual Studio.

```powershell
npm install
npm run tauri dev
```

| Comando               | Qué hace                                                   |
| --------------------- | ---------------------------------------------------------- |
| `npm run tauri dev`   | Abre la app en modo desarrollo                             |
| `npm run tauri build` | Genera el instalador en `src-tauri/target/release/bundle/` |
| `npm run lint`        | ESLint                                                     |
| `npm run format`      | Formatea con Prettier (`format:check` solo comprueba)      |
| `npm run typecheck`   | Comprueba los tipos con TypeScript                         |
| `npm test`            | Pruebas con Vitest (`test:watch` las deja en marcha)       |

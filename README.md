# MikaLog

App de escritorio, al estilo de Notion u Obsidian, para que un jugador de Valorant se trackee a sí mismo: partidas, hábitos, sueño, K/D, ACS y cómo se ha sentido cada día.

- [La idea](docs/IDEA.md): concepto, vistas, insights, sincronización de estadísticas y estilo visual.
- [El plan](docs/PLAN.md): tecnologías, modelo de datos y fases de desarrollo.
- [El diseño](docs/DESIGN.md): tokens, componentes y reglas de accesibilidad.

## Instalar

1. Descarga `MikaLog_x.y.z_x64-setup.exe` de la [última versión](https://github.com/MiguelAngelDiazTIC/Player-Tracker-App/releases/latest).
2. Ábrelo. El instalador no está firmado, así que Windows SmartScreen avisa la primera vez («Windows protegió su PC»): pulsa **Más información** y luego **Ejecutar de todas formas**.
3. No pide permisos de administrador: se instala solo para tu usuario, con acceso en el menú Inicio.
4. Al abrir la app por primera vez eliges la carpeta de datos (por defecto `Documentos\MikaLog`) y un tutorial te enseña cómo empezar.

Para **actualizar**, instala la versión nueva encima: tus datos se conservan. **Desinstalar** tampoco los borra, porque la carpeta de datos está fuera de la carpeta de la app.

La app no se conecta a internet: todo se queda en tu ordenador.

## Licencia y avisos

Copyright (C) 2026 Miguel Ángel Díaz Gutiérrez (MikaEl).

- **Licencia**: software libre bajo la [GPL-3.0 o posterior](LICENSE). Puedes usarlo, estudiarlo, modificarlo y compartirlo; si repartes una versión modificada, debe tener la misma licencia. Sin garantía de ningún tipo.
- **Créditos**: toda copia o versión modificada debe conservar en su pantalla «Acerca de» la atribución al autor original y el enlace a este repositorio. El nombre «MikaLog» y su logo no entran en la licencia. Los detalles están en [NOTICE.md](NOTICE.md).
- **Privacidad**: MikaLog no recoge ni envía ningún dato. Todo lo que apuntas se queda en la carpeta de datos de tu ordenador.
- **Riot Games**: MikaLog no está avalado por Riot Games ni refleja sus opiniones. Valorant y Riot Games son marcas de Riot Games, Inc.
- **Software de terceros**: sus licencias están en [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- **Contacto**: miguelangeldiaztic@gmail.com o las [incidencias](https://github.com/MiguelAngelDiazTIC/Player-Tracker-App/issues).

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

### Publicar una versión

1. Sube el número en `package.json` (el instalador lo lee de ahí) y en `src-tauri/Cargo.toml`.
2. Crea y sube una etiqueta con ese número: `git tag v1.0.0` y `git push origin v1.0.0`.
3. El workflow «Publicar versión» pasa las pruebas, compila el instalador y crea la Release con el `.exe`.

Las imágenes del instalador salen del icono con `pwsh scripts/installer-images.ps1`.

Al añadir, quitar o actualizar una dependencia, lanza `npm run notices` y sube el `THIRD-PARTY-NOTICES.md` que genera. El CI falla si no está al día o si entra una licencia incompatible con la GPL-3.0.

### Datos de ejemplo

Para ver la app llena sin tocar datos reales:

```powershell
npm run demo:data
npm run demo
```

`demo:data` genera `.demo/player-tracker-demo.json` con unas 11 semanas de datos inventados que acaban hoy. `demo` abre la app con una identidad aparte (`com.playertracker.demo`), así que su carpeta de datos no se mezcla con la de la app normal. La primera vez, elige una carpeta (por ejemplo `.demo/datos`) y carga el archivo desde Ajustes > Importar JSON.

# MikaLog Saiz Edition: cómo ponerla en marcha

Guía para Saiz. Describe la app con la sincronización de la fase 7.6 ya hecha. Tardas unos 10 minutos la primera vez; después, un clic al día.

## 1. Instalar

1. Abre el instalador que te paso: `MikaLog Saiz Edition_…_x64-setup.exe`.
2. Si Windows dice «Windows protegió tu PC», pulsa **Más información** y luego **Ejecutar de todas formas**. Sale porque el instalador no está firmado.
3. Al abrir la app por primera vez, acepta la carpeta que te propone (`Documentos/MikaLog Saiz Edition`). Ahí se guarda todo.

## 2. Sacar tu clave de HenrikDev (gratis, una sola vez)

HenrikDev es un servicio que lee tu historial de partidas de VALORANT. La app lo usa hasta que Riot apruebe su conexión oficial.

1. Entra en el Discord de HenrikDev: <https://discord.com/invite/X3GaVkX2YN>.
2. Completa la verificación que te pide el servidor.
3. Ve al canal **#get-a-key**, elige **VALORANT** en el desplegable y después la clave **Basic**.
4. Te da una clave que empieza por `HDEV-`. Cópiala. Es tuya: no la compartas.

## 3. Conectar la app

1. En MikaLog, ve a **Ajustes > Cuenta de Riot**.
2. En **Fuente**, deja **HenrikDev (no oficial)**.
3. Escribe tu Riot ID completo, con el `#` y el tag (por ejemplo `Saiz#EUW`).
4. Elige la región de tu cuenta (en España, **Europa**).
5. Pega la clave y pulsa **Probar conexión**. Si sale que está conectada, ya está.

## 4. Usarla cada día

1. En la **Tabla**, abre el día (o créalo con el botón de añadir día).
2. Pulsa **Sincronizar**. Se rellenan solas las rankeds, el K/D, el ACS, los agentes y los mapas de ese día, y cada partida aparece en **Rankeds**.
3. El resto (sueño, hábitos, DMs, Kovaaks, 10mans/scrims y lo que sientes del día) lo apuntas tú como siempre.
4. Si te saltas algún día, en **Rankeds** pulsa **Sincronizar los últimos 7 días**.

Puedes sincronizar las veces que quieras: no duplica partidas. Si corriges algo a mano, la sincronización no lo pisa.

## 5. Si algo falla

- **«Clave no válida»**: vuelve a copiar la clave desde Discord y pégala otra vez.
- **«Demasiadas peticiones»**: espera un minuto y vuelve a pulsar. La clave gratuita tiene un límite por minuto.
- **Falta la última partida**: HenrikDev tarda unos minutos en tenerla. Sincroniza otra vez un poco después.
- **Has cambiado de Riot ID**: cámbialo en Ajustes > Cuenta de Riot.

## 6. Privacidad

Tu Riot ID y tu clave solo salen de tu ordenador cuando pulsas Sincronizar o Probar conexión, y solo hacia HenrikDev. La clave se guarda en el almacén de credenciales de Windows. Todo lo demás se queda en tu carpeta de datos.

## 7. Cuando Riot apruebe la conexión oficial

Te llegará una versión nueva. En **Ajustes > Cuenta de Riot** cambiarás la fuente a **Riot (oficial)** y pulsarás **Conectar con Riot**, que abre la página de inicio de sesión de Riot. Ya no hará falta la clave de HenrikDev, y las partidas que ya tienes no se duplican.

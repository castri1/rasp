# rasp · Tu día, en calma

Aplicación para una pantalla táctil horizontal de 7 pulgadas, con agenda, Pomodoro y ajustes integrados en un lienzo de 800 × 480. Incluye un entorno externo para probar escenarios de calendario a tamaño original o ampliado.

**Funcional hoy:** temporizador real, preferencias de colores persistentes, cuatro paletas completas, conexión de solo lectura con Google Calendar y conexión local con Atajos de macOS. **Datos de ejemplo:** el entorno de demostración y la apertura de Google Meet. El enlace Raspberry–Mac sigue pendiente.

## Ejecutar

```sh
npm install
npm run dev -- --port 5173
```

- http://127.0.0.1:5173/ — aplicación dentro del entorno de demostración.
- http://127.0.0.1:5173/app — solo la aplicación, sin controles de demostración. A 800 × 480 ocupa toda la pantalla; en otras resoluciones conserva la proporción.

Para ejecutar la compilación de producción, con la conexión local al Mac:

```sh
npm run build
npm start
```

Abre http://127.0.0.1:4173/app. Ambos servidores escuchan únicamente en este computador.

## Instalar y actualizar desde GitHub

La Raspberry descarga una copia compilada y lista para ejecutar. No necesita
compilar React ni depender de la IP del Mac.

Primera instalación en la Raspberry:

```sh
cd "$HOME"
git clone https://github.com/castri1/rasp.git
cd rasp
bash scripts/install-pi.sh
sudo reboot
```

Para recibir cualquier actualización posterior:

```sh
cd "$HOME/rasp"
bash scripts/update-pi.sh
sudo reboot
```

La actualización conserva la conexión de calendario, colores, Pomodoro y demás
datos locales, almacenados fuera del repositorio en
`~/.local/share/rasp/.rasp` y en el perfil local de Chromium.

### Probar la interfaz desde una Raspberry Pi

Con el Mac y la Raspberry conectados a la misma red, ejecuta en el Mac:

```sh
npm run preview:pi
```

El comando compila la aplicación y muestra una dirección de red, por ejemplo
`http://192.168.1.20:4173/app`. Abre esa dirección en Chromium desde la Raspberry.
Esta vista permite probar la agenda, los escenarios, los colores, Ambiente y el
Pomodoro. Sirve únicamente los archivos públicos de la interfaz: las credenciales
de Alexa, Atajos y demás acciones privadas no se exponen por la red.

Si la página no abre, permite conexiones entrantes para Node en el firewall de
macOS y comprueba que ambos equipos estén en la misma red Wi-Fi. Mantén la terminal
abierta durante la prueba y pulsa `Control-C` para cerrar el servidor.

### Instalar la aplicación en la Raspberry Pi

La instalación definitiva ejecuta Rasp en la propia Raspberry. Requiere Raspberry
Pi OS de 64 bits con escritorio, Node.js 18 o posterior, Chromium, SSH habilitado
y el Mac y la Raspberry en la misma red. Desde este Mac ejecuta:

```sh
npm run deploy:pi -- usuario@raspberrypi.local
```

El despliegue compila en el Mac, copia solo los archivos necesarios y ejecuta el
instalador en la Raspberry. El instalador registra `rasp.service`, que sirve la
aplicación únicamente en `http://127.0.0.1:4173/app`, y añade Chromium al inicio
de la sesión gráfica en modo kiosco. En Raspberry Pi OS actual utiliza el archivo
de inicio de labwc; en versiones anteriores utiliza el inicio automático XDG.

Después del primer despliegue, reinicia la Raspberry para validar que el servidor
y la pantalla se recuperan sin intervención. Los ajustes de colores y Pomodoro se
guardan en el perfil local de Chromium; la futura credencial de Home Assistant se
guardará con permisos privados en `~/.local/share/rasp/.rasp`.

El método por red local queda disponible para desarrollo. Si el Mac no puede
entrar por SSH, deja `npm run preview:pi` activo y ejecuta esto en una terminal
de la Raspberry:

```sh
wget --output-document="$HOME/install-rasp.sh" http://IP-DEL-MAC:4173/downloads/install-rasp.sh
bash "$HOME/install-rasp.sh"
```

El instalador añade Node.js o Chromium desde los repositorios de Raspberry Pi OS
si hacen falta. Solicita `sudo` únicamente al instalar paquetes y registrar el
servicio del sistema.

```sh
npm test
```

## Ajustes y paletas

La navegación inferior **Agenda · Pomodoro · Ambiente · Ajustes** pertenece a la aplicación. En Ajustes encontrarás:

- **Paletas:** Azul noche, Bosque, Arcilla y Grafito. Cada preset cambia la combinación completa, incluidas superficies, reloj, botones, alertas, participantes y marco exterior.
- **Colores:** 37 campos en seis categorías, con selector, código HEX y restauración individual.
- **Calendario:** conexión de solo lectura con Google Workspace y estado de sincronización.
- **Mi Mac:** estado del atajo, instrucciones y activación opcional de No molestar.

Los cambios de color se aplican inmediatamente y se guardan en localStorage (`rasp.colors.v1`). Deshacer conserva hasta 50 cambios de la sesión; el botón de restauración recupera Azul noche. El reinicio de los escenarios de demostración no borra preferencias ni detiene el Pomodoro. La vista previa y la aplicación comparten preferencias en pestañas del mismo origen. No se sincronizan entre computadores, navegadores ni direcciones de servidor distintas.

El editor revisa el contraste del reloj, texto principal y botones. Su superficie usa la paleta elegida mientras resulte legible; si se pierde el contraste, conserva una superficie de recuperación legible para poder restaurar colores.

## Pomodoro

Selecciona enfoque o descanso, elige entre 1 y 120 minutos y pulsa Comenzar. Puedes usar las duraciones sugeridas, escribir un valor o ajustarlo con los botones. Pausar, continuar y reiniciar son acciones reales. La duración se bloquea durante una sesión activa o pausada; reiniciar permite cambiarla.

El temporizador utiliza una hora de finalización real, independiente del reloj de demostración. Se conserva al navegar y recargar, y corrige el tiempo transcurrido tras una pestaña suspendida o el reposo del computador. No inicia otra sesión automáticamente. Al terminar, muestra el estado completado y propone preparar un descanso; en otras pantallas aparece un aviso que permite volver al Pomodoro. Las alertas de reuniones siguen visibles desde Pomodoro y Ajustes.

Se guarda en localStorage (`rasp.pomodoro.v1`). Si el almacenamiento no está disponible, la interfaz lo indica. Mientras la página está cerrada no emite avisos; recupera el estado al volver a abrirla. No incluye todavía alarmas de audio ni notificaciones del sistema.

## Google Calendar empresarial

En la aplicación instalada, **Ajustes → Calendario** permite guardar un cliente
OAuth de escritorio y autorizar una cuenta Google Workspace. Rasp solicita solo
el alcance `calendar.readonly`, consulta el calendario principal al iniciar y
cada cinco minutos, extrae los enlaces oficiales de Google Meet y conserva una
copia privada de la agenda del día para usarla si falla Internet.

El entorno de demostración continúa usando reuniones ficticias. La ruta
`/app` usa la fecha y la hora reales y, una vez autorizada, reemplaza los datos
ficticios por la agenda real. Antes de conectar muestra un estado explícito y
un acceso directo a Ajustes.

Las credenciales y el token se guardan con permisos privados en
`~/.local/share/rasp/.rasp/google-calendar.json`; la caché queda en el mismo
directorio. No se incluyen en la compilación ni se devuelven a la interfaz.
Consulta [la guía de Google Workspace](docs/GOOGLE_CALENDAR.md) para crear el
cliente OAuth interno y completar la autorización.

## No molestar en este Mac

La conexión ejecuta un atajo local a través de la CLI oficial de Apple. El proyecto incluye el servicio que lo llama tanto en desarrollo como en producción. Requiere configurar el atajo una vez en el Mac:

1. Abre **Atajos** y crea un atajo llamado exactamente **Rasp Focus**.
2. Añade **Obtener fechas de la entrada** (Get Dates from Input) y usa **Entrada del atajo** (Shortcut Input) como entrada. Rasp le enviará un archivo de texto con una fecha ISO 8601, incluida su zona horaria UTC.
3. Añade **Establecer modo de concentración** (Set Focus). Configura **Activar No molestar hasta Hora** y selecciona la fecha obtenida en el paso anterior. No elijas «hasta desactivar» ni «alternar».
4. Guarda. En Rasp, abre **Ajustes → Mi Mac**, pulsa comprobar y activa **Activar al iniciar un Pomodoro**.
5. Inicia una sesión de enfoque. macOS puede pedir permisos la primera vez; concédelos en Atajos si aparecen y vuelve a intentarlo desde Rasp.

Los nombres de las acciones pueden variar con el idioma de macOS. El atajo debe consumir su entrada sin solicitar datos ni mostrar diálogos durante la ejecución.

Cuando la opción está activada, comenzar o continuar una sesión de enfoque envía la hora de finalización. Los descansos no ejecutan el atajo. Pausar o reiniciar **no desactiva** el modo del sistema: vence a la hora prevista por el último inicio. Puedes apagarlo antes desde el Centro de control. Desactivar la opción de Rasp afecta a las próximas solicitudes, no al modo que ya esté activo.

Rasp confirma que el atajo terminó de ejecutarse; no puede comprobar la configuración interna del atajo ni leer el modo de concentración efectivo de macOS. Si el atajo falta, falla o no confirma su ejecución a tiempo, muestra el problema y el temporizador continúa.

Esta conexión solo funciona cuando el servidor de Rasp se ejecuta en macOS. No se ha configurado ni activado No molestar automáticamente durante el desarrollo. El atajo aún debe crearse en este Mac. El emparejamiento y transporte desde una Raspberry por la red local se implementarán en una etapa posterior.

Referencia de Apple: [Ejecutar atajos desde la línea de comandos](https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac).

## Arquitectura

- `src/calendar.ts`: eventos de ejemplo y reglas de agenda y alertas.
- `src/useGoogleCalendar.ts`, `src/GoogleCalendarSettings.tsx`: estado, sincronización y configuración de Google Calendar.
- `src/App.tsx`: aplicación, agenda, navegación y entorno de demostración.
- `src/SettingsScreen.tsx`, `src/ColorEditor.tsx`: ajustes integrados.
- `src/theme.ts`, `src/presets.ts`, `src/useTheme.ts`: colores, presets, validación, persistencia y deshacer.
- `src/pomodoro.ts`, `src/usePomodoro.ts`, `src/PomodoroScreen.tsx`: estado del temporizador, persistencia y pantalla.
- `src/macFocus.ts`: cliente de la conexión local con macOS.
- `server/macBridge.mjs`: estado del atajo y ejecución con hora de vencimiento acotada. Solo acepta el atajo fijo, solicitudes del mismo origen y conexiones por loopback. No acepta comandos arbitrarios.
- `server/googleCalendar.mjs`: OAuth local con PKCE, consulta de reuniones, extracción segura de Meet y caché privada de la agenda.
- `server/index.mjs`: servidor de producción para la aplicación y el servicio local.
- `src/*.test.ts`, `server/macBridge.test.mjs`: pruebas de alertas, colores, reloj, persistencia y conexión con Atajos. Las pruebas del servicio usan un ejecutor simulado y no cambian el modo del Mac.

La fuente Manrope se sirve localmente y los iconos son de Phosphor. No se requieren credenciales de Google para esta etapa.

## Ambiente y Alexa

El módulo **Ambiente** permite preparar y ejecutar cuatro escenas mediante las rutinas de tu cuenta de Alexa: Enfoque, Descanso, Reunión y Fin del día. En **Ajustes → Alexa** están la guía, la conexión con Home Assistant, el selector de dispositivo y las frases de las rutinas. Enfoque y Descanso pueden activarse al comenzar una nueva sesión de Pomodoro, de forma opcional.

La conexión real requiere Home Assistant con la integración **Alexa Devices**, un dispositivo Alexa compatible y un token de acceso. Todavía no se ha instalado ni vinculado Home Assistant en este proyecto. Las pruebas del servicio usan respuestas simuladas y no accionan bombillos.

Consulta [la guía de conexión](docs/ALEXA.md) para los pasos de instalación, autenticación, rutinas, almacenamiento y límites actuales.

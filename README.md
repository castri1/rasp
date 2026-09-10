# rasp · Tu día, en calma

Aplicación para una pantalla táctil horizontal de 7 pulgadas, con agenda, Pomodoro, control del hogar y un fondo nocturno animado integrados en un lienzo de 800 × 480. Incluye un entorno externo para probar escenarios de calendario a tamaño original o ampliado.

**Funcional hoy:** agenda diaria, semanal y mensual, pendientes de las listas elegidas en Recordatorios, temporizador real, preferencias de colores persistentes, cuatro paletas completas, fondo nocturno configurable, conexión de solo lectura con Google Calendar y un acompañante seguro para abrir Google Meet en el Mac. **Datos de ejemplo:** el entorno de demostración fuera de `/app`.

## Ejecutar

```sh
npm install
npm run dev -- --port 5173
```

- http://127.0.0.1:5173/ — aplicación dentro del entorno de demostración.
- http://127.0.0.1:5173/app — solo la aplicación, sin controles de demostración. A 800 × 480 ocupa toda la pantalla; en otras resoluciones conserva la proporción.

Para ejecutar la compilación de producción:

```sh
npm run build
npm start
```

Abre http://127.0.0.1:4173/app. El servidor escucha únicamente en este computador.

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
guardan en el perfil local de Chromium; las credenciales de Home Assistant,
Google y el Mac se guardan con permisos privados en `~/.local/share/rasp/.rasp`.

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

La navegación inferior **Agenda · Tareas · Pomodoro · Casa · Escenas · Noche · Ajustes** pertenece a la aplicación. En Ajustes encontrarás:

- **Paletas:** Azul noche, Bosque, Arcilla y Grafito. Cada preset cambia la combinación completa, incluidas superficies, reloj, botones, alertas, participantes y marco exterior.
- **Colores:** 37 campos en seis categorías, con selector, código HEX y restauración individual.
- **Noche:** horario, anticipación de reuniones, atmósfera, movimiento, densidad, brillo y calidad del fondo animado.
- **Calendario:** conexión de solo lectura con Google Workspace y estado de sincronización.
- **Mi Mac:** estado del atajo, instrucciones y activación opcional de No molestar.

Los cambios de color se aplican inmediatamente y se guardan en localStorage (`rasp.colors.v1`). Deshacer conserva hasta 50 cambios de la sesión; el botón de restauración recupera Azul noche. El reinicio de los escenarios de demostración no borra preferencias ni detiene el Pomodoro. La vista previa y la aplicación comparten preferencias en pestañas del mismo origen. No se sincronizan entre computadores, navegadores ni direcciones de servidor distintas.

El editor revisa el contraste del reloj, texto principal y botones. Su superficie usa la paleta elegida mientras resulte legible; si se pierde el contraste, conserva una superficie de recuperación legible para poder restaurar colores.

## Fondo nocturno

Entre las 21:00 y las 06:30, Rasp cambia automáticamente la agenda por una composición generativa de partículas, corrientes líquidas y filamentos tenues. La agenda vuelve 30 minutos antes de una reunión y permanece visible durante la reunión. Estos tres valores pueden modificarse en **Ajustes → Noche**.

El botón **Noche** permite mostrar el fondo en cualquier momento; tocar la animación vuelve a la agenda y suspende el inicio automático durante 30 minutos. Hay tres atmósferas y tres niveles de rendimiento. **Equilibrado** es el valor recomendado para Raspberry Pi 3 B: limita el render a unos 30 cuadros por segundo, adapta la cantidad de partículas según el tiempo de dibujo, pausa el trabajo cuando la página no está visible y evita acumular recursos entre vistas.

La configuración se guarda en el perfil local de Chromium (`rasp.wallpaper.v1`). Si Google Calendar no está disponible o hay un Pomodoro en curso, el fondo no se inicia automáticamente. El escenario **Noche** del prototipo permite revisarlo sin cambiar el reloj del sistema.

## Agenda completa

En la pantalla principal, **Ver agenda** abre el calendario completo. La vista **Día** muestra todos los encuentros de una fecha; **Semana** permite comparar los siete días y abrir cada reunión; **Mes** resume la ocupación con indicadores y abre cualquier día con un toque. Los botones laterales recorren el periodo y **Hoy** vuelve a la fecha actual.

Las vistas amplias consultan seis semanas de Google Calendar y guardan hasta ocho intervalos recientes en la caché privada. La carga diaria de alertas continúa separada, por lo que navegar hacia otra semana o mes no cambia la reunión protagonista de la pantalla principal.

## Pomodoro

Selecciona enfoque o descanso, elige entre 1 y 120 minutos y pulsa Comenzar. Puedes usar las duraciones sugeridas, escribir un valor o ajustarlo con los botones. Pausar, continuar y reiniciar son acciones reales. La duración se bloquea durante una sesión activa o pausada; reiniciar permite cambiarla.

El temporizador utiliza una hora de finalización real, independiente del reloj de demostración. Se conserva al navegar y recargar, y corrige el tiempo transcurrido tras una pestaña suspendida o el reposo del computador. No inicia otra sesión automáticamente. Al terminar, muestra el estado completado y propone preparar un descanso; en otras pantallas aparece un aviso que permite volver al Pomodoro. Las alertas de reuniones siguen visibles desde Pomodoro y Ajustes.

Se guarda en localStorage (`rasp.pomodoro.v1`). Si el almacenamiento no está disponible, la interfaz lo indica. Mientras la página está cerrada no emite avisos; recupera el estado al volver a abrirla. No incluye todavía alarmas de audio ni notificaciones del sistema.

## Google Calendar empresarial

En la aplicación instalada, **Ajustes → Calendario** permite guardar un cliente
OAuth de escritorio y autorizar una cuenta Google Workspace. Rasp solicita solo
el alcance `calendar.readonly`, consulta el calendario principal al iniciar y
cada cinco minutos, extrae los enlaces oficiales de Google Meet y conserva
copias privadas de la agenda diaria y de los periodos consultados para usarlas
si falla Internet.

El entorno de demostración continúa usando reuniones ficticias. La ruta
`/app` usa la fecha y la hora reales y, una vez autorizada, reemplaza los datos
ficticios por la agenda real. Antes de conectar muestra un estado explícito y
un acceso directo a Ajustes.

Las credenciales y el token se guardan con permisos privados en
`~/.local/share/rasp/.rasp/google-calendar.json`; la caché queda en el mismo
directorio. No se incluyen en la compilación ni se devuelven a la interfaz.
Consulta [la guía de Google Workspace](docs/GOOGLE_CALENDAR.md) para crear el
cliente OAuth interno y completar la autorización.

Para evitar escribir el ID y el secreto en la pantalla táctil, descarga en el
Mac el JSON del cliente OAuth de escritorio y envíalo por SCP. El importador
incluido valida el tipo de cliente, guarda las credenciales con permisos
privados y nunca imprime el secreto. El archivo JSON no debe añadirse a GitHub.

## Google Meet y No molestar en este Mac

Instala una vez el acompañante y el túnel cifrado desde este Mac:

```sh
npm run install:mac
```

La Raspberry podrá abrir únicamente enlaces HTTPS de `meet.google.com` en el navegador predeterminado de este Mac. El acompañante sólo escucha en loopback, usa una clave privada compartida y arranca automáticamente con la sesión del Mac. Consulta [la guía del acompañante](docs/MAC_COMPANION.md).

Para activar No molestar con Pomodoro, configura además este atajo una vez en el Mac:

1. Abre **Atajos** y crea un atajo llamado exactamente **Rasp Focus**.
2. Añade **Obtener fechas de la entrada** (Get Dates from Input) y usa **Entrada del atajo** (Shortcut Input) como entrada. Rasp le enviará un archivo de texto con una fecha ISO 8601, incluida su zona horaria UTC.
3. Añade **Establecer modo de concentración** (Set Focus). Configura **Activar No molestar hasta Hora** y selecciona la fecha obtenida en el paso anterior. No elijas «hasta desactivar» ni «alternar».
4. Guarda. En Rasp, abre **Ajustes → Mi Mac**, pulsa comprobar y activa **Activar al iniciar un Pomodoro**.
5. Inicia una sesión de enfoque. macOS puede pedir permisos la primera vez; concédelos en Atajos si aparecen y vuelve a intentarlo desde Rasp.

Los nombres de las acciones pueden variar con el idioma de macOS. El atajo debe consumir su entrada sin solicitar datos ni mostrar diálogos durante la ejecución.

Cuando la opción está activada, comenzar o continuar una sesión de enfoque envía la hora de finalización. Los descansos no ejecutan el atajo. Rasp usa un segundo atajo, llamado exactamente **Rasp Focus Off**, para apagar No molestar al pausar, reiniciar o terminar el tiempo de enfoque. Este atajo sólo necesita la acción **Establecer modo de concentración → Desactivar No molestar**.

Rasp confirma que el atajo terminó de ejecutarse; no puede comprobar la configuración interna del atajo ni leer el modo de concentración efectivo de macOS. Si el atajo falta, falla o no confirma su ejecución a tiempo, muestra el problema y el temporizador continúa.

Google Meet funciona aunque los atajos aún no existan. Para fijar la cuenta que debe abrir Meet, reinstala el acompañante con `RASP_MEET_ACCOUNT='correo@empresa.com' npm run install:mac`. El correo se guarda sólo en la configuración privada del Mac y se añade como selector `authuser` a los enlaces validados de Meet.

## Tareas de Recordatorios

La pantalla **Tareas** consulta la app Recordatorios de este Mac mediante el acompañante local. Pulsa **Listas**, elige sólo las listas que quieres mostrar y toca el círculo de una tarea para completarla también en el Mac. La selección queda guardada en el perfil local de Chromium y los pendientes se refrescan cada cinco minutos o al volver a la pantalla.

El instalador del acompañante compila un pequeño puente nativo con EventKit. macOS puede pedir acceso a Recordatorios la primera vez; concédelo al proceso de Rasp. Los nombres y contenidos de tus listas no se copian a GitHub ni se guardan en la Raspberry, salvo la selección local de identificadores y los datos que permanecen visibles mientras la aplicación está abierta.

Referencia de Apple: [Ejecutar atajos desde la línea de comandos](https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac).

## Arquitectura

- `src/calendar.ts`: eventos de ejemplo y reglas de agenda y alertas.
- `src/useGoogleCalendar.ts`, `src/GoogleCalendarSettings.tsx`: estado, sincronización y configuración de Google Calendar.
- `src/App.tsx`: aplicación, agenda, navegación y entorno de demostración.
- `src/SettingsScreen.tsx`, `src/ColorEditor.tsx`: ajustes integrados.
- `src/theme.ts`, `src/presets.ts`, `src/useTheme.ts`: colores, presets, validación, persistencia y deshacer.
- `src/wallpaper.ts`, `src/useWallpaper.ts`, `src/NightWallpaper.tsx`: horario nocturno, configuración persistente y render generativo adaptativo.
- `src/pomodoro.ts`, `src/usePomodoro.ts`, `src/PomodoroScreen.tsx`: estado del temporizador, persistencia y pantalla.
- `src/useReminders.ts`, `src/TasksScreen.tsx`: selección de listas, sincronización y pantalla de pendientes.
- `src/macFocus.ts`: cliente del acompañante de macOS.
- `server/macBridge.mjs`, `server/macCompanion.mjs`, `server/reminders.mjs`: puente autenticado, apertura validada de Meet, control de No molestar y acceso limitado a Recordatorios.
- `server/googleCalendar.mjs`: OAuth local con PKCE, consulta de reuniones, extracción segura de Meet y caché privada de la agenda.
- `server/index.mjs`: servidor de producción para la aplicación y el servicio local.
- `src/*.test.ts`, `server/macBridge.test.mjs`: pruebas de alertas, colores, reloj, persistencia y conexión con Atajos. Las pruebas del servicio usan un ejecutor simulado y no cambian el modo del Mac.

La fuente Manrope se sirve localmente y los iconos son de Phosphor. No se requieren credenciales de Google para esta etapa.

## Ambiente y Alexa

El módulo **Escenas** permite crear, editar y borrar hasta doce escenas mediante las rutinas o comandos de tu cuenta de Alexa. En **Ajustes → Alexa** están la conexión con Home Assistant, el selector de dispositivo y la configuración completa de cada escena. Cualquier escena puede asignarse al inicio de Enfoque o Descanso.

La instalación actual ya está vinculada con Home Assistant y **Alexa Devices**. Rasp pulsa directamente una rutina cuando el nombre coincide; para otros textos usa `alexa_devices.send_text_command` sobre el Echo seleccionado.

La pantalla **Casa** usa el plano real del apartamento. Al tocar un ambiente se ven sus dispositivos y se pueden encender por separado o como grupo. Desde **Editar** se pueden renombrar los ambientes dibujados, añadir hasta seis ambientes adicionales, cambiar el nombre visible de cada dispositivo y asociarlo a otro ambiente. Los bombillos e interruptores conectados a Home Assistant aparecen en el editor aunque todavía no tengan un área asignada. Estos nombres se guardan sólo en Rasp y no modifican Alexa ni Home Assistant.

La organización se persiste de forma privada en `.rasp/home.json`. Los ambientes adicionales aparecen en el selector de Casa sin alterar la geometría; los diez espacios principales conservan su lugar en el plano.

Consulta [la guía de conexión](docs/ALEXA.md) para los pasos de instalación, autenticación, rutinas, almacenamiento y límites actuales.

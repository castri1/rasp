# Escenas · conectar Rasp con tu Alexa

El módulo está en **Escenas** y su configuración en **Ajustes → Alexa**. Los bombillos, grupos y rutinas se gestionan en Alexa. Rasp ejecuta la rutina elegida por medio de Home Assistant; también admite comandos de texto.

## Estado de esta instalación

El módulo, Home Assistant Container y Alexa Devices están instalados en la Raspberry. Las credenciales privadas permanecen en el equipo y fuera del repositorio.

## 1. Instalar Home Assistant sin reemplazar Rasp

La Raspberry actual utiliza Debian 13 de 64 bits (`aarch64`). Esa arquitectura
sigue soportada por Home Assistant y permite ejecutar **Home Assistant
Container** junto a Rasp. No se debe instalar Home Assistant OS en esta misma
tarjeta: sustituiría Debian, Chromium y la aplicación de la pantalla.

La Pi 3 B tiene solo 1 GB de RAM. La instalación es válida, pero debe probarse
con la pantalla real y vigilar que Chromium continúe fluido. Si aparece uso
frecuente de swap o lentitud, el directorio de configuración se puede migrar a
otro equipo sin cambiar el módulo Rasp.

El repositorio incluye un instalador idempotente que instala Docker desde
Debian y crea el contenedor siguiendo la configuración oficial:

```bash
cd "$HOME/rasp"
sudo bash scripts/install-home-assistant.sh
```

La interfaz queda en `http://pi.local:8123` y la configuración persiste en
`~/.local/share/homeassistant`. Docker no se concede al usuario sin privilegios;
las tareas de administración siguen requiriendo `sudo`.

- [Instalación general](https://www.home-assistant.io/installation/)
- [Home Assistant Container en Raspberry Pi](https://www.home-assistant.io/installation/raspberrypi-other/)
- [Instalación en macOS mediante una máquina virtual](https://www.home-assistant.io/installation/macos/)

## 2. Vincular Alexa en Home Assistant

1. Entra a Home Assistant y completa su configuración inicial.
2. Ve a **Ajustes → Dispositivos y servicios → Añadir integración**.
3. Busca **Alexa Devices**. Esta es la integración que controla dispositivos Alexa; no es la integración para exponer dispositivos de Home Assistant a Alexa.
4. Inicia sesión con tu cuenta de Amazon allí. La integración requiere autenticación en dos pasos mediante una aplicación autenticadora, configurada como método preferido.
5. Comprueba que aparezca el Echo que quieres usar.

[Documentación de Alexa Devices](https://www.home-assistant.io/integrations/alexa_devices/).

## 3. Conectar Rasp

1. Crea un **token de acceso de larga duración** en tu perfil de Home Assistant → Seguridad. Usa un usuario que tenga acceso a los dispositivos que quieras controlar.
2. En Rasp abre **Ajustes → Alexa → Conectar**.
3. Introduce la dirección completa de Home Assistant, por ejemplo `http://homeassistant.local:8123` o una dirección HTTPS, y pega el token.
4. Pulsa **Guardar y comprobar**. La comprobación consulta los servicios y dispositivos de Alexa sin ejecutar ninguna rutina.
5. Selecciona tu Echo y vuelve a pulsar **Guardar y comprobar**.

La contraseña de Amazon se introduce en Home Assistant, no en Rasp. El token de Home Assistant se guarda en `.rasp/alexa.json`, con permisos de lectura y escritura para su propietario. Esta carpeta está excluida del repositorio y del servidor web de desarrollo. El token no vuelve en las respuestas de la API ni se guarda en localStorage.

Para sustituir el token, introduce el nuevo y guarda. Si cambias la dirección a otro servidor, Rasp exige su token para evitar enviar la credencial anterior al nuevo destino. HTTP solo se admite para direcciones locales; para otros destinos, utiliza HTTPS. Las redirecciones no se siguen.

## 4. Crear y editar escenas

En la app de Alexa, crea o usa rutinas con una frase de activación que puedas pronunciar, y asigna ahí las acciones sobre tus bombillos. Prueba la frase por voz en el Echo elegido.

En **Ajustes → Alexa → Escenas** puedes crear hasta 12 escenas desde la pantalla táctil. Cada una permite editar nombre, descripción, icono y la rutina o comando. **Nueva** añade una escena y **Eliminar** la retira cuando guardas los cambios.

Rasp propone las rutinas descubiertas en Home Assistant. Cuando el texto coincide con una de ellas, pulsa directamente su entidad `button`; esto evita depender de la interpretación de una frase. Si escribes otra orden, usa `alexa_devices.send_text_command`, que Alexa procesa como una petición hablada.

[Acción Send text command](https://www.home-assistant.io/actions/alexa_devices.send_text_command/).

## 5. Ejecutar y automatizar

- Toca una escena en **Escenas** para enviarla. Una escena sin asignar lleva a su configuración.
- Cualquier escena puede asociarse al inicio de un Pomodoro o de un descanso. Viene desactivado.
- Pausar, continuar, reiniciar, recargar o terminar un temporizador no ejecuta otra escena automáticamente. Al terminar un Pomodoro, el descanso se prepara y comienza con una acción explícita.
- Los escenarios de calendario no accionan luces automáticamente.
- Rasp informa que la orden fue enviada. No consulta ni afirma el estado físico de las luces, ni restaura automáticamente su brillo o color anterior.

Si hay un error de conexión, el Pomodoro continúa y se muestra el error. No se reintenta una orden automáticamente, para evitar ejecutar dos veces una rutina tras una respuesta incierta.

## Implementación

- `src/AmbienceScreen.tsx`: pantalla de escenas.
- `src/AlexaSettings.tsx`: guía, conexión, dispositivo y editor de escenas dinámicas.
- `src/alexa.ts` y `src/useAlexa.ts`: modelo y cliente.
- `server/alexaBridge.mjs`: configuración privada, comprobación de Home Assistant, descubrimiento de dispositivos de Alexa y ejecución de frases guardadas.
- `server/alexaBridge.test.mjs`: pruebas del conector con servicios simulados.

El conector funciona con `npm run dev` y con `npm run build` seguido de `npm start`. El servidor escucha en loopback. En la Raspberry, el navegador y el servidor de Rasp pueden ejecutarse en el mismo equipo y este último comunicarse con Home Assistant en la red local; no se expone una API de control sin autenticación a toda la red.

La lista de dispositivos se obtiene con una plantilla fija limitada a la integración Alexa Devices. No se aceptan plantillas, servicios, comandos del sistema ni órdenes arbitrarias desde el botón de ejecutar: solo el identificador de una escena cuya frase ya esté guardada. La API comprueba el origen de las peticiones y evita duplicados del mismo identificador durante la ejecución del proceso.

[API REST de Home Assistant](https://developers.home-assistant.io/docs/api/rest/).

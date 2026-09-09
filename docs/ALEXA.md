# Ambiente · conectar Rasp con tu Alexa

El módulo está en **Ambiente** y su configuración en **Ajustes → Alexa**. Los bombillos, grupos y rutinas se gestionan en Alexa. Rasp envía la frase de cada rutina a un dispositivo Alexa por medio de Home Assistant.

## Estado de esta instalación

El módulo y el conector están implementados. Home Assistant todavía no está instalado y no se ha vinculado ninguna cuenta de Amazon ni accionado una luz real. Las pruebas del conector emplean respuestas simuladas, sin comunicarse con Amazon.

## 1. Elegir dónde instalar Home Assistant

Para las primeras pruebas se puede usar un equipo disponible. Para el uso diario, el equipo que aloje Home Assistant y el servidor de Rasp debe permanecer encendido. El Mac solo puede apagarse sin perder el control de luces cuando estos servicios funcionen en otro equipo. Alexa necesita conexión a Internet.

La guía actual de Home Assistant recomienda Raspberry Pi 4 o 5 con al menos 2 GB de RAM. La Pi 3 B del proyecto tiene que atender también la pantalla y el navegador; conviene planificar el puente en otro equipo, en lugar de asumir que ambas cargas funcionarán bien en ella. Home Assistant OS instalado en una Pi sustituye su sistema y la instalación sobrescribe la tarjeta SD: no es una aplicación que se agregue al escritorio existente.

- [Instalación general](https://www.home-assistant.io/installation/)
- [Instalación en Raspberry Pi](https://www.home-assistant.io/installation/raspberrypi/)
- [Instalación en macOS mediante una máquina virtual](https://www.home-assistant.io/installation/macos/)

No se ha iniciado ninguna instalación ni modificado la Raspberry.

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

## 4. Asignar tus rutinas

En la app de Alexa, crea o usa rutinas con una frase de activación que puedas pronunciar, y asigna ahí las acciones sobre tus bombillos. Prueba la frase por voz en el Echo elegido.

En **Ajustes → Alexa → Escenas**, escribe esa misma frase, sin anteponer «Alexa», para las escenas que quieras usar:

| Escena en Rasp | Ejemplo de frase que puedes configurar en Alexa |
| --- | --- |
| Enfoque | activa enfoque rasp |
| Descanso | activa descanso rasp |
| Reunión | activa reunión rasp |
| Fin del día | activa fin del día rasp |

Estas frases son ejemplos; Rasp no crea las rutinas ni asigna dispositivos en Alexa. Puedes guardar las frases en Rasp antes de conectar Home Assistant. Se aplican solo al pulsar **Guardar**. Después de conectar, **Probar rutina** envía una orden real; **Guardar y comprobar** solo verifica la conexión.

La ejecución usa la acción oficial de Home Assistant `alexa_devices.send_text_command`, que Alexa procesa como una petición hablada. También puedes usar una orden de iluminación existente, por ejemplo «apaga la luz del estudio». Alexa puede responder por el altavoz, igual que ante una orden de voz.

[Acción Send text command](https://www.home-assistant.io/actions/alexa_devices.send_text_command/).

## 5. Ejecutar y automatizar

- Toca una escena en **Ambiente** para enviarla. Una escena sin asignar lleva a su configuración.
- En Enfoque y Descanso puedes activar la ejecución al comenzar una sesión nueva. Viene desactivada.
- Pausar, continuar, reiniciar, recargar o terminar un temporizador no ejecuta otra escena automáticamente. Al terminar un Pomodoro, el descanso se prepara y comienza con una acción explícita.
- La escena Reunión se ejecuta manualmente. Los escenarios de calendario de demostración no accionan luces. Su disparo automático queda pendiente de la conexión con el calendario real.
- Rasp informa que la orden fue enviada. No consulta ni afirma el estado físico de las luces, ni restaura automáticamente su brillo o color anterior.

Si hay un error de conexión, el Pomodoro continúa y se muestra el error. No se reintenta una orden automáticamente, para evitar ejecutar dos veces una rutina tras una respuesta incierta.

## Implementación

- `src/AmbienceScreen.tsx`: pantalla de escenas.
- `src/AlexaSettings.tsx`: guía, conexión, dispositivo, frases y opciones automáticas.
- `src/alexa.ts` y `src/useAlexa.ts`: modelo y cliente.
- `server/alexaBridge.mjs`: configuración privada, comprobación de Home Assistant, descubrimiento de dispositivos de Alexa y ejecución de frases guardadas.
- `server/alexaBridge.test.mjs`: pruebas del conector con servicios simulados.

El conector funciona con `npm run dev` y con `npm run build` seguido de `npm start`. El servidor escucha en loopback. En la Raspberry, el navegador y el servidor de Rasp pueden ejecutarse en el mismo equipo y este último comunicarse con Home Assistant en la red local; no se expone una API de control sin autenticación a toda la red.

La lista de dispositivos se obtiene con una plantilla fija limitada a la integración Alexa Devices. No se aceptan plantillas, servicios, comandos del sistema ni órdenes arbitrarias desde el botón de ejecutar: solo el identificador de una escena cuya frase ya esté guardada. La API comprueba el origen de las peticiones y evita duplicados del mismo identificador durante la ejecución del proceso.

[API REST de Home Assistant](https://developers.home-assistant.io/docs/api/rest/).

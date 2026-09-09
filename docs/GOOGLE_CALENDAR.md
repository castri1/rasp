# Google Calendar empresarial

Rasp consulta el calendario principal de una cuenta Google Workspace con el
alcance de solo lectura `calendar.readonly`. No crea, modifica ni elimina
eventos. Los tokens y el secreto OAuth se guardan únicamente en la Raspberry,
en `~/.local/share/rasp/.rasp/google-calendar.json`, con permisos `0600`.

## Preparar Google Workspace

Haz estos pasos con una cuenta autorizada para crear proyectos dentro de la
organización:

1. Abre [Google Cloud Console](https://console.cloud.google.com/) y crea o elige
   un proyecto perteneciente a tu organización de Google Workspace.
2. En **APIs y servicios**, habilita **Google Calendar API**.
3. En **Google Auth Platform**, configura la audiencia como **Interna**. Si esa
   opción no aparece, el proyecto no pertenece a la organización y el
   administrador de Workspace debe ayudarte a crearlo o asignarlo.
4. En acceso a datos, añade el alcance
   `https://www.googleapis.com/auth/calendar.readonly`.
5. Crea un cliente OAuth de tipo **Aplicación de escritorio** y llámalo
   `Rasp calendar`.
6. Conserva el **ID de cliente** y el **secreto de cliente**. No los añadas al
   repositorio ni los envíes por chat.

## Conectar la Raspberry

1. En Rasp abre **Ajustes → Calendario**.
2. Toca **Configurar desde mi Mac**. Rasp mostrará una dirección local y un
   código de ocho caracteres.
3. Abre esa dirección en el Mac, pega el ID y el secreto del cliente OAuth,
   introduce el código y pulsa **Guardar en la Raspberry**.
4. Regresa a Rasp y toca **Conectar con Google**.
5. En la pantalla de Google elige la cuenta empresarial y autoriza la lectura
   del calendario.
6. Google regresará automáticamente a Rasp. La agenda real reemplazará los
   datos de ejemplo.

La página para el Mac solo existe durante diez minutos, requiere el código
visible en la Raspberry y deja de escuchar después de guardar las
credenciales. También puedes escribirlas directamente en la pantalla táctil.

La autorización usa un retorno local a `127.0.0.1`, estado de un solo uso y
PKCE. El código de autorización vence a los diez minutos.

## Sincronización

- La agenda de hoy se consulta al iniciar y cada cinco minutos.
- Se ignoran eventos cancelados, invitaciones rechazadas y eventos de día
  completo, porque la pantalla está orientada a reuniones con hora.
- Los enlaces se aceptan como Google Meet solo cuando pertenecen a
  `https://meet.google.com`.
- Si Google o Internet no responden, Rasp presenta la última agenda guardada
  para ese mismo día e indica que está usando la copia local.
- La primera versión consulta el calendario principal. La selección de
  calendarios compartidos se añadirá después de validar la cuenta real.

Si Google muestra **Acceso bloqueado**, el administrador de Workspace debe
permitir el cliente OAuth o marcarlo como confiable según las políticas de la
organización.

Referencias oficiales:

- [OAuth 2.0 para aplicaciones de escritorio](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google Calendar API · Events](https://developers.google.com/workspace/calendar/api/v3/reference/events)
- [Google Calendar API · Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)

# Abrir Google Meet en el Mac

Rasp usa un acompañante local para abrir en el Mac los enlaces de Google Meet que llegan desde Google Calendar. Si existe el atajo **Rasp Focus**, también activa No molestar hasta que termine la reunión. El acompañante sólo escucha en `127.0.0.1`, acepta únicamente enlaces HTTPS de `meet.google.com` y requiere una clave compartida. Un túnel SSH inverso conecta la Raspberry con el acompañante, por lo que no depende de la IP del Mac ni expone un puerto en la red de la casa.

Desde el Mac, con la Raspberry encendida:

```bash
npm run install:mac
```

La instalación crea dos agentes de inicio de sesión:

- `com.rasp.mac-companion`: valida y abre las reuniones en el navegador predeterminado.
- `com.rasp.mac-tunnel`: mantiene la conexión cifrada con `daniel@pi.local`.

Para comprobar el estado desde el Mac:

```bash
curl -s http://127.0.0.1:4173/api/mac/status
```

La respuesta debe incluir `"ready":true`. El botón **Abrir en mi Mac** aparece en reuniones de Google Calendar que incluyen un enlace válido de Meet.

No molestar requiere además un atajo de macOS llamado **Rasp Focus** que reciba la hora de finalización. La apertura de Meet funciona aunque ese atajo todavía no exista.

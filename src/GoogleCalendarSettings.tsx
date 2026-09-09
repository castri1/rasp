import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, ArrowSquareOut, CalendarBlank, CheckCircle, CircleNotch, Desktop, FileArrowUp, Link, SignOut } from '@phosphor-icons/react';
import type { GoogleCalendarController } from './useGoogleCalendar';

export default function GoogleCalendarSettings({ calendar }: { calendar: GoogleCalendarController }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [editing, setEditing] = useState(!calendar.config.configured);
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!calendar.loading) setEditing(!calendar.config.configured); }, [calendar.loading, calendar.config.configured]);

  const connected = calendar.config.connected;
  const lastSync = calendar.syncedAt
    ? new Date(calendar.syncedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '';

  async function save() {
    if (await calendar.save(clientId, clientSecret)) {
      setClientSecret('');
      setEditing(false);
    }
  }

  async function importGoogleClient(file?: File) {
    if (!file) return;
    setFileError('');
    try {
      const contents = JSON.parse(await file.text());
      const credentials = contents?.installed;
      if (typeof credentials?.client_id !== 'string' || typeof credentials?.client_secret !== 'string') {
        throw new Error('Selecciona el JSON de un cliente OAuth de tipo Aplicación de escritorio.');
      }
      if (await calendar.save(credentials.client_id, credentials.client_secret)) {
        setClientSecret('');
        setEditing(false);
      }
    } catch (reason) {
      setFileError(reason instanceof Error ? reason.message : 'No se pudo leer el archivo de Google.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return <div className="calendar-settings-scroll">
    <div className="settings-heading calendar-settings-heading"><div><h2>Tu día, de verdad.</h2><p>Google Workspace · acceso de solo lectura.</p></div><CalendarBlank size={25} /></div>

    <div className={`calendar-connection-state ${connected ? 'ready' : ''}`}>
      <span className="connection-symbol">{calendar.loading || calendar.busy ? <CircleNotch size={21} className="spinning" /> : connected ? <CheckCircle size={21} /> : <CalendarBlank size={21} />}</span>
      <div><strong>{calendar.loading ? 'Consultando la conexión…' : connected ? calendar.config.account || 'Google Calendar conectado' : calendar.config.configured ? 'Listo para autorizar' : 'Prepara Google Workspace'}</strong>
        <p>{connected ? `${calendar.source === 'cache' ? 'Agenda guardada' : 'Sincronización activa'}${lastSync ? ` · ${lastSync}` : ''}` : calendar.config.configured ? calendar.config.clientIdHint : 'Necesitamos un cliente OAuth para escritorio.'}</p></div>
      {connected && <button aria-label="Actualizar agenda" disabled={calendar.busy} onClick={() => void calendar.refresh()}><ArrowCounterClockwise size={18} /></button>}
    </div>

    {editing ? <div className="calendar-credentials">
      {calendar.pairing ? <div className="calendar-pairing">
        <Desktop size={21} />
        <div><strong>Continúa en el Mac</strong><p>Abre <b>{calendar.pairing.addresses[0] || 'la dirección de esta Raspberry'}</b> e introduce este código:</p></div>
        <code>{calendar.pairing.code}</code>
      </div> : <div className="calendar-import-options"><button className="calendar-remote-setup" disabled={calendar.busy} onClick={() => void calendar.startPairing()}><Desktop size={18} /><span><strong>Configurar desde mi Mac</strong><small>Abre una página temporal para poder copiar y pegar.</small></span></button><button className="calendar-file-import" disabled={calendar.busy} onClick={() => fileInput.current?.click()}><FileArrowUp size={18} /><span><strong>Importar JSON</strong><small>Desde Google Cloud o una memoria USB.</small></span></button><input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={event => void importGoogleClient(event.target.files?.[0])} /></div>}
      {fileError && <p className="calendar-response is-error" role="status">{fileError}</p>}
      <div className="calendar-or"><span>o escríbelas aquí</span></div>
      <label><span>ID de cliente</span><input value={clientId} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="…apps.googleusercontent.com" onChange={event => setClientId(event.target.value)} /></label>
      <label><span>Secreto de cliente</span><input value={clientSecret} type="password" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={calendar.config.configured ? 'Dejar vacío para conservarlo' : 'GOCSPX-…'} onChange={event => setClientSecret(event.target.value)} /></label>
      <div className="calendar-form-actions">
        {calendar.config.configured && <button className="text-button" onClick={() => setEditing(false)}>Cancelar</button>}
        <button className="compact-primary" disabled={calendar.busy || !clientId.trim()} onClick={() => void save()}>Guardar credenciales</button>
      </div>
    </div> : connected ? <div className="calendar-connected-actions">
      <div><span className="eyebrow">AGENDA DE HOY</span><strong>{calendar.events.length} {calendar.events.length === 1 ? 'reunión sincronizada' : 'reuniones sincronizadas'}</strong><p>Rasp consulta cambios cada cinco minutos y conserva la última agenda disponible.</p></div>
      <div>{(calendar.source === 'cache' || calendar.error) && <button className="text-button" disabled={calendar.busy} onClick={() => void calendar.connect()}><Link size={15} />Reconectar</button>}<button className="text-button" onClick={() => setEditing(true)}>Credenciales</button><button className="danger-text-button" disabled={calendar.busy} onClick={() => void calendar.disconnect()}><SignOut size={15} />Desconectar</button></div>
    </div> : <div className="calendar-authorize">
      <div><span className="eyebrow">UN SOLO PASO</span><p>Google abrirá su pantalla de acceso. Elige tu cuenta empresarial y concede permiso para consultar el calendario.</p></div>
      <button className="compact-primary" disabled={calendar.busy} onClick={() => void calendar.connect()}><Link size={17} />Conectar con Google</button>
      <button className="text-button edit-oauth" onClick={() => setEditing(true)}>Cambiar credenciales</button>
    </div>}

    {calendar.message && <p className={`calendar-response ${calendar.error ? 'is-error' : ''}`} role="status">{calendar.message}</p>}
    {!connected && <a className="google-console-link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Abrir Google Cloud Console <ArrowSquareOut size={13} /></a>}
  </div>;
}

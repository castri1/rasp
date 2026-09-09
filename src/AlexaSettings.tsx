import { useEffect, useState } from 'react';
import { ArrowRight, ArrowSquareOut, Check, CheckCircle, CircleNotch, LinkSimple, SpeakerHigh, WarningCircle } from '@phosphor-icons/react';
import { SCENES } from './alexa';
import type { SceneId } from './alexa';
import type { AlexaController } from './useAlexa';
import { SceneIcon } from './AmbienceScreen';
import './ambience.css';

type Step = 'guide' | 'connection' | 'scenes';
export default function AlexaSettings({ alexa, initialScene }: { alexa: AlexaController; initialScene?: SceneId }) {
  const [step, setStep] = useState<Step>(initialScene ? 'scenes' : alexa.config.configured ? 'connection' : 'guide');
  const [draft, setDraft] = useState(alexa.config);
  const [token, setToken] = useState('');
  const [scene, setScene] = useState<SceneId>(initialScene ?? 'focus');
  const [feedback, setFeedback] = useState('');
  const [devices, setDevices] = useState(alexa.connection.devices);
  useEffect(() => { setDraft(alexa.config); }, [alexa.config]);
  useEffect(() => { if (alexa.connection.devices.length) setDevices(alexa.connection.devices); }, [alexa.connection.devices]);
  const selected = SCENES.find(item => item.id === scene)!;
  const dirty = JSON.stringify(draft) !== JSON.stringify(alexa.config) || token.length > 0;
  async function save() {
    const ok = await alexa.save(draft, token);
    if (ok) { setToken(''); setFeedback('Guardado en este equipo.'); }
    return ok;
  }
  async function connect() {
    setFeedback('');
    if (dirty && !(await save())) return;
    const connection = await alexa.check();
    if (connection) { setDevices(connection.devices); setFeedback(connection.message); }
  }
  function changeStep(next: Step) { setStep(next); setFeedback(''); }
  return <div className="alexa-settings">
    <div className="alexa-setting-top"><div><h2>Tu Alexa, aquí.</h2><span>Rasp → Home Assistant → Alexa</span></div><LinkSimple size={22} /></div>
    <nav className="alexa-steps" aria-label="Configuración de Alexa"><button aria-current={step === 'guide' ? 'step' : undefined} onClick={() => changeStep('guide')}>1. Preparar</button><button aria-current={step === 'connection' ? 'step' : undefined} onClick={() => changeStep('connection')}>2. Conectar</button><button aria-current={step === 'scenes' ? 'step' : undefined} onClick={() => changeStep('scenes')}>3. Escenas</button></nav>
    <div className="alexa-settings-scroll" key={step}>
      {step === 'guide' ? <div className="alexa-guide"><div className="alexa-guide-row"><span>01</span><div><h3>Prepara el puente</h3><p>Instala Home Assistant en el equipo que dejarás encendido.</p><a href="https://www.home-assistant.io/installation/" target="_blank" rel="noreferrer">Guía de instalación <ArrowSquareOut size={13} /></a></div></div><div className="alexa-guide-row"><span>02</span><div><h3>Vincula tu cuenta de Alexa</h3><p>En Home Assistant: Ajustes → Dispositivos y servicios → Añadir integración → <strong>Alexa Devices</strong>. Inicia sesión con Amazon allí.</p><p>La integración requiere verificación en dos pasos con una aplicación autenticadora.</p><a href="https://www.home-assistant.io/integrations/alexa_devices/" target="_blank" rel="noreferrer">Configurar Alexa Devices <ArrowSquareOut size={13} /></a></div></div><div className="alexa-guide-row"><span>03</span><div><h3>Da acceso a Rasp</h3><p>Crea un token de acceso de larga duración en tu perfil de Home Assistant → Seguridad. Introdúcelo en el paso Conectar.</p><p>Tu contraseña de Amazon se introduce únicamente en Home Assistant.</p></div></div><button className="alexa-action" onClick={() => changeStep('connection')}>Ya tengo Home Assistant <ArrowRight size={16} /></button></div> : step === 'connection' ? <form id="alexa-connection-form" onSubmit={event => { event.preventDefault(); void connect(); }}>
        <div className="alexa-credentials"><label className="alexa-field"><span>Dirección de Home Assistant</span><input type="url" autoComplete="url" placeholder="http://homeassistant.local:8123" value={draft.url} onChange={event => { setDraft(previous => ({ ...previous, url: event.target.value, deviceId: '' })); setDevices([]); }} required /></label>
        <label className="alexa-field"><span>Token de acceso{alexa.config.hasToken && <small><Check size={11} />Guardado</small>}</span><input type="password" aria-label="Token de acceso" autoComplete="new-password" placeholder={alexa.config.hasToken ? 'Déjalo vacío para conservar el token' : 'Pega el token de Home Assistant'} value={token} onChange={event => setToken(event.target.value)} required={!alexa.config.hasToken} /></label></div>
        <p className="alexa-private-note">Se guarda en el servidor de Rasp, fuera del navegador.</p>
        <label className="alexa-field"><span><SpeakerHigh size={14} />Dispositivo que ejecutará las rutinas</span><select aria-label="Dispositivo Alexa" value={draft.deviceId} disabled={!devices.length || alexa.busy} onChange={event => setDraft(previous => ({ ...previous, deviceId: event.target.value }))}><option value="">{devices.length ? 'Selecciona tu Echo' : 'Comprueba la conexión para ver tus dispositivos'}</option>{devices.map(device => <option value={device.id} key={device.id}>{device.name}</option>)}{draft.deviceId && !devices.some(device => device.id === draft.deviceId) && <option value={draft.deviceId}>Dispositivo guardado · pendiente de comprobar</option>}</select></label>
        <div className="alexa-connection-message">{alexa.connection.state === 'ready' ? <CheckCircle size={15} /> : <LinkSimple size={15} />}<span>{alexa.connection.message}</span></div>
      </form> : <div className="alexa-scene-editor"><div className="scene-selection" aria-label="Escena a configurar">{SCENES.map(item => <button key={item.id} aria-label={`Configurar ${item.name}`} aria-pressed={scene === item.id} onClick={() => { setScene(item.id); setFeedback(''); }}><SceneIcon id={item.id} size={17} /><span>{item.name}</span></button>)}</div>
        <label className="alexa-field"><span>Frase de la rutina «{selected.name}»</span><input type="text" maxLength={180} autoComplete="off" placeholder={`Ej.: ${selected.example}`} value={draft.commands[scene]} onChange={event => setDraft(previous => ({ ...previous, commands: { ...previous.commands, [scene]: event.target.value } }))} /></label>
        <p className="alexa-scene-help">Escribe la frase que le dirías a Alexa, sin decir «Alexa». La rutina y sus bombillos se configuran en la app de Alexa.</p>
        {(scene === 'focus' || scene === 'break') ? <label className="alexa-automatic"><span><strong>{scene === 'focus' ? 'Al comenzar un Pomodoro' : 'Al comenzar un descanso'}</strong><small>Se ejecutará la rutina al iniciar una sesión nueva.</small></span><input role="switch" type="checkbox" aria-label={`Ejecutar ${selected.name} automáticamente`} checked={draft.automatic[scene]} disabled={!draft.commands[scene].trim() || !draft.deviceId} onChange={event => setDraft(previous => ({ ...previous, automatic: { ...previous.automatic, [scene]: event.target.checked } }))} /></label> : <p className="alexa-manual-note">{scene === 'meeting' ? 'Por ahora se activa desde Ambiente. Los escenarios de calendario de ejemplo no accionan tus luces.' : 'Se activa al tocar su escena en Ambiente.'}</p>}
        {!alexa.config.configured && <button className="alexa-inline-link" onClick={() => changeStep('connection')}>Conecta Home Assistant para ejecutar tus escenas <ArrowRight size={14} /></button>}
      </div>}
    </div>
    <footer className="alexa-setting-actions"><span className={alexa.error ? 'alexa-error' : ''} role="status">{alexa.error && <WarningCircle size={13} />}{alexa.error ? alexa.message : dirty ? 'Cambios sin guardar' : feedback || alexa.message}</span><div>{step === 'connection' ? <button className="alexa-action" form="alexa-connection-form" type="submit" disabled={alexa.busy}>{alexa.busy ? <CircleNotch className="spinning" size={16} /> : <LinkSimple size={16} />}Guardar y comprobar</button> : step === 'scenes' ? <><button className="alexa-action secondary" disabled={alexa.busy || dirty || !draft.deviceId || !draft.commands[scene]} onClick={() => { setFeedback(''); void alexa.run(scene); }}>Probar rutina</button><button className="alexa-action" disabled={alexa.busy || !dirty} onClick={() => void save()}><Check size={15} />Guardar</button></> : <span className="alexa-guide-footer">Una sola conexión para tus escenas.</span>}</div></footer>
  </div>;
}

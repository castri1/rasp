import { useEffect, useState } from 'react';
import { ArrowRight, ArrowSquareOut, Check, CheckCircle, CircleNotch, LinkSimple, Plus, SpeakerHigh, Trash, WarningCircle } from '@phosphor-icons/react';
import { SCENE_ICONS } from './alexa';
import type { AlexaScene, SceneIconId } from './alexa';
import type { AlexaController } from './useAlexa';
import { SceneIcon } from './AmbienceScreen';
import './ambience.css';

type Step = 'guide' | 'connection' | 'scenes';
export default function AlexaSettings({ alexa, initialScene }: { alexa: AlexaController; initialScene?: string }) {
  const [step, setStep] = useState<Step>(initialScene ? 'scenes' : alexa.config.configured ? 'connection' : 'guide');
  const [draft, setDraft] = useState(alexa.config);
  const [token, setToken] = useState('');
  const [sceneId, setSceneId] = useState(initialScene ?? alexa.config.scenes[0]?.id ?? 'focus');
  const [feedback, setFeedback] = useState('');
  const [devices, setDevices] = useState(alexa.connection.devices);
  useEffect(() => {
    setDraft(alexa.config);
    setSceneId(current => alexa.config.scenes.some(scene => scene.id === current) ? current : alexa.config.scenes[0]?.id ?? '');
  }, [alexa.config]);
  useEffect(() => { if (alexa.connection.devices.length) setDevices(alexa.connection.devices); }, [alexa.connection.devices]);
  const selected = draft.scenes.find(item => item.id === sceneId) ?? draft.scenes[0];
  const routineNames = alexa.connection.routines.map(routine => routine.name);
  const dirty = JSON.stringify(draft) !== JSON.stringify(alexa.config) || token.length > 0;
  function updateScene(change: Partial<AlexaScene>) {
    if (!selected) return;
    setDraft(previous => ({ ...previous, scenes: previous.scenes.map(scene => scene.id === selected.id ? { ...scene, ...change } : scene) }));
  }
  function addScene() {
    if (draft.scenes.length >= 12) { setFeedback('Puedes guardar hasta 12 escenas.'); return; }
    const id = `scene-${Date.now().toString(36)}`;
    const scene: AlexaScene = { id, name: 'Nueva escena', description: 'Un ambiente a tu manera.', icon: 'lamp', command: '', offCommand: '', active: false, changedAt: '' };
    setDraft(previous => ({ ...previous, scenes: [...previous.scenes, scene] }));
    setSceneId(id); setFeedback('Ponle un nombre y elige su rutina.');
  }
  function removeScene() {
    if (!selected || draft.scenes.length <= 1) return;
    const remaining = draft.scenes.filter(scene => scene.id !== selected.id);
    setDraft(previous => ({ ...previous, scenes: remaining, automatic: {
      focusSceneId: previous.automatic.focusSceneId === selected.id ? '' : previous.automatic.focusSceneId,
      breakSceneId: previous.automatic.breakSceneId === selected.id ? '' : previous.automatic.breakSceneId,
    } }));
    setSceneId(remaining[0].id); setFeedback('Escena retirada. Guarda para confirmar.');
  }
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
      </form> : selected ? <div className="alexa-scene-editor"><div className="scene-selection" aria-label="Escena a configurar">{draft.scenes.map(item => <button key={item.id} aria-label={`Configurar ${item.name}`} aria-pressed={selected.id === item.id} onClick={() => { setSceneId(item.id); setFeedback(''); }}><SceneIcon icon={item.icon} size={17} /><span>{item.name}</span></button>)}<button className="add-scene" aria-label="Crear una escena" disabled={draft.scenes.length >= 12} onClick={addScene}><Plus size={18} /><span>Nueva</span></button></div>
        <div className="scene-command-fields"><label className="alexa-field compact-scene-field"><span>Comando para activar</span><input type="text" list={routineNames.length ? `alexa-routines-${selected.id}` : undefined} maxLength={180} autoComplete="off" placeholder="Ej. activa enfoque" value={selected.command} onChange={event => updateScene({ command: event.target.value })} /></label><label className="alexa-field compact-scene-field"><span>Comando para apagar</span><input type="text" list={routineNames.length ? `alexa-routines-${selected.id}` : undefined} maxLength={180} autoComplete="off" placeholder="Ej. apaga enfoque" value={selected.offCommand} onChange={event => updateScene({ offCommand: event.target.value })} /></label></div>
        {routineNames.length > 0 && <datalist id={`alexa-routines-${selected.id}`}>{routineNames.map(name => <option value={name} key={name} />)}</datalist>}
        <div className="scene-editor-fields"><label className="alexa-field"><span>Nombre</span><input type="text" maxLength={40} value={selected.name} onChange={event => updateScene({ name: event.target.value })} /></label><label className="alexa-field"><span>Icono</span><select aria-label="Icono de la escena" value={selected.icon} onChange={event => updateScene({ icon: event.target.value as SceneIconId })}>{SCENE_ICONS.map(icon => <option value={icon.id} key={icon.id}>{icon.name}</option>)}</select></label></div>
        <label className="alexa-field compact-scene-field"><span>Descripción</span><input type="text" maxLength={100} value={selected.description} onChange={event => updateScene({ description: event.target.value })} /></label>
        <div className="scene-automation-row"><label><span><strong>Al iniciar un Pomodoro</strong></span><input role="switch" type="checkbox" aria-label={`Usar ${selected.name} al iniciar un Pomodoro`} checked={draft.automatic.focusSceneId === selected.id} disabled={!selected.command.trim()} onChange={event => setDraft(previous => ({ ...previous, automatic: { ...previous.automatic, focusSceneId: event.target.checked ? selected.id : '' } }))} /></label><label><span><strong>Al iniciar un descanso</strong></span><input role="switch" type="checkbox" aria-label={`Usar ${selected.name} al iniciar un descanso`} checked={draft.automatic.breakSceneId === selected.id} disabled={!selected.command.trim()} onChange={event => setDraft(previous => ({ ...previous, automatic: { ...previous.automatic, breakSceneId: event.target.checked ? selected.id : '' } }))} /></label><button aria-label={`Eliminar escena ${selected.name}`} disabled={draft.scenes.length <= 1} onClick={removeScene}><Trash size={16} />Eliminar</button></div>
        {!alexa.config.configured && <button className="alexa-inline-link" onClick={() => changeStep('connection')}>Conecta Home Assistant para ejecutar tus escenas <ArrowRight size={14} /></button>}
      </div> : null}
    </div>
    <footer className="alexa-setting-actions"><span className={alexa.error ? 'alexa-error' : ''} role="status">{alexa.error && <WarningCircle size={13} />}{alexa.error ? alexa.message : dirty ? feedback || 'Cambios sin guardar' : feedback || alexa.message}</span><div>{step === 'connection' ? <button className="alexa-action" form="alexa-connection-form" type="submit" disabled={alexa.busy}>{alexa.busy ? <CircleNotch className="spinning" size={16} /> : <LinkSimple size={16} />}Guardar y comprobar</button> : step === 'scenes' && selected ? <><button className="alexa-action secondary" disabled={alexa.busy || dirty || !draft.deviceId || !selected.command} onClick={() => { setFeedback(''); void alexa.run(selected.id, 'manual', true); }}>Probar</button><button className="alexa-action" disabled={alexa.busy || !dirty || !selected.name.trim()} onClick={() => void save()}><Check size={15} />Guardar</button></> : <span className="alexa-guide-footer">Una sola conexión para tus escenas.</span>}</div></footer>
  </div>;
}

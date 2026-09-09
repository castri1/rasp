import { ArrowRight, ArrowUpRight, Check, CircleNotch, Coffee, Lamp, Leaf, Moon, VideoCamera, SlidersHorizontal } from '@phosphor-icons/react';
import type { SceneId } from './alexa';
import { SCENES } from './alexa';
import type { AlexaController } from './useAlexa';
import './ambience.css';
export function SceneIcon({ id, size = 23 }: { id: SceneId; size?: number }) {
  return id === 'focus' ? <Leaf size={size} /> : id === 'break' ? <Coffee size={size} /> : id === 'meeting' ? <VideoCamera size={size} /> : <Moon size={size} />;
}
export default function AmbienceScreen({ alexa, onSettings }: { alexa: AlexaController; onSettings: (scene?: SceneId) => void }) {
  const { config, connection, busy, pendingScene } = alexa;
  const connected = connection.state === 'ready';
  const deviceName = connection.devices.find(device => device.id === config.deviceId)?.name;
  const lastScene = SCENES.find(scene => scene.id === alexa.lastSent?.scene);
  return <main className="ambience-screen app-content" aria-label="Ambiente con Alexa">
    <section className="ambience-intro"><span className="eyebrow">TU CASA, EN SINTONÍA</span><h1>Tu espacio,<br />a tu ritmo<span>.</span></h1><p>Las rutinas de tu Alexa.<br />Ahora, a un toque.</p>
      <div className="ambience-art" aria-hidden="true"><span className="lamp-light" /><Lamp size={77} weight="thin" /><span className="lamp-floor" /></div>
      <button className="ambience-connect" onClick={() => onSettings()}><span className={`alexa-dot ${connected ? 'connected' : ''}`} /><span>{connected ? deviceName || 'Alexa conectada' : 'Conectar Alexa'}</span>{connected ? <SlidersHorizontal size={18} /> : <ArrowRight size={18} />}</button>
    </section>
    <section className="ambience-scenes"><div className="ambience-heading"><h2>Escenas</h2><span>{connected ? 'A TRAVÉS DE ALEXA' : 'POR CONFIGURAR'}</span></div>
      <div className="scene-grid">{SCENES.map(scene => {
        const assigned = Boolean(config.deviceId && config.commands[scene.id]);
        const pending = pendingScene === scene.id;
        return <button key={scene.id} className={`scene-card scene-${scene.id}`} aria-label={`${assigned ? 'Ejecutar' : 'Configurar'} escena ${scene.name}`} disabled={busy} onClick={() => assigned ? void alexa.run(scene.id) : onSettings(scene.id)}>
          <span className="scene-card-top"><span className="scene-symbol"><SceneIcon id={scene.id} /></span>{pending ? <CircleNotch size={17} className="spinning" /> : <ArrowUpRight size={16} />}</span>
          <strong>{scene.name}</strong><span className="scene-description">{scene.description}</span><span className="scene-state">{pending ? 'Enviando…' : assigned ? 'Ejecutar rutina' : 'Asignar rutina'}<span className="scene-line" /></span>
        </button>;
      })}</div>
      <div className={`ambience-feedback ${alexa.error ? 'has-error' : ''}`} role="status">{alexa.message ? <><span className="feedback-mark">{alexa.error ? '!' : pendingScene ? '·' : <Check size={14} />}</span><span>{alexa.message}</span></> : lastScene ? <><Check size={14} /><span>Última orden: {lastScene.name}. No se consulta el estado de los bombillos.</span></> : <><Lamp size={15} /><span>{connected ? 'Alexa aplica la iluminación definida en cada rutina.' : 'Vincula Home Assistant y elige tus rutinas para empezar.'}</span></>}</div>
    </section>
  </main>;
}

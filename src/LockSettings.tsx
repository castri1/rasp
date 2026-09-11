import { useState } from 'react';
import { Check, CircleNotch, LockKey, ShieldCheck } from '@phosphor-icons/react';
import { validPin } from './screenLock';
import type { ScreenLockController } from './useScreenLock';

export default function LockSettings({ controller }: { controller: ScreenLockController }) {
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const valid = validPin(pin) && pin === confirmation && (!controller.configured || validPin(currentPin));
  async function save() {
    if (!(await controller.savePin(pin, currentPin))) return;
    setCurrentPin(''); setPin(''); setConfirmation('');
  }
  return <div className="lock-settings">
    <div className="settings-heading"><div><h2>Tu pantalla, privada.</h2><p>Un PIN sencillo para volver a tu día.</p></div><ShieldCheck size={25} /></div>
    <div className="lock-settings-card"><div className="lock-settings-symbol"><LockKey size={25} /></div><div><strong>{controller.configured ? 'Bloqueo configurado' : 'Crea tu PIN'}</strong><p>{controller.configured ? 'El botón de candado aparecerá siempre junto a la fecha.' : 'Usa entre 4 y 6 números. El PIN no se guarda como texto.'}</p></div></div>
    <div className="lock-fields">
      {controller.configured && <label><span>PIN ACTUAL</span><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={currentPin} onChange={event => setCurrentPin(event.target.value.replace(/\D/g, ''))} /></label>}
      <label><span>{controller.configured ? 'NUEVO PIN' : 'PIN'}</span><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} /></label>
      <label><span>CONFIRMAR</span><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={confirmation} onChange={event => setConfirmation(event.target.value.replace(/\D/g, ''))} /></label>
    </div>
    <div className="lock-settings-note"><span>{pin && confirmation && pin !== confirmation ? 'Los dos PIN no coinciden.' : controller.message || 'El bloqueo se mantiene al reiniciar la pantalla.'}</span><button disabled={!valid || controller.busy} onClick={() => void save()}>{controller.busy ? <CircleNotch className="spinning" size={17} /> : <Check size={17} />}{controller.configured ? 'Cambiar PIN' : 'Guardar PIN'}</button></div>
  </div>;
}

import { useEffect, useState } from 'react';
import { Backspace, Check, LockKey, X } from '@phosphor-icons/react';
import type { ScreenLockController } from './useScreenLock';
import './screen-lock.css';

export default function LockScreen({ controller }: { controller: ScreenLockController }) {
  const [showKeypad, setShowKeypad] = useState(false);
  const [pin, setPin] = useState('');
  const [now, setNow] = useState(new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!controller.locked) { setShowKeypad(false); setPin(''); } }, [controller.locked]);
  const time = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  async function submit() { if (pin.length < 4) return; if (!(await controller.unlock(pin))) setPin(''); }
  function digit(value: string) { if (!controller.busy && pin.length < 6) setPin(current => `${current}${value}`); }
  return <main className={`lock-screen ${showKeypad ? 'show-keypad' : ''}`} aria-label="Pantalla bloqueada" onClick={() => { if (!showKeypad) setShowKeypad(true); }}>
    <div className="lock-art" aria-hidden="true"><i /><i /><i /><span /></div>
    <section className="lock-clock"><span className="lock-mark"><LockKey size={17} />RASP BLOQUEADO</span><time>{time}</time><p>{date.charAt(0).toUpperCase() + date.slice(1)}</p><small>Toca la pantalla para desbloquear</small></section>
    {showKeypad && <section className="lock-keypad" aria-label="Teclado para desbloquear" onClick={event => event.stopPropagation()}><button className="lock-keypad-close" aria-label="Cerrar teclado" onClick={() => { setShowKeypad(false); setPin(''); }}><X size={18} /></button><div className="pin-dots" aria-label={`${pin.length} números escritos`}>{Array.from({ length: controller.pinLength }, (_, index) => <i className={index < pin.length ? 'filled' : ''} key={index} />)}</div><span className="pin-message" role="status">{controller.message || 'Escribe tu PIN'}</span><div className="number-grid">{['1','2','3','4','5','6','7','8','9'].map(value => <button key={value} onClick={() => digit(value)}>{value}</button>)}<button aria-label="Borrar un número" onClick={() => setPin(value => value.slice(0, -1))}><Backspace size={21} /></button><button onClick={() => digit('0')}>0</button><button aria-label="Desbloquear" disabled={pin.length < 4 || controller.busy} onClick={() => void submit()}><Check size={22} weight="bold" /></button></div></section>}
  </main>;
}

import { useEffect, useRef } from 'react';
import { BellRinging, Check } from '@phosphor-icons/react';
import type { AlarmsController } from './useAlarms';

export default function AlarmOverlay({ controller }: { controller: AlarmsController }) {
  const alert = controller.activeAlerts[0];
  const dismissRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (alert) dismissRef.current?.focus(); }, [alert?.id]);
  if (!alert) return null;
  const now = new Date(controller.now);
  return <div className="alarm-overlay" role="alertdialog" aria-modal="true" aria-labelledby="alarm-overlay-title">
    <div className="alarm-animation" aria-hidden="true"><i /><i /><i /><span><BellRinging size={40} weight="thin" /></span></div>
    <div className="alarm-overlay-content">
      <span className="alarm-overlay-kind">{alert.kind === 'alarm' ? 'ALARMA' : alert.kind === 'timer' ? 'TIMER FINALIZADO' : 'VISTA PREVIA'}</span>
      <h1 id="alarm-overlay-title">{alert.name}</h1>
      <time>{now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
      {controller.activeAlerts.length > 1 && <small>{controller.activeAlerts.length} avisos pendientes</small>}
    </div>
    <button ref={dismissRef} className="alarm-dismiss" onClick={() => controller.dismiss(alert)}><Check size={22} weight="bold" />Descartar</button>
  </div>;
}

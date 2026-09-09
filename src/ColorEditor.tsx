import { useRef, useState } from 'react';
import { ArrowCounterClockwise, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { COLOR_GROUPS, DEFAULT_COLORS, contrastRatio, normalizeHex } from './theme';
import type { ColorKey, ThemeColors } from './theme';
import './color-editor.css';

function ColorField({ colorKey, label, value, onChange }: { colorKey: ColorKey; label: string; value: string; onChange: (key: ColorKey, value: string) => void }) {
  const [draft, setDraft] = useState(value.toUpperCase());
  const [editing, setEditing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const cancelBlur = useRef(false);
  const changed = value !== DEFAULT_COLORS[colorKey];
  function commit() {
    if (cancelBlur.current) { cancelBlur.current = false; setEditing(false); setInvalid(false); return; }
    const normalized = normalizeHex(draft);
    if (normalized) { onChange(colorKey, normalized); setDraft(normalized.toUpperCase()); setInvalid(false); }
    else { setDraft(value.toUpperCase()); setInvalid(true); }
    setEditing(false);
  }
  return <div className="color-field">
    <label className="color-field-label" htmlFor={`hex-${colorKey}`}>{label}{changed && <span className="color-changed" aria-label="Modificado" />}</label>
    <div className="color-inputs">
      <input className="color-picker" type="color" value={value} aria-label={`Seleccionar color: ${label}`} onChange={event => { onChange(colorKey, event.target.value); setInvalid(false); }} />
      <input id={`hex-${colorKey}`} className="hex-input" value={editing ? draft : value.toUpperCase()} aria-label={`HEX: ${label}`} aria-invalid={invalid} aria-describedby={invalid ? `error-${colorKey}` : undefined} spellCheck={false} autoComplete="off" maxLength={7}
        onFocus={() => { setDraft(value.toUpperCase()); setEditing(true); }}
        onChange={event => { const next = event.target.value; setDraft(next); setInvalid(false); if (/^#?[\da-f]{6}$/i.test(next)) onChange(colorKey, normalizeHex(next)!); }}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { event.stopPropagation(); cancelBlur.current = true; setDraft(value.toUpperCase()); event.currentTarget.blur(); }
        }} />
      <button className="reset-color" disabled={!changed && !invalid} onClick={() => { onChange(colorKey, DEFAULT_COLORS[colorKey]); setInvalid(false); }} aria-label={`Restaurar color: ${label}`} title="Restaurar este color"><ArrowCounterClockwise size={14} /></button>
    </div>
    {invalid && <span className="color-error" id={`error-${colorKey}`} role="status">Usa un código HEX, por ejemplo #ACC9F2.</span>}
  </div>;
}

export default function ColorEditor({ colors, onChange }: {
  colors: ThemeColors; onChange: (key: ColorKey, value: string) => void;
}) {
  const [activeGroup, setActiveGroup] = useState<string>('backgrounds');
  const group = COLOR_GROUPS.find(item => item.id === activeGroup)!;
  const lowContrast = [
    { label: 'Texto principal', ratio: contrastRatio(colors['text-primary'], colors['device-bg']) },
    { label: 'Botón principal', ratio: contrastRatio(colors['highlight-ink'], colors.highlight) },
    { label: 'Botón de alerta', ratio: contrastRatio(colors['amber-ink'], colors.amber) },
    { label: 'Reloj', ratio: contrastRatio(colors['clock-text'], colors['device-bg']) },
  ].filter(check => check.ratio < 4.5);
  return <div className="color-editor" aria-label="Configuración de colores">
    <div className="color-category"><label htmlFor="color-category">Qué quieres ajustar</label><select id="color-category" value={activeGroup} onChange={event => setActiveGroup(event.target.value)}>{COLOR_GROUPS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
    <div className="editor-scroll" key={activeGroup}>
      <p className="editor-description">{group.description}</p>
      <div className="color-fields">{group.fields.map(field => <ColorField key={field.key} colorKey={field.key} label={field.label} value={colors[field.key]} onChange={onChange} />)}</div>
    </div>
    <div className={`contrast-summary ${lowContrast.length ? 'needs-attention' : ''}`} role="status">
      {lowContrast.length ? <WarningCircle size={16} /> : <CheckCircle size={16} />}<span>{lowContrast.length ? `Contraste bajo: ${lowContrast.map(check => check.label).join(', ')}.` : 'Buen contraste en el reloj, texto principal y botones.'}</span>
    </div>
  </div>;
}

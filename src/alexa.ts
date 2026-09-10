export const SCENE_ICONS = [
  { id: 'lamp', name: 'Luz' }, { id: 'focus', name: 'Enfoque' }, { id: 'coffee', name: 'Descanso' },
  { id: 'meeting', name: 'Reunión' }, { id: 'moon', name: 'Noche' },
] as const;
export type SceneIconId = typeof SCENE_ICONS[number]['id'];
export type SceneId = string;
export interface AlexaScene { id: SceneId; name: string; description: string; icon: SceneIconId; command: string; offCommand: string; active: boolean; changedAt: string }
export const DEFAULT_SCENES: AlexaScene[] = [
  { id: 'focus', name: 'Enfoque', description: 'Un espacio para una sola cosa.', command: '', offCommand: '', active: false, changedAt: '', icon: 'focus' },
  { id: 'break', name: 'Descanso', description: 'Baja el ritmo. Toma aire.', command: '', offCommand: '', active: false, changedAt: '', icon: 'coffee' },
  { id: 'meeting', name: 'Reunión', description: 'Prepara tu espacio para conectar.', command: '', offCommand: '', active: false, changedAt: '', icon: 'meeting' },
  { id: 'evening', name: 'Fin del día', description: 'Todo a su tiempo. También parar.', command: '', offCommand: '', active: false, changedAt: '', icon: 'moon' },
];
export interface AlexaConfig {
  version: 3; url: string; hasToken: boolean; configured: boolean; deviceId: string;
  scenes: AlexaScene[]; automatic: { focusSceneId: string; breakSceneId: string };
}
export interface AlexaConnection {
  state: string; message: string;
  devices: { id: string; name: string }[];
  routines: { entityId: string; name: string }[];
}
export const EMPTY_ALEXA: AlexaConfig = { version: 3, url: '', hasToken: false, configured: false, deviceId: '', scenes: DEFAULT_SCENES.map(scene => ({ ...scene })), automatic: { focusSceneId: '', breakSceneId: '' } };

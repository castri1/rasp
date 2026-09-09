export const SCENES = [
  { id: 'focus', name: 'Enfoque', description: 'Un espacio para una sola cosa.', example: 'activa enfoque rasp', icon: 'focus' },
  { id: 'break', name: 'Descanso', description: 'Baja el ritmo. Toma aire.', example: 'activa descanso rasp', icon: 'coffee' },
  { id: 'meeting', name: 'Reunión', description: 'Prepara tu espacio para conectar.', example: 'activa reunión rasp', icon: 'meeting' },
  { id: 'evening', name: 'Fin del día', description: 'Todo a su tiempo. También parar.', example: 'activa fin del día rasp', icon: 'moon' },
] as const;
export type SceneId = typeof SCENES[number]['id'];
export interface AlexaConfig {
  url: string; hasToken: boolean; configured: boolean; deviceId: string;
  commands: Record<SceneId, string>; automatic: { focus: boolean; break: boolean };
}
export interface AlexaConnection {
  state: string; message: string;
  devices: { id: string; name: string }[];
  routines: { entityId: string; name: string }[];
}
export const EMPTY_ALEXA: AlexaConfig = { url: '', hasToken: false, configured: false, deviceId: '', commands: { focus: '', break: '', meeting: '', evening: '' }, automatic: { focus: false, break: false } };

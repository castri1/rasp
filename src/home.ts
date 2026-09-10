export type HomeDomain = 'light' | 'switch';

export interface HomeDevice {
  entityId: string;
  name: string;
  originalName: string;
  area: string;
  roomId: string;
  domain: HomeDomain;
  state: 'on' | 'off' | 'unavailable' | 'unknown';
  brightness: number;
}

export interface HomeRoom {
  id: string;
  name: string;
  slot: string;
  builtIn: boolean;
  onCommand: string;
  offCommand: string;
  assumedOn: boolean;
  changedAt: string;
  devices: HomeDevice[];
  on: number;
  unavailable: number;
}

export interface HomeState {
  state: string;
  message: string;
  rooms: HomeRoom[];
  unassignedDevices: HomeDevice[];
  updatedAt: string;
}

const DEFAULT_ROOMS = [
  ['juan-rafael', 'Habitación auxiliar', 'auxiliar'],
  ['oficina', 'Oficina Daniel', 'oficina-daniel'],
  ['amalia', 'Oficina Amalia', 'oficina-amalia'],
  ['principal', 'Habitación principal', 'principal'],
  ['comedor', 'Comedor', 'comedor'],
  ['cocina', 'Cocina', 'cocina'],
  ['sala', 'Sala · Estar TV', 'sala'],
  ['balcon', 'Balcón', 'balcon'],
  ['lavanderia', 'Lavandería', 'lavanderia'],
  ['servicio', 'Habitación servicio', 'servicio'],
] as const;

export const EMPTY_HOME: HomeState = {
  state: 'loading', message: 'Leyendo tu casa…', updatedAt: '', unassignedDevices: [],
  rooms: DEFAULT_ROOMS.map(([id, name, slot]) => ({ id, name, slot, builtIn: true, onCommand: '', offCommand: '', assumedOn: false, changedAt: '', devices: [], on: 0, unavailable: 0 })),
};

export interface HomeRoomDraft { id: string; name: string; slot: string; onCommand: string; offCommand: string }
export interface HomeDeviceDraft { entityId: string; name: string; roomId: string }

export interface HomeDevice {
  entityId: string; name: string; area: string; domain: 'light' | 'switch';
  state: 'on' | 'off' | 'unavailable' | 'unknown'; brightness: number;
}
export interface HomeRoom { id: string; name: string; devices: HomeDevice[]; on: number; unavailable: number }
export interface HomeState { state: string; message: string; rooms: HomeRoom[]; updatedAt: string }
export const EMPTY_HOME: HomeState = {
  state: 'loading', message: 'Leyendo tu casa…', updatedAt: '',
  rooms: [
    ['principal', 'Cuarto principal'], ['juan-rafael', 'Cuarto Juan Rafael'], ['amalia', 'Oficina Amalia'], ['oficina', 'Oficina'],
    ['comedor', 'Comedor'], ['cocina', 'Cocina'], ['sala', 'Sala'], ['balcon', 'Balcón'],
  ].map(([id, name]) => ({ id, name, devices: [], on: 0, unavailable: 0 })),
};


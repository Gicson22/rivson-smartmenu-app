export type RolTrabajador = 'dueña' | 'cocina' | 'mozo' | 'guardia' | 'caja';

export interface UsuarioTrabajador {
  id?: string;          
  nombre: string;       
  dni: string;          
  pin: string;          
  rol: RolTrabajador; 
  restaurantId: string;
  activo: boolean;      
  fechaCreacion?: string;
}

export interface SesionPersonal {
  uid: string;
  rol: RolTrabajador;
  nombre: string;
  dni: string;
  turno: string;
}
export interface TemaRestaurante {
  primaryColor: string;   
  secondaryColor: string;  
  accentColor: string;     
}

export interface Restaurante {
  id?: string;
  restaurantId: string;    
  nombreComercial: string; 
  ruc: string;             
  logoUrl: string;         
  theme: TemaRestaurante;
  estadoSuscripcion: 'activo' | 'suspendido' | 'prueba';
  fechaRegistro?: string;
}
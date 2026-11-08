export interface DetallePedido {
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
  notas?: string;
  estadoItem?: 'solicitado' | 'en_preparacion' | 'listo' | 'servido' | 'anulado';
}

export type EstadoPedido = 'pendiente' | 'en_preparacion' | 'servido' | 'pagado' | 'cancelado';
export type MetodoPago = 'efectivo' | 'yape' | 'mixto';

export interface Pedido {
  id?: string;
  numeroMesa: number;
  items: DetallePedido[];
  total: number;
  estado: EstadoPedido;
  metodoPago?: MetodoPago;
  fecha: any;
  motivoCancelacion?: string;
}

export interface Producto {
  id?: string;
  restaurantId?: string;
  nombre: string;
  descripcion: string;
  categoria: string; // 'ceviches', 'sudados', 'secos', 'jaleas', 'bebidas'
  
  // Soporte de precios múltiples o único
  precio: number; // Precio base / general (para bebidas o entradas)
  tienePorciones?: boolean;
  porciones?: {
    personal?: number;
    mediano?: number;
    familiar?: number;
  };

  imagenUrl?: string;
  disponible: boolean;
}
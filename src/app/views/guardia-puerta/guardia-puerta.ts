import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2'; // 👈 Importamos SweetAlert2

interface ItemConsumo {
  nombre: string;
  cantidad: number;
}

interface MesaMonitoreo {
  numeroMesa: number;
  cliente?: string;
  items?: ItemConsumo[];
  total?: number;
  estadoPago?: 'pendiente' | 'pagado';
  estadoMesa: 'ocupada' | 'libre';
  salidaAutorizada?: boolean;
}

@Component({
  selector: 'app-guardia-puerta',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './guardia-puerta.html',
  styleUrl: './guardia-puerta.css',
})
export class GuardiaPuerta implements OnInit {
  private router = inject(Router);

  guardiaActual: { nombre: string; dni: string; turno: string } | null = null;
  todasLasMesas: MesaMonitoreo[] = [];
  
  filtroEstado: 'todas' | 'libres' | 'ocupadas' = 'todas';
  busquedaMesa: string = '';

  mesaSeleccionadaDetalle: MesaMonitoreo | null = null;

  ngOnInit(): void {
    this.verificarSesionPersonal();
    this.cargar100Mesas();
  }

  verificarSesionPersonal(): void {
    const sesionData = localStorage.getItem('sesion_picanteria');
    if (sesionData) {
      const sesion = JSON.parse(sesionData);
      if (sesion.rol !== 'guardia') {
        Swal.fire('Acceso Denegado', '⚠️ Área exclusiva para personal de seguridad.', 'error');
        this.router.navigate(['/login']);
        return;
      }
      this.guardiaActual = sesion;
    } else {
      this.router.navigate(['/login']);
    }
  }

  cerrarTurno(): void {
    Swal.fire({
      title: '¿Cerrar Turno?',
      text: 'Tu sesión actual de guardia finalizará.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        localStorage.removeItem('sesion_picanteria');
        this.router.navigate(['/login']);
      }
    });
  }

  cargar100Mesas(): void {
    const lista: MesaMonitoreo[] = [];
    for (let i = 1; i <= 100; i++) {
      if (i === 1) {
        lista.push({
          numeroMesa: 1,
          cliente: 'Juan Pérez',
          items: [
            { nombre: 'Ceviche Mixto Tradicional', cantidad: 1 },
            { nombre: 'Jarra de Chicha Morada', cantidad: 1 }
          ],
          total: 57.00,
          estadoPago: 'pendiente',
          estadoMesa: 'ocupada',
          salidaAutorizada: false
        });
      } else if (i === 3) {
        lista.push({
          numeroMesa: 3,
          cliente: 'Gicson Rivas',
          items: [
            { nombre: 'Arroz con Pato Norteño', cantidad: 1 },
            { nombre: 'Chicharrón de Calamar', cantidad: 1 }
          ],
          total: 70.00,
          estadoPago: 'pagado',
          estadoMesa: 'ocupada',
          salidaAutorizada: false
        });
      } else {
        lista.push({
          numeroMesa: i,
          estadoMesa: 'libre'
        });
      }
    }
    this.todasLasMesas = lista;
  }

  get mesasFiltradas(): MesaMonitoreo[] {
    return this.todasLasMesas.filter(m => {
      const cumpleFiltroEstado = 
        this.filtroEstado === 'todas' ? true :
        this.filtroEstado === 'libres' ? m.estadoMesa === 'libre' :
        m.estadoMesa === 'ocupada';

      const cumpleBusqueda = this.busquedaMesa ? m.numeroMesa.toString().includes(this.busquedaMesa) : true;

      return cumpleFiltroEstado && cumpleBusqueda;
    });
  }

  get totalLibres(): number {
    return this.todasLasMesas.filter(m => m.estadoMesa === 'libre').length;
  }

  get totalOcupadas(): number {
    return this.todasLasMesas.filter(m => m.estadoMesa === 'ocupada').length;
  }

  verDetalleMesa(mesa: MesaMonitoreo): void {
    this.mesaSeleccionadaDetalle = mesa;
  }

  cerrarModalDetalle(): void {
    this.mesaSeleccionadaDetalle = null;
  }

  autorizarSalida(mesa: MesaMonitoreo): void {
    if (mesa.estadoPago === 'pagado') {
      mesa.salidaAutorizada = true;
      this.cerrarModalDetalle(); // Cerramos el modal flotante del ojito

      // Alerta fija de SweetAlert2 con botón manual de confirmación
      Swal.fire({
        icon: 'success',
        title: '¡Salida Autorizada!',
        text: `La Mesa N° ${mesa.numeroMesa} ha sido LIBERADA exitosamente y ya figura como DISPONIBLE.`,
        confirmButtonText: '¡OK! 👊',
        confirmButtonColor: '#10b981', // Verde
        allowOutsideClick: false // Obliga al guardia a presionar el botón de confirmación
      });

      // Liberamos la mesa en la data
      mesa.estadoMesa = 'libre';
      mesa.cliente = undefined;
      mesa.items = undefined;
      mesa.total = undefined;
      mesa.estadoPago = undefined;
      mesa.salidaAutorizada = false;

    } else {
      Swal.fire({
        icon: 'warning',
        title: '¡Pago Pendiente!',
        text: `La Mesa N° ${mesa.numeroMesa} aún no ha cancelado la cuenta en caja. No se puede autorizar la salida.`,
        confirmButtonText: '¡OK! 👊',
        confirmButtonColor: '#d97706', // Naranja
        allowOutsideClick: false
      });
    }
  }

}
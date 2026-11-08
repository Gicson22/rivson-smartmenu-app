import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

interface ItemConsumo {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

export interface TicketVenta {
  idTicket: string;
  numeroMesa: number;
  items: ItemConsumo[];
  total: number;
  estadoPago: 'pendiente' | 'pagado';
  horaIngreso: string;
  horaSalida?: string;
}

@Component({
  selector: 'app-caja-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './caja-admin.html',
  styleUrl: './caja-admin.css'
})
export class CajaAdmin implements OnInit {
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  cajeroActual: { nombre: string; dni: string; turno: string } | null = null;
  
  vistaActiva: 'cuentas' | 'historial' = 'cuentas';
  cuentasActivas: TicketVenta[] = [];
  historialTickets: TicketVenta[] = [];

  filtroEstado: 'todos' | 'pendiente' | 'pagado' = 'todos';
  busquedaMesaHistorial: string = '';

  displayDineroEnCaja: number = 0;
  displayPorCobrar: number = 0;
  displayTotalVenta: number = 0;

  ngOnInit(): void {
    this.verificarSesionCaja();
    this.cargarDatosPrueba();
  }

  verificarSesionCaja(): void {
    const sesionData = localStorage.getItem('sesion_picanteria');
    if (sesionData) {
      const sesion = JSON.parse(sesionData);
      if (sesion.rol !== 'caja' && sesion.rol !== 'guardia' && sesion.rol !== 'admin') {
        Swal.fire('Acceso Denegado', '⚠️ Área exclusiva para personal de caja.', 'error');
        this.router.navigate(['/login']);
        return;
      }
      this.cajeroActual = sesion;
    } else {
      this.router.navigate(['/login']);
    }
  }

  cerrarTurno(): void {
    Swal.fire({
      title: '¿Cerrar Turno de Caja?',
      text: 'Tu sesión actual finalizará.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false
    }).then((result) => {
      if (result.isConfirmed) {
        localStorage.removeItem('sesion_picanteria');
        this.router.navigate(['/login']);
      }
    });
  }

  cargarDatosPrueba(): void {
    this.cuentasActivas = [
      {
        idTicket: 'TCK-001',
        numeroMesa: 1,
        items: [
          { nombre: 'Ceviche Mixto Tradicional', cantidad: 1, precioUnitario: 45.00 },
          { nombre: 'Jarra de Chicha Morada', cantidad: 1, precioUnitario: 12.00 }
        ],
        total: 57.00,
        estadoPago: 'pendiente',
        horaIngreso: '12:15 PM'
      },
      {
        idTicket: 'TCK-002',
        numeroMesa: 3,
        items: [
          { nombre: 'Arroz con Pato Norteño', cantidad: 1, precioUnitario: 38.00 },
          { nombre: 'Chicharrón de Calamar', cantidad: 1, precioUnitario: 32.00 }
        ],
        total: 70.00,
        estadoPago: 'pagado',
        horaIngreso: '01:10 PM',
        horaSalida: '01:50 PM'
      }
    ];

    this.historialTickets = [
      {
        idTicket: 'TCK-000',
        numeroMesa: 3,
        items: [
          { nombre: 'Parihuela Especial', cantidad: 1, precioUnitario: 50.00 }
        ],
        total: 50.00,
        estadoPago: 'pagado',
        horaIngreso: '10:30 AM',
        horaSalida: '11:15 AM'
      },
      ...this.cuentasActivas.filter(t => t.estadoPago === 'pagado')
    ];

    this.animarContadores();
  }

  get totalEnCajaReal(): number {
    return this.historialTickets
      .filter(t => t.estadoPago === 'pagado')
      .reduce((acc, t) => acc + t.total, 0);
  }

  get totalPorCobrarReal(): number {
    return this.cuentasActivas
      .filter(t => t.estadoPago === 'pendiente')
      .reduce((acc, t) => acc + t.total, 0);
  }

  get totalVentaGeneralReal(): number {
    return this.totalEnCajaReal + this.totalPorCobrarReal;
  }

  animarContadores(): void {
    const objetivoCaja = this.totalEnCajaReal;
    const objetivoDeuda = this.totalPorCobrarReal;
    const objetivoTotal = this.totalVentaGeneralReal;

    const duracion = 500;
    const pasos = 15;
    const incrementoCaja = objetivoCaja / pasos;
    const incrementoDeuda = objetivoDeuda / pasos;
    const incrementoTotal = objetivoTotal / pasos;

    let pasoActual = 0;

    const intervalo = setInterval(() => {
      pasoActual++;
      if (pasoActual >= pasos) {
        this.displayDineroEnCaja = objetivoCaja;
        this.displayPorCobrar = objetivoDeuda;
        this.displayTotalVenta = objetivoTotal;
        clearInterval(intervalo);
      } else {
        this.displayDineroEnCaja += incrementoCaja;
        this.displayPorCobrar += incrementoDeuda;
        this.displayTotalVenta += incrementoTotal;
      }
      this.cdr.detectChanges();
    }, duracion / pasos);
  }

  get mesasFiltradas(): TicketVenta[] {
    if (this.filtroEstado === 'todos') return this.cuentasActivas;
    return this.cuentasActivas.filter(m => m.estadoPago === this.filtroEstado);
  }

  get historialFiltrado(): TicketVenta[] {
    if (!this.busquedaMesaHistorial) return this.historialTickets;
    return this.historialTickets.filter(t => 
      t.numeroMesa.toString().includes(this.busquedaMesaHistorial)
    );
  }

  cobrarMesa(ticket: TicketVenta): void {
    Swal.fire({
      title: `Cobrar Mesa N° ${ticket.numeroMesa}`,
      text: `Total a pagar: S/ ${ticket.total.toFixed(2)}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar Cobro 💰',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
      allowOutsideClick: false
    }).then((result) => {
      if (result.isConfirmed) {
        ticket.estadoPago = 'pagado';
        ticket.horaSalida = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (!this.historialTickets.some(h => h.idTicket === ticket.idTicket)) {
          this.historialTickets.push(ticket);
        }

        this.animarContadores();
        this.cdr.detectChanges();

        Swal.fire({
          icon: 'success',
          title: '¡Cobro Exitoso!',
          text: `La Mesa N° ${ticket.numeroMesa} ha sido PAGADA y registrada en el historial.`,
          confirmButtonText: 'Aceptar',
          confirmButtonColor: '#10b981',
          allowOutsideClick: false
        });
      }
    });
  }
}
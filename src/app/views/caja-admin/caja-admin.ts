import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import Swal from 'sweetalert2';
import { 
  Firestore, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  QuerySnapshot,
  DocumentData,
  Unsubscribe 
} from '@angular/fire/firestore';

interface ItemConsumo {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  estadoItem?: string;
  estado?: string;
}

export interface TicketVenta {
  idTicket: string;
  numeroMesa: number;
  items: ItemConsumo[];
  total: number;
  estadoPago: 'pendiente' | 'pagado';
  cajaValidada: boolean;
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
export class CajaAdmin implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private injector = inject(EnvironmentInjector);

  private unsubscribePedidos?: Unsubscribe;
  private unsubscribeRestaurante?: Unsubscribe;

  cajeroActual: { nombre: string; dni: string; turno: string } | null = null;
  restaurantId: string = 'moscu';
  nombreRestaurante: string = 'Picantería Moscú'; // 👈 Se actualizará dinámicamente desde Firestore
  restaurantIconUrl: string = ''; // 👈 Logo dinámico del local
  
  vistaActiva: 'cuentas' | 'historial' = 'cuentas';
  cuentasActivas: TicketVenta[] = [];
  historialTickets: TicketVenta[] = [];

  filtroEstado: 'pendiente' | 'por_validar' | 'pagadas' = 'pendiente';
  busquedaMesaHistorial: string = '';

  displayDineroEnCaja: number = 0;
  displayPorValidar: number = 0;
  displayPorCobrar: number = 0;
  displayTotalVenta: number = 0;

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['local']) {
        this.restaurantId = params['local'].trim().toLowerCase();
      }
    });

    this.verificarSesionCaja();
    this.cargarDatosRestaurante(); // 👈 Carga dinámica idéntica al mozo
    this.escucharPedidosCajaFirestore();
  }

  ngOnDestroy(): void {
    if (this.unsubscribePedidos) this.unsubscribePedidos();
    if (this.unsubscribeRestaurante) this.unsubscribeRestaurante();
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

  // ⚡ Carga dinámica del nombre y logo desde la colección 'restaurantes' de Firestore
  cargarDatosRestaurante(): void {
    runInInjectionContext(this.injector, () => {
      const restRef = collection(this.firestore, 'restaurantes');
      const qRest = query(restRef, where('restaurantId', '==', this.restaurantId));

      this.unsubscribeRestaurante = onSnapshot(qRest, (snapshot: QuerySnapshot<DocumentData>) => {
        if (!snapshot.empty) {
          const restData = snapshot.docs[0].data();
          this.nombreRestaurante = restData['nombre'] || restData['nombreRestaurante'] || 'Picantería Moscú';
          this.restaurantIconUrl = restData['logoUrl'] || restData['logo'] || restData['icono'] || '';
        } else {
          this.nombreRestaurante = 'Picantería Moscú';
          this.restaurantIconUrl = '';
        }
        this.cdr.detectChanges();
      });
    });
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

  escucharPedidosCajaFirestore(): void {
    runInInjectionContext(this.injector, () => {
      try {
        const pedidosRef = collection(this.firestore, 'pedidos');
        const q = query(pedidosRef, where('restaurantId', '==', this.restaurantId));

        this.unsubscribePedidos = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
          const tempActivas: TicketVenta[] = [];
          const tempHistorial: TicketVenta[] = [];

          snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            const idTicket = docSnap.id;
            const numeroMesa = Number(data['numeroMesa'] || 1);
            const estadoGlobal = data['estado'] || 'solicitado';
            const total = Number(data['total'] || 0);
            const cajaValidada = !!data['cajaValidada'];
            
            const itemsBrutos = data['items'] || [];
            const items: ItemConsumo[] = itemsBrutos.map((i: any) => ({
              nombre: i.nombre || 'Plato',
              cantidad: Number(i.cantidad || 1),
              precioUnitario: Number(i.precioSeleccionado || 0),
              estadoItem: (i.estadoItem || i.estado || '').toLowerCase()
            }));

            const horaIngreso = data['horaIngreso'] ? new Date(data['horaIngreso']).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Turno Actual';
            const horaSalida = data['horaSalida'] || (estadoGlobal === 'pagado' ? 'Cobrado' : undefined);

            const ticket: TicketVenta = {
              idTicket,
              numeroMesa,
              items,
              total,
              estadoPago: estadoGlobal === 'pagado' ? 'pagado' : 'pendiente',
              cajaValidada,
              horaIngreso,
              horaSalida
            };

            tempActivas.push(ticket);

            if (estadoGlobal === 'pagado') {
              tempHistorial.push(ticket);
            }
          });

          this.cuentasActivas = tempActivas;
          this.historialTickets = tempHistorial;

          this.animarContadores();
          this.cdr.detectChanges();
        });
      } catch (err) {
        console.error('Error escuchando pedidos en caja:', err);
      }
    });
  }

  get totalEnCajaReal(): number {
    return this.cuentasActivas
      .filter(t => t.estadoPago === 'pagado' && t.cajaValidada)
      .reduce((acc, t) => acc + t.total, 0);
  }

  get totalPorValidarReal(): number {
    return this.cuentasActivas
      .filter(t => t.estadoPago === 'pagado' && !t.cajaValidada)
      .reduce((acc, t) => acc + t.total, 0);
  }

  get totalPorCobrarReal(): number {
    return this.cuentasActivas
      .filter(t => t.estadoPago === 'pendiente')
      .reduce((acc, t) => acc + t.total, 0);
  }

  get totalVentaGeneralReal(): number {
    return this.totalEnCajaReal + this.totalPorValidarReal + this.totalPorCobrarReal;
  }

  animarContadores(): void {
    const objetivoCaja = this.totalEnCajaReal;
    const objetivoValidar = this.totalPorValidarReal;
    const objetivoDeuda = this.totalPorCobrarReal;
    const objetivoTotal = this.totalVentaGeneralReal;

    const duracion = 400;
    const pasos = 10;
    const incrementoCaja = objetivoCaja / pasos;
    const incrementoValidar = objetivoValidar / pasos;
    const incrementoDeuda = objetivoDeuda / pasos;
    const incrementoTotal = objetivoTotal / pasos;

    let pasoActual = 0;

    const intervalo = setInterval(() => {
      pasoActual++;
      if (pasoActual >= pasos) {
        this.displayDineroEnCaja = objetivoCaja;
        this.displayPorValidar = objetivoValidar;
        this.displayPorCobrar = objetivoDeuda;
        this.displayTotalVenta = objetivoTotal;
        clearInterval(intervalo);
      } else {
        this.displayDineroEnCaja += incrementoCaja;
        this.displayPorValidar += incrementoValidar;
        this.displayPorCobrar += incrementoDeuda;
        this.displayTotalVenta += incrementoTotal;
      }
      this.cdr.detectChanges();
    }, duracion / pasos);
  }

  contarFiltro(tipo: 'pendiente' | 'por_validar' | 'pagadas'): number {
    if (tipo === 'pendiente') {
      return this.cuentasActivas.filter(m => m.estadoPago === 'pendiente').length;
    } else if (tipo === 'por_validar') {
      return this.cuentasActivas.filter(m => m.estadoPago === 'pagado' && !m.cajaValidada).length;
    } else {
      return this.cuentasActivas.filter(m => m.estadoPago === 'pagado' && m.cajaValidada).length;
    }
  }

  get mesasFiltradas(): TicketVenta[] {
    if (this.filtroEstado === 'pendiente') {
      return this.cuentasActivas.filter(m => m.estadoPago === 'pendiente');
    } else if (this.filtroEstado === 'por_validar') {
      return this.cuentasActivas.filter(m => m.estadoPago === 'pagado' && !m.cajaValidada);
    } else {
      return this.cuentasActivas.filter(m => m.estadoPago === 'pagado' && m.cajaValidada);
    }
  }

  get historialFiltrado(): TicketVenta[] {
    if (!this.busquedaMesaHistorial) return this.historialTickets;
    return this.historialTickets.filter(t => 
      t.numeroMesa.toString().includes(this.busquedaMesaHistorial)
    );
  }

  async cobrarMesa(ticket: TicketVenta): Promise<void> {
    const hayPendientesDeEntrega = ticket.items.some(item => {
      const estado = (item.estadoItem || '').toLowerCase();
      return estado !== 'entregado' && estado !== 'servido' && estado !== 'despachado' && estado !== 'cancelado';
    });

    if (hayPendientesDeEntrega) {
      Swal.fire({
        icon: 'warning',
        title: `⚠️ No se puede cobrar la Mesa N° ${ticket.numeroMesa}`,
        text: 'Aún hay platos o bebidas pendientes por entregar en esta mesa. Debes verificar que todos los ítems estén entregados antes de procesar el cobro.',
        confirmButtonText: 'Entendido 👍',
        confirmButtonColor: '#f59e0b',
        background: '#0f172a',
        color: '#ffffff'
      });
      return;
    }

    const confirm = await Swal.fire({
      title: `Cobrar Mesa N° ${ticket.numeroMesa}`,
      text: `Total a pagar: S/ ${ticket.total.toFixed(2)}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar Cobro y Recibir Dinero 💰',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
      allowOutsideClick: false,
      background: '#0f172a',
      color: '#ffffff'
    });

    if (confirm.isConfirmed) {
      try {
        const pedidoRef = doc(this.firestore, 'pedidos', ticket.idTicket);
        const horaActual = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        await updateDoc(pedidoRef, {
          estado: 'pagado',
          solicitandoCobro: false,
          cajaValidada: true,
          horaSalida: horaActual
        });

        Swal.fire({
          icon: 'success',
          title: '¡Cobro Exitoso!',
          text: `La Mesa N° ${ticket.numeroMesa} ha sido cobrada y el efectivo ingresó a caja.`,
          confirmButtonText: 'Aceptar',
          confirmButtonColor: '#10b981',
          allowOutsideClick: false,
          background: '#0f172a',
          color: '#ffffff'
        });

      } catch (error) {
        console.error('Error al registrar cobro en caja:', error);
        Swal.fire('Error', 'No se pudo procesar el cobro en la base de datos.', 'error');
      }
    }
  }

  async validarEfectivoMozo(ticket: TicketVenta): Promise<void> {
    const confirm = await Swal.fire({
      title: `Validar Efectivo - Mesa N° ${ticket.numeroMesa}`,
      text: `El mozo cobró S/ ${ticket.total.toFixed(2)}. ¿Confirmas haber recibido el dinero físicamente?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, Recibí el Dinero 💵',
      cancelButtonText: 'Aún no',
      confirmButtonColor: '#059669',
      allowOutsideClick: false,
      background: '#0f172a',
      color: '#ffffff'
    });

    if (confirm.isConfirmed) {
      try {
        const pedidoRef = doc(this.firestore, 'pedidos', ticket.idTicket);
        await updateDoc(pedidoRef, {
          cajaValidada: true
        });

        Swal.fire({
          icon: 'success',
          title: '¡Efectivo Validado!',
          text: `Los S/ ${ticket.total.toFixed(2)} ya forman parte del Dinero en Caja.`,
          confirmButtonText: 'OK',
          confirmButtonColor: '#059669',
          background: '#0f172a',
          color: '#ffffff'
        });

      } catch (error) {
        console.error('Error al validar efectivo:', error);
        Swal.fire('Error', 'No se pudo validar el efectivo en la base de datos.', 'error');
      }
    }
  }
}
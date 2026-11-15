import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, EnvironmentInjector, runInInjectionContext, NgZone } from '@angular/core';
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
  QuerySnapshot,
  DocumentData,
  Unsubscribe 
} from '@angular/fire/firestore';

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
}

@Component({
  selector: 'app-guardia-puerta',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './guardia-puerta.html',
  styleUrl: './guardia-puerta.css',
})
export class GuardiaPuerta implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private injector = inject(EnvironmentInjector);

  private unsubscribePedidos?: Unsubscribe;
  private unsubscribeRestaurante?: Unsubscribe;

  guardiaActual: { nombre: string; dni: string; turno: string } | null = null;
  restaurantId: string = 'moscu';
  nombreRestaurante: string = 'Picantería Moscú';
  restaurantIconUrl: string = '';

  todasLasMesas: MesaMonitoreo[] = [];
  
  filtroEstado: 'libres' | 'ocupadas' = 'ocupadas';
  busquedaMesa: string = '';

  mesaSeleccionadaDetalle: MesaMonitoreo | null = null;

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['local']) {
        this.restaurantId = params['local'].trim().toLowerCase();
      }
    });

    this.verificarSesionPersonal();
    this.cargarDatosRestaurante();
    this.inicializar100MesasVacias();
    this.escucharPedidosPuertaFirestore();
  }

  ngOnDestroy(): void {
    if (this.unsubscribePedidos) this.unsubscribePedidos();
    if (this.unsubscribeRestaurante) this.unsubscribeRestaurante();
  }

  verificarSesionPersonal(): void {
    const sesionData = localStorage.getItem('sesion_picanteria');
    if (sesionData) {
      const sesion = JSON.parse(sesionData);
      if (sesion.rol !== 'guardia' && sesion.rol !== 'admin') {
        Swal.fire('Acceso Denegado', '⚠️ Área exclusiva para personal de seguridad.', 'error');
        this.router.navigate(['/login']);
        return;
      }
      this.guardiaActual = sesion;
    } else {
      this.router.navigate(['/login']);
    }
  }

  cargarDatosRestaurante(): void {
    runInInjectionContext(this.injector, () => {
      const restRef = collection(this.firestore, 'restaurantes');
      const qRest = query(restRef, where('restaurantId', '==', this.restaurantId));

      this.unsubscribeRestaurante = onSnapshot(qRest, (snapshot: QuerySnapshot<DocumentData>) => {
        this.ngZone.run(() => {
          if (!snapshot.empty) {
            const restData = snapshot.docs[0].data();
            this.nombreRestaurante = restData['nombre'] || restData['nombreRestaurante'] || 'Picantería Moscú';
            this.restaurantIconUrl = restData['logoUrl'] || restData['logo'] || restData['icono'] || '';
          }
          this.cdr.detectChanges();
        });
      });
    });
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

  inicializar100MesasVacias(): void {
    const lista: MesaMonitoreo[] = [];
    for (let i = 1; i <= 100; i++) {
      lista.push({
        numeroMesa: i,
        estadoMesa: 'libre'
      });
    }
    this.todasLasMesas = lista;
  }

  escucharPedidosPuertaFirestore(): void {
    runInInjectionContext(this.injector, () => {
      try {
        const pedidosRef = collection(this.firestore, 'pedidos');
        const q = query(pedidosRef, where('restaurantId', '==', this.restaurantId));

        this.unsubscribePedidos = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
          // Forzamos la ejecución dentro de NgZone para que la UI reaccione al instante
          this.ngZone.run(() => {
            this.inicializar100MesasVacias();

            snapshot.docs.forEach(docSnap => {
              const data = docSnap.data();
              const numMesa = Number(data['numeroMesa'] || 1);
              const estadoGlobal = data['estado'] || 'solicitado';
              
              // Si el pedido ya está pagado/archivado, no se muestra en puerta
              if (estadoGlobal === 'pagado') {
                return; 
              }

              const totalDoc = Number(data['total'] || 0);
              const clienteDoc = data['cliente'] || data['nombreCliente'] || 'Consumidor';
              const itemsBrutos = data['items'] || [];
              
              const items: ItemConsumo[] = itemsBrutos.map((i: any) => ({
                nombre: i.nombre || 'Plato',
                cantidad: Number(i.cantidad || 1)
              }));

              const mesaIndex = this.todasLasMesas.findIndex(m => m.numeroMesa === numMesa);
              if (mesaIndex !== -1) {
                this.todasLasMesas[mesaIndex] = {
                  numeroMesa: numMesa,
                  estadoMesa: 'ocupada',
                  cliente: clienteDoc,
                  items: items,
                  total: totalDoc,
                  estadoPago: estadoGlobal === 'pagado' ? 'pagado' : 'pendiente'
                };
              }
            });

            this.cdr.detectChanges();
          });
        });
      } catch (err) {
        console.error('Error escuchando pedidos en puerta:', err);
      }
    });
  }

  get mesasFiltradas(): MesaMonitoreo[] {
    return this.todasLasMesas.filter(m => {
      const cumpleFiltroEstado = 
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
      this.cerrarModalDetalle();
      Swal.fire({
        icon: 'success',
        title: '¡Salida Autorizada!',
        text: `La Mesa N° ${mesa.numeroMesa} ha cancelado su cuenta. Puede retirarse con seguridad.`,
        confirmButtonText: '¡OK! 👊',
        confirmButtonColor: '#10b981',
        allowOutsideClick: false
      });
    } else {
      Swal.fire({
        icon: 'warning',
        title: '⚠️ ¡Pago Pendiente!',
        text: `La Mesa N° ${mesa.numeroMesa} aún figura con deuda en el sistema. ¡No autorizar salida!`,
        confirmButtonText: 'Entendido 🛡️',
        confirmButtonColor: '#d97706',
        allowOutsideClick: false
      });
    }
  }
}
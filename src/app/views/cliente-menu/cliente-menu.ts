import { Component, OnInit, ViewChild, ElementRef, inject, ChangeDetectorRef, EnvironmentInjector, runInInjectionContext, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Firestore, collection, addDoc, query, where, onSnapshot, doc, updateDoc, getDocs, setDoc, getDoc } from '@angular/fire/firestore';
import Swal from 'sweetalert2';
import { Producto } from '../../models/pedido';

export interface ItemCarritoCliente {
  productoId: string;
  nombre: string;
  categoria: string;
  tamanioSeleccionado?: 'personal' | 'mediano' | 'familiar';
  precioSeleccionado: number;
  nivelPicante?: 'picante' | 'medio' | 'sin_aji';
  observacion?: string;
  cantidad: number;
}

export interface ItemPedidoEnviado extends ItemCarritoCliente {
  estadoItem: string; 
  destino: string;
  idDocumentoPedido: string;
}

@Component({
  selector: 'app-cliente-menu',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cliente-menu.html',
  styleUrls: ['./cliente-menu.css']
})
export class ClienteMenu implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private injector = inject(EnvironmentInjector);

  granTotalMesaVisual: number = 0;
  private animacionTotalId: any = null;
  private heartbeatInterval: any = null;
  private monitorInactividadMasterId: any = null;
  
  numeroMesa: number = 1;
  restaurantId: string = 'moscu';
  restaurantIconUrl: string = ''; 
  nombreComercialRestaurante: string = '¡Bienvenidos a mi Picantería!';
  
  sessionToken: string = '';
  sesionFinalizadaBloqueada: boolean = false;

  deviceToken: string = '';
  esMaster: boolean = false;
  private alertaAbiertaMaster: boolean = false;

  productos: Producto[] = [];
  categoriaSeleccionada: string = 'todos';
  filtroEstadoModal: string = 'solicitado';
  
  carrito: ItemCarritoCliente[] = [];
  itemsPedidoEnviado: ItemPedidoEnviado[] = [];
  mostrarModalCarrito: boolean = false;
  pedidoEnviado: boolean = false;
  cuentaSolicitada: boolean = false;

  mostrarModalOpciones: boolean = false;
  productoSeleccionado: Producto | null = null;
  tamanioSeleccionado: 'personal' | 'mediano' | 'familiar' = 'personal';
  nivelPicanteSeleccionado: 'picante' | 'medio' | 'sin_aji' = 'medio';
  observacionItem: string = '';

  @ViewChild('gridCards') gridCardsRef!: ElementRef<HTMLDivElement>;

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['mesa']) {
        this.numeroMesa = Number(params['mesa']);
      }
      if (params['local']) {
        this.restaurantId = params['local'].trim().toLowerCase();
      }
      
      this.inicializarDeviceToken();
      this.inicializarSesionUnica();
    });

    this.cargarLogoRestaurante();
    this.cargarCartaRealFirestore();
    this.escucharPedidosMesaFirestore();
    this.escucharControlMesaFirestore();
  }

  ngOnDestroy(): void {
    this.limpiarIntervalosMaster();
    this.detenerMonitorInactividad();
  }

  private limpiarIntervalosMaster(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private detenerMonitorInactividad(): void {
    if (this.monitorInactividadMasterId) {
      clearInterval(this.monitorInactividadMasterId);
      this.monitorInactividadMasterId = null;
    }
  }

  inicializarDeviceToken(): void {
    const keyDevice = `rivson_device_${this.restaurantId}_mesa_${this.numeroMesa}`;
    let token = sessionStorage.getItem(keyDevice);
    if (!token) {
      token = 'DEV-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      sessionStorage.setItem(keyDevice, token);
    }
    this.deviceToken = token;
  }

  // 👑 CONTROL DE MESA UNIVERSAL Y AUTOMÁTICO (CON VIGÍA EN VISORES)
  escucharControlMesaFirestore(): void {
    runInInjectionContext(this.injector, () => {
      try {
        const docRef = doc(this.firestore, 'sesiones_mesa', `${this.restaurantId}_mesa_${this.numeroMesa}`);
        
        onSnapshot(docRef, async (docSnap: any) => {
          const ahora = Date.now();

          if (!docSnap.exists()) {
            try {
              await setDoc(docRef, {
                restaurantId: this.restaurantId,
                numeroMesa: this.numeroMesa,
                masterToken: this.deviceToken,
                ultimoLatido: ahora,
                solicitudRelevo: { pendiente: false, solicitanteToken: '' }
              });
              this.esMaster = true;
              this.iniciarLatidoMaster(docRef);
              this.detenerMonitorInactividad();
            } catch (e) {
              console.error('Error inicializando master:', e);
            }
          } else {
            const data: any = docSnap.data();
            const masterTokenFirestore = data?.['masterToken'];
            const ultimoLatido = data?.['ultimoLatido'] || 0;
            const solicitud = data?.['solicitudRelevo'] || { pendiente: false, solicitanteToken: '' };

            const masterDesconectado = masterTokenFirestore && (ahora - ultimoLatido > 7000);

            if (!masterTokenFirestore || masterTokenFirestore === '' || masterDesconectado) {
              try {
                await updateDoc(docRef, {
                  masterToken: this.deviceToken,
                  ultimoLatido: ahora,
                  solicitudRelevo: { pendiente: false, solicitanteToken: '' }
                });
                this.esMaster = true;
                this.iniciarLatidoMaster(docRef);
                this.detenerMonitorInactividad();
              } catch (err) {
                console.error('Error al relevar master desde visor:', err);
              }
            } else if (masterTokenFirestore === this.deviceToken) {
              this.esMaster = true;
              this.iniciarLatidoMaster(docRef);
              this.detenerMonitorInactividad();

              // 🔔 DETECTAMOS SI HAY UNA SOLICITUD PENDIENTE DE OTRO DISPOSITIVO
              if (solicitud.pendiente && solicitud.solicitanteToken && solicitud.solicitanteToken !== this.deviceToken) {
                this.mostrarAlertaSolicitudRelevo(docRef, solicitud);
              }
            } else {
              this.esMaster = false;
              this.limpiarIntervalosMaster();
              
              // ⚡ ACTIVAMOS EL VIGÍA AUTOMÁTICO EN LOS VISORES
              this.iniciarMonitorInactividadMaster(docRef);
            }
          }
          this.cdr.detectChanges();
        });
      } catch (err) {
        console.error('Error escuchando control de mesa:', err);
      }
    });
  }

  mostrarAlertaSolicitudRelevo(docRef: any, solicitud: any): void {
    if (this.alertaAbiertaMaster) return;
    this.alertaAbiertaMaster = true;

    Swal.fire({
      title: '👑 Solicitud de Control de Mesa',
      text: 'Un acompañante en tu mesa desea solicitar el control para realizar pedidos.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, transferir mando ✅',
      cancelButtonText: 'Rechazar ❌',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#ef4444',
      allowOutsideClick: false,
      background: '#1e293b',
      color: '#ffffff'
    }).then(async (result) => {
      this.alertaAbiertaMaster = false;
      try {
        if (result.isConfirmed) {
          // 🚀 TRANSFERENCIA INMEDIATA DEL MANDO
          await updateDoc(docRef, {
            masterToken: solicitud.solicitanteToken,
            ultimoLatido: Date.now(),
            solicitudRelevo: { pendiente: false, solicitanteToken: '' }
          });

          // Nos quitamos el rol de Master localmente al instante
          this.esMaster = false;
          this.limpiarIntervalosMaster();
          this.iniciarMonitorInactividadMaster(docRef);
          this.cdr.detectChanges();

          Swal.fire({
            icon: 'success',
            title: '¡Mando transferido!',
            text: 'Has transferido el control de la mesa exitosamente.',
            timer: 2000,
            showConfirmButton: false
          });
        } else {
          // Si rechaza, limpiamos la solicitud pendiente en Firestore
          await updateDoc(docRef, {
            solicitudRelevo: { pendiente: false, solicitanteToken: '' }
          });
        }
      } catch (e) {
        console.error('Error al responder solicitud de relevo:', e);
        this.alertaAbiertaMaster = false;
      }
    });
  }

  // 💓 LATIDO SILENCIOSO DEL MASTER
  private iniciarLatidoMaster(docRef: any): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(async () => {
      if (this.esMaster) {
        try {
          await updateDoc(docRef, { ultimoLatido: Date.now() });
        } catch (e) {}
      }
    }, 3000);
  }

  // 👁️ VIGÍA AUTOMÁTICO DE LOS VISORES
  private iniciarMonitorInactividadMaster(docRef: any): void {
    if (this.monitorInactividadMasterId) return;

    this.monitorInactividadMasterId = setInterval(async () => {
      if (!this.esMaster) {
        runInInjectionContext(this.injector, async () => {
          try {
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              const data: any = snap.data();
              const ultimoLatido = data?.['ultimoLatido'] || 0;
              const masterToken = data?.['masterToken'];
              const ahora = Date.now();

              if (!masterToken || (ahora - ultimoLatido > 7000)) {
                await updateDoc(docRef, {
                  masterToken: this.deviceToken,
                  ultimoLatido: ahora,
                  solicitudRelevo: { pendiente: false }
                });
                this.esMaster = true;
                this.iniciarLatidoMaster(docRef);
                this.detenerMonitorInactividad();
                this.cdr.detectChanges();
              }
            }
          } catch (err) {}
        });
      }
    }, 3000);
  }

  async solicitarControlMesa(): Promise<void> {
    if (this.esMaster) return;

    try {
      const docRef = doc(this.firestore, 'sesiones_mesa', `${this.restaurantId}_mesa_${this.numeroMesa}`);
      await updateDoc(docRef, {
        solicitudRelevo: {
          pendiente: true,
          solicitanteToken: this.deviceToken
        }
      });

      Swal.fire({
        icon: 'info',
        title: 'Solicitud Enviada ⏳',
        text: 'Se ha notificado al anfitrión de tu mesa. Esperando su aprobación...',
        timer: 3000,
        showConfirmButton: false
      });
    } catch (e) {
      console.error('Error solicitando control:', e);
      Swal.fire('Error', 'No se pudo enviar la solicitud.', 'error');
    }
  }

  inicializarSesionUnica(): void {
    const keyToken = `rivson_token_${this.restaurantId}_mesa_${this.numeroMesa}`;
    const keyBloqueo = `rivson_bloqueado_${this.restaurantId}_mesa_${this.numeroMesa}`;

    localStorage.removeItem(keyBloqueo);

    let tokenGuardado = localStorage.getItem(keyToken);
    if (!tokenGuardado) {
      tokenGuardado = 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      localStorage.setItem(keyToken, tokenGuardado);
    }
    this.sessionToken = tokenGuardado;
    this.sesionFinalizadaBloqueada = false;
  }

  cargarLogoRestaurante(): void {
    runInInjectionContext(this.injector, () => {
      const restRef = collection(this.firestore, 'restaurantes');
      const qRest = query(restRef, where('restaurantId', '==', this.restaurantId));

      onSnapshot(qRest, (snapshot: any) => {
        if (!snapshot.empty) {
          const restData = snapshot.docs[0].data();
          this.restaurantIconUrl = restData['logoUrl'] || '';
          this.nombreComercialRestaurante = restData['nombreComercial'] || '¡Bienvenidos a mi Picantería!';
        } else {
          this.restaurantIconUrl = '';
          this.nombreComercialRestaurante = '¡Bienvenidos a mi Picantería!';
        }
        this.cdr.detectChanges();
      });
    });
  }

  abrirResumenMesa(): void {
    if (this.sesionFinalizadaBloqueada) {
      this.mostrarAlertaCierreCuenta();
      return;
    }
    this.mostrarModalCarrito = true;
    this.granTotalMesaVisual = 0;
    setTimeout(() => {
      this.iniciarAnimacionTotal(this.granTotalMesa);
    }, 30);
  }

  cargarCartaRealFirestore(): void {
    runInInjectionContext(this.injector, () => {
      try {
        const productosRef = collection(this.firestore, 'productos');
        const q = query(productosRef, where('restaurantId', '==', this.restaurantId));

        onSnapshot(q, (snapshot: any) => {
          this.productos = snapshot.docs.map((docSnap: any) => ({
            id: docSnap.id,
            ...docSnap.data()
          })) as Producto[];
          this.cdr.detectChanges();
        });
      } catch (err) {
        console.error('Error cargando carta en cliente:', err);
      }
    });
  }

  escucharPedidosMesaFirestore(): void {
    runInInjectionContext(this.injector, () => {
      try {
        const pedidosRef = collection(this.firestore, 'pedidos');
        const q = query(
          pedidosRef, 
          where('restaurantId', '==', this.restaurantId),
          where('numeroMesa', '==', this.numeroMesa)
        );

        onSnapshot(q, (snapshot: any) => {
          let mapaAgrupado = new Map<string, ItemPedidoEnviado>();
          let hayPedidosActivos = false;
          let miSesionFuePagada = false;
          
          snapshot.docs.forEach((docSnap: any) => {
            const data = docSnap.data();
            const estadoGlobal = data['estado'] || 'solicitado';
            const tokenDoc = data['sessionToken'] || '';

            if (estadoGlobal === 'pagado') {
              if (tokenDoc === this.sessionToken && this.sessionToken !== '') {
                miSesionFuePagada = true;
              }
              return; 
            }

            hayPedidosActivos = true;
            const items = data['items'] || [];
            const destino = data['destino'] || 'cocina';

            items.forEach((item: any) => {
              const estadoDelItem = item.estadoItem || estadoGlobal;
              const firmaItem = `${item.productoId || item.nombre}_${item.tamanioSeleccionado || 'unico'}_${item.nivelPicante || 'ninguno'}_${(item.observacion || '').trim().toLowerCase()}_${estadoDelItem}`;

              if (mapaAgrupado.has(firmaItem)) {
                const existente = mapaAgrupado.get(firmaItem)!;
                existente.cantidad += Number(item.cantidad || 1);
              } else {
                mapaAgrupado.set(firmaItem, {
                  ...item,
                  cantidad: Number(item.cantidad || 1),
                  estadoItem: estadoDelItem,
                  destino: destino,
                  idDocumentoPedido: docSnap.id
                });
              }
            });
          });

          if (miSesionFuePagada && !hayPedidosActivos && !this.sesionFinalizadaBloqueada) {
            this.ejecutarCierreYBloqueoCliente();
            return;
          }

          this.itemsPedidoEnviado = Array.from(mapaAgrupado.values());

          if (!hayPedidosActivos) {
            this.itemsPedidoEnviado = [];
            this.pedidoEnviado = false;
            this.cuentaSolicitada = false;
          } else {
            this.pedidoEnviado = true;
          }
          
          if (this.mostrarModalCarrito) {
            this.granTotalMesaVisual = this.granTotalMesa;
          }

          this.cdr.detectChanges();
        });
      } catch (err) {
        console.error('Error escuchando pedidos de mesa:', err);
      }
    });
  }

  private ejecutarCierreYBloqueoCliente(): void {
    if (this.sesionFinalizadaBloqueada) return;

    this.sesionFinalizadaBloqueada = true;
    this.carrito = [];
    this.itemsPedidoEnviado = [];
    this.mostrarModalCarrito = false;
    this.mostrarModalOpciones = false;
    this.pedidoEnviado = false;
    this.cuentaSolicitada = false;
    this.granTotalMesaVisual = 0;

    const keyToken = `rivson_token_${this.restaurantId}_mesa_${this.numeroMesa}`;
    const keyBloqueo = `rivson_bloqueado_${this.restaurantId}_mesa_${this.numeroMesa}`;
    
    localStorage.setItem(keyBloqueo, 'true');
    localStorage.removeItem(keyToken);

    this.cdr.detectChanges();
    this.mostrarAlertaCierreCuenta();
  }

  mostrarAlertaCierreCuenta(): void {
    Swal.fire({
      icon: 'success',
      title: `¡Cuenta Cancelada!`,
      html: `
        <div style="font-size: 1.05rem; color: #e2e8f0; line-height: 1.5; margin-top: 8px;">
          <p style="margin-bottom: 12px;">Muchas gracias por tu preferencia en <strong style="color: #38bdf8;">${this.nombreComercialRestaurante}</strong>.</p>
          <p style="font-size: 0.92rem; color: #94a3b8; margin-bottom: 16px;">Tu sesión en la <strong>Mesa ${this.numeroMesa}</strong> ha finalizado con éxito. ¡Esperamos verte muy pronto!</p>
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px dashed #f87171; padding: 10px; border-radius: 8px; font-size: 0.8rem; color: #f87171;">
            🔒 Esta sesión ha caducado. Para ver el menú o realizar un nuevo pedido, escanea el código QR de la mesa nuevamente.
          </div>
        </div>
      `,
      background: '#0f172a',
      color: '#ffffff',
      confirmButtonText: 'Cerrar / Salir 🚪',
      confirmButtonColor: '#ef4444',
      allowOutsideClick: false,
      allowEscapeKey: false,
      backdrop: `rgba(15, 23, 42, 0.98)`,
      customClass: {
        popup: 'alerta-pantalla-completa-cliente'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        window.close();
        document.body.innerHTML = `
          <div style="background: #0f172a; color: white; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: sans-serif; text-align: center; padding: 20px;">
            <h1 style="color: #38bdf8; margin-bottom: 10px;">¡Gracias por visitarnos!</h1>
            <p style="color: #94a3b8; max-width: 320px; font-size: 0.9rem; line-height: 1.4;">Tu cuenta en <strong>${this.nombreComercialRestaurante}</strong> ya fue pagada. Puedes cerrar esta ventana.</p>
          </div>
        `;
      }
    });
  }

  solicitarCuentaMozo(): void {
    if (this.sesionFinalizadaBloqueada) {
      this.mostrarAlertaCierreCuenta();
      return;
    }

    // ⚡ VALIDACIÓN: REVISAR SI TODOS LOS ÍTEMS ACTIVOS ESTÁN ENTREGADOS
    const hayPendientesDeEntrega = this.itemsPedidoEnviado.some(item => {
      const estado = (item.estadoItem || '').toLowerCase();
      // Si hay algún ítem que NO sea entregado, servido o despachado (es decir, solicitado, preparando o listo)
      return estado !== 'entregado' && estado !== 'servido' && estado !== 'despachado' && estado !== 'cancelado';
    });

    if (hayPendientesDeEntrega) {
      Swal.fire({
        icon: 'warning',
        title: '⚠️ No se puede pedir la cuenta aún',
        text: 'Tienes platos o bebidas pendientes por entregar en tu mesa. Por favor espera a que todo sea entregado antes de solicitar tu cuenta.',
        confirmButtonText: 'Entendido 👍',
        confirmButtonColor: '#f59e0b',
        background: '#1e293b',
        color: '#ffffff'
      });
      return; // Detenemos la ejecución aquí
    }

    // Si todo está entregado, procede con normalidad a pedir la cuenta
    Swal.fire({
      title: `¿Solicitar Cuenta - Mesa ${this.numeroMesa}?`,
      text: 'Se le notificará al mozo asignado para que se acerque a cobrar.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, solicitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#38bdf8'
    }).then(async (result) => {
      if (result.isConfirmed) {
        this.cuentaSolicitada = true;
        
        runInInjectionContext(this.injector, async () => {
          try {
            const pedidosRef = collection(this.firestore, 'pedidos');
            const q = query(
              pedidosRef, 
              where('restaurantId', '==', this.restaurantId), 
              where('numeroMesa', '==', this.numeroMesa)
            );

            const querySnapshot = await getDocs(q);
            const promesas = querySnapshot.docs.map((docSnap: any) => {
              if (docSnap.data()['estado'] !== 'pagado') {
                const ref = doc(this.firestore, 'pedidos', docSnap.id);
                return updateDoc(ref, { solicitandoCobro: true });
              }
              return Promise.resolve();
            });
            await Promise.all(promesas);

          } catch (e) {
            console.error('Error notificando cobro', e);
          }
        });

        Swal.fire({
          icon: 'success',
          title: '¡Mozo notificado!',
          text: 'Por favor espere un momento en su mesa.',
          timer: 2500,
          showConfirmButton: false
        });
      }
    });
  }

  obtenerItemsPorEstado(estado: string): ItemPedidoEnviado[] {
    if (estado === 'solicitado') {
      return this.itemsPedidoEnviado.filter(item => 
        item.estadoItem === 'solicitado' || item.estadoItem === 'pendiente_despacho'
      );
    }
    if (estado === 'preparando') {
      return this.itemsPedidoEnviado.filter(item => item.estadoItem === 'preparando');
    }
    if (estado === 'listo') {
      return this.itemsPedidoEnviado.filter(item => item.estadoItem === 'listo');
    }
    if (estado === 'entregado') {
      return this.itemsPedidoEnviado.filter(item => 
        item.estadoItem === 'entregado' || item.estadoItem === 'servido' || item.estadoItem === 'despachado'
      );
    }
    return this.itemsPedidoEnviado.filter(item => item.estadoItem === estado);
  }

  get productosFiltrados(): Producto[] {
    if (this.categoriaSeleccionada === 'todos') {
      return this.productos.filter(p => p.disponible !== false);
    }
    return this.productos.filter(p => p.categoria === this.categoriaSeleccionada && p.disponible !== false);
  }

  get itemsFiltradosModal(): ItemPedidoEnviado[] {
    return this.obtenerItemsPorEstado(this.filtroEstadoModal);
  }

  filtrarEstado(estado: string): void {
    this.filtroEstadoModal = estado;
    if (this.gridCardsRef && this.gridCardsRef.nativeElement) {
      this.gridCardsRef.nativeElement.scrollTop = 0;
    }
  }

  abrirModalOpciones(producto: Producto): void {
    if (this.sesionFinalizadaBloqueada) {
      this.mostrarAlertaCierreCuenta();
      return;
    }
    if (!this.esMaster) {
      Swal.fire({
        icon: 'warning',
        title: '👀 Modo Visor (Solo Consulta)',
        text: 'No puedes agregar platos porque no eres el anfitrión de la mesa. Puedes solicitar el control en la parte superior.',
        confirmButtonColor: '#38bdf8'
      });
      return;
    }

    this.productoSeleccionado = producto;
    this.tamanioSeleccionado = 'personal';
    this.nivelPicanteSeleccionado = 'medio';
    this.observacionItem = '';
    this.mostrarModalOpciones = true;
  }

  cerrarModalOpciones(): void {
    this.mostrarModalOpciones = false;
    this.productoSeleccionado = null;
  }

  calcularPrecioActualModal(): number {
    if (!this.productoSeleccionado) return 0;
    if (this.productoSeleccionado.tienePorciones && this.productoSeleccionado.porciones) {
      return this.productoSeleccionado.porciones[this.tamanioSeleccionado] || 0;
    }
    return this.productoSeleccionado.precio || 0;
  }

  agregarAlCarritoConOpciones(): void {
    if (!this.productoSeleccionado || this.sesionFinalizadaBloqueada || !this.esMaster) return;

    const precioUnitario = this.calcularPrecioActualModal();
    const tamanio = this.productoSeleccionado.tienePorciones ? this.tamanioSeleccionado : undefined;
    const picante = this.productoSeleccionado.categoria !== 'bebidas' ? this.nivelPicanteSeleccionado : undefined;
    const obs = this.observacionItem.trim().toLowerCase() || undefined;

    const itemExistente = this.carrito.find(i => 
      i.productoId === this.productoSeleccionado!.id &&
      i.tamanioSeleccionado === tamanio &&
      i.nivelPicante === picante &&
      (i.observacion || '').trim().toLowerCase() === (obs || '')
    );

    if (itemExistente) {
      itemExistente.cantidad += 1;
    } else {
      this.carrito.push({
        productoId: this.productoSeleccionado.id!,
        nombre: this.productoSeleccionado.nombre,
        categoria: this.productoSeleccionado.categoria,
        tamanioSeleccionado: tamanio,
        precioSeleccionado: precioUnitario,
        nivelPicante: picante,
        observacion: this.observacionItem.trim() || undefined,
        cantidad: 1
      });
    }

    this.cerrarModalOpciones();
    this.iniciarAnimacionTotal(this.granTotalMesa);

    Swal.fire({
      icon: 'success',
      title: '¡Agregado al carrito!',
      timer: 1000,
      showConfirmButton: false
    });
  }

  modificarCantidadCarrito(index: number, cambio: number): void {
    if (!this.esMaster) return;
    this.carrito[index].cantidad += cambio;
    if (this.carrito[index].cantidad <= 0) {
      this.carrito.splice(index, 1);
    }
    this.iniciarAnimacionTotal(this.granTotalMesa);
    this.cdr.detectChanges();
  }

  removerItemCarrito(index: number): void {
    if (!this.esMaster) return;
    this.carrito.splice(index, 1);
    this.iniciarAnimacionTotal(this.granTotalMesa);
    this.cdr.detectChanges();
  }

  get granTotalMesa(): number {
    const totalCarrito = this.carrito.reduce((acc, item) => acc + (item.precioSeleccionado * item.cantidad), 0);
    const totalEnviado = this.itemsPedidoEnviado.reduce((acc, item) => acc + (item.precioSeleccionado * item.cantidad), 0);
    return totalCarrito + totalEnviado;
  }

  async enviarPedidoNube(): Promise<void> {
    if (this.carrito.length === 0 || this.sesionFinalizadaBloqueada || !this.esMaster) return;

    const confirmacion = await Swal.fire({
      title: '¿Confirmar y enviar pedido?',
      text: 'Mientras tu pedido figure como "Solicitado" podrás modificarlo.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, ¡enviar!',
      cancelButtonText: 'Revisar'
    });

    if (!confirmacion.isConfirmed) return;

    runInInjectionContext(this.injector, async () => {
      try {
        const pedidosRef = collection(this.firestore, 'pedidos');
        
        const carritoLimpio = this.carrito.map(item => {
          const limpio: any = {
            productoId: item.productoId,
            nombre: item.nombre,
            categoria: item.categoria,
            precioSeleccionado: item.precioSeleccionado,
            cantidad: item.cantidad,
            estadoItem: 'solicitado'
          };
          if (item.tamanioSeleccionado) limpio.tamanioSeleccionado = item.tamanioSeleccionado;
          if (item.nivelPicante) limpio.nivelPicante = item.nivelPicante;
          if (item.observacion) limpio.observacion = item.observacion;
          return limpio;
        });

        const itemsParaCocina = carritoLimpio.filter(i => i.categoria !== 'bebidas');
        const itemsParaMozo = carritoLimpio.filter(i => i.categoria === 'bebidas');

        if (itemsParaCocina.length > 0) {
          await addDoc(pedidosRef, {
            restaurantId: this.restaurantId,
            numeroMesa: this.numeroMesa,
            sessionToken: this.sessionToken,
            destino: 'cocina',
            items: itemsParaCocina,
            total: itemsParaCocina.reduce((acc: number, i: any) => acc + (i.precioSeleccionado * i.cantidad), 0),
            estado: 'solicitado',
            fechaCreacion: new Date().toISOString()
          });
        }

        if (itemsParaMozo.length > 0) {
          await addDoc(pedidosRef, {
            restaurantId: this.restaurantId,
            numeroMesa: this.numeroMesa,
            sessionToken: this.sessionToken,
            destino: 'mozo',
            items: itemsParaMozo,
            total: itemsParaMozo.reduce((acc: number, i: any) => acc + (i.precioSeleccionado * i.cantidad), 0),
            estado: 'pendiente_despacho',
            fechaCreacion: new Date().toISOString()
          });
        }

        this.carrito = [];
        this.mostrarModalCarrito = false;
        this.cdr.detectChanges();

        Swal.fire({
          icon: 'success',
          title: '¡Pedido Enviado!',
          text: 'Los piqueos van a cocina y las bebidas al mozo.',
          confirmButtonColor: '#10b981'
        });

      } catch (err) {
        console.error('Error enviando pedido:', err);
        Swal.fire('Error', 'No se pudo enviar el pedido a la nube.', 'error');
      }
    });
  }

  private iniciarAnimacionTotal(nuevoTotal: number): void {
    const valorInicial = 0;
    const diferencia = nuevoTotal - valorInicial;
    
    if (diferencia === 0) {
      this.granTotalMesaVisual = nuevoTotal;
      return;
    }

    const duracion = 1000;
    const inicioTiempo = performance.now();

    if (this.animacionTotalId) {
      cancelAnimationFrame(this.animacionTotalId);
    }

    const animar = (tiempoActual: number) => {
      const transcurrido = tiempoActual - inicioTiempo;
      const progreso = Math.min(transcurrido / duracion, 1);
      const easeProgress = 1 - Math.pow(1 - progreso, 3);
      
      this.granTotalMesaVisual = valorInicial + (diferencia * easeProgress);
      this.cdr.detectChanges();

      if (progreso < 1) {
        this.animacionTotalId = requestAnimationFrame(animar);
      } else {
        this.granTotalMesaVisual = nuevoTotal;
        this.cdr.detectChanges();
      }
    };

    this.animacionTotalId = requestAnimationFrame(animar);
  }
}
import { Component, OnInit, ViewChild, ElementRef, inject, ChangeDetectorRef, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Firestore, collection, addDoc, query, where, onSnapshot, doc, updateDoc, getDocs } from '@angular/fire/firestore';
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
export class ClienteMenu implements OnInit {
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private injector = inject(EnvironmentInjector);

  granTotalMesaVisual: number = 0;
  private animacionTotalId: any = null;
  
  numeroMesa: number = 1;
  restaurantId: string = 'moscu';
  restaurantIconUrl: string = ''; 
  nombreComercialRestaurante: string = '¡Bienvenidos a mi Picantería!';
  
  // ⚡ CONTROL DE SESIÓN ÚNICA POR CLIENTE/TICKET
  sessionToken: string = '';
  sesionFinalizadaBloqueada: boolean = false;

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
      
      // Inicializar o validar el ticket de sesión del cliente
      this.inicializarSesionUnica();
    });

    this.cargarLogoRestaurante();
    this.cargarCartaRealFirestore();
    this.escucharPedidosMesaFirestore();
  }

  // ⚡ GENERADOR Y VALIDADOR DE TICKET ÚNICO DE MESA
  inicializarSesionUnica(): void {
    const keyToken = `rivson_token_${this.restaurantId}_mesa_${this.numeroMesa}`;
    const keyBloqueo = `rivson_bloqueado_${this.restaurantId}_mesa_${this.numeroMesa}`;

    // Si viene directamente de escanear un QR (puedes agregar ?scan=1 en tus QRs o detectar navegación fresca)
    // Si ya estaba bloqueado por cierre de cuenta, mostramos la pantalla de bloqueo inmediatamente
    if (localStorage.getItem(keyBloqueo) === 'true') {
      this.sesionFinalizadaBloqueada = true;
      this.mostrarAlertaCierreCuenta();
      return;
    }

    let tokenGuardado = localStorage.getItem(keyToken);
    if (!tokenGuardado) {
      tokenGuardado = 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      localStorage.setItem(keyToken, tokenGuardado);
    }
    this.sessionToken = tokenGuardado;
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

            // ⚡ DETECTAR SI LA CUENTA DE ESTE CLIENTE (SU TICKET) ACABA DE SER COBRADA
            if (estadoGlobal === 'pagado') {
              if (tokenDoc === this.sessionToken && this.sessionToken !== '') {
                miSesionFuePagada = true;
              }
              return; 
            }

            // Solo cargamos pedidos activos si pertenecen a la sesión actual (o si no tienen token aún)
            if (!tokenDoc || tokenDoc === this.sessionToken) {
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
            }
          });

          // ⚡ SI EL MOZO COBRÓ SU CUENTA: Bloqueamos la sesión y lanzamos la alerta gigante
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

  // ⚡ EJECUTA EL BLOQUEO DE PANTALLA Y LIMPIEZA DE SESIÓN AL PAGAR
  private ejecutarCierreYBloqueoCliente(): void {
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
    
    // Marcamos el bloqueo persistente y borramos el token viejo
    localStorage.setItem(keyBloqueo, 'true');
    localStorage.removeItem(keyToken);

    this.cdr.detectChanges();
    this.mostrarAlertaCierreCuenta();
  }

  // ⚡ ALERTA GIGANTE A PANTALLA COMPLETA DE DESPEDIDA Y BLOQUEO
  mostrarAlertaCierreCuenta(): void {
    Swal.fire({
      icon: 'success',
      title: `¡Cuenta Cancelada!`,
      html: `
        <div style="font-size: 1.05rem; color: #e2e8f0; line-height: 1.5; margin-top: 8px;">
          <p style="margin-bottom: 12px;">Muchas gracias por tu preferencia en <strong style="color: #38bdf8;">${this.nombreComercialRestaurante}</strong>.</p>
          <p style="font-size: 0.92rem; color: #94a3b8; margin-bottom: 16px;">Tu sesión en la <strong>Mesa ${this.numeroMesa}</strong> ha finalizado con éxito. ¡Esperamos verte muy pronto!</p>
          <div style="background: rgba(56, 189, 248, 0.1); border: 1px dashed #38bdf8; padding: 10px; border-radius: 8px; font-size: 0.8rem; color: #38bdf8;">
            🔒 Para realizar un nuevo consumo, por favor escanea nuevamente el código QR de tu mesa.
          </div>
        </div>
      `,
      background: '#0f172a',
      color: '#ffffff',
      confirmButtonText: 'Entendido, ¡Gracias! 👍',
      confirmButtonColor: '#10b981',
      allowOutsideClick: false,
      allowEscapeKey: false,
      backdrop: `rgba(15, 23, 42, 0.96)`,
      customClass: {
        popup: 'alerta-pantalla-completa-cliente'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        // Si le da OK, liberamos el bloqueo local por si es un nuevo cliente escaneando desde el mismo teléfono
        const keyBloqueo = `rivson_bloqueado_${this.restaurantId}_mesa_${this.numeroMesa}`;
        localStorage.removeItem(keyBloqueo);
        this.sesionFinalizadaBloqueada = false;
        
        // Generamos un nuevo token limpio por si vuelve a escanear
        this.inicializarSesionUnica();
        this.cdr.detectChanges();
      }
    });
  }

  solicitarCuentaMozo(): void {
    if (this.sesionFinalizadaBloqueada) {
      this.mostrarAlertaCierreCuenta();
      return;
    }

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
    if (!this.productoSeleccionado || this.sesionFinalizadaBloqueada) return;

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
    this.carrito[index].cantidad += cambio;
    if (this.carrito[index].cantidad <= 0) {
      this.carrito.splice(index, 1);
    }
    this.iniciarAnimacionTotal(this.granTotalMesa);
    this.cdr.detectChanges();
  }

  removerItemCarrito(index: number): void {
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
    if (this.carrito.length === 0 || this.sesionFinalizadaBloqueada) return;

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

        // ⚡ AMARRAMOS EL TOKEN DE SESIÓN AL PEDIDO EN FIRESTORE
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
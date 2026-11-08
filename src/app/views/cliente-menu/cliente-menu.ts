import { Component, OnInit, ViewChild, ElementRef, inject, ChangeDetectorRef, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Firestore, collection, addDoc, query, where, onSnapshot } from '@angular/fire/firestore';
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
  productos: Producto[] = [];
  categoriaSeleccionada: string = 'todos';
  filtroEstadoModal: string = 'todos';
  
  carrito: ItemCarritoCliente[] = [];
  itemsPedidoEnviado: ItemPedidoEnviado[] = [];
  mostrarModalCarrito: boolean = false;
  pedidoEnviado: boolean = false;

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
    });

    this.cargarCartaRealFirestore();
    this.escucharPedidosMesaFirestore();
  }

  abrirResumenMesa(): void {
    this.mostrarModalCarrito = true;
    // Seteamos el valor de inmediato para evitar que parpadee en cero
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

        onSnapshot(q, (snapshot) => {
          this.productos = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
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

        onSnapshot(q, (snapshot) => {
          let listaHistorial: ItemPedidoEnviado[] = [];
          
          snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            const items = data['items'] || [];
            const destino = data['destino'] || 'cocina';
            const estadoGlobal = data['estado'] || 'solicitado';

            items.forEach((item: any) => {
              listaHistorial.push({
                ...item,
                estadoItem: item.estadoItem || estadoGlobal,
                destino: destino
              });
            });
          });

          this.itemsPedidoEnviado = listaHistorial;
          if (this.itemsPedidoEnviado.length > 0) {
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

  get productosFiltrados(): Producto[] {
    if (this.categoriaSeleccionada === 'todos') {
      return this.productos.filter(p => p.disponible !== false);
    }
    return this.productos.filter(p => p.categoria === this.categoriaSeleccionada && p.disponible !== false);
  }

  obtenerItemsPorEstado(estado: string): ItemPedidoEnviado[] {
    if (estado === 'solicitado') {
      return this.itemsPedidoEnviado.filter(item => 
        item.estadoItem === 'solicitado' || item.estadoItem === 'pendiente_despacho'
      );
    }
    if (estado === 'entregado') {
      return this.itemsPedidoEnviado.filter(item => 
        item.estadoItem === 'entregado' || item.estadoItem === 'servido' || item.estadoItem === 'despachado'
      );
    }
    return this.itemsPedidoEnviado.filter(item => item.estadoItem === estado);
  }

  get itemsFiltradosModal(): ItemPedidoEnviado[] {
    if (this.filtroEstadoModal === 'todos') {
      return this.itemsPedidoEnviado;
    }
    return this.obtenerItemsPorEstado(this.filtroEstadoModal);
  }

  filtrarEstado(estado: string): void {
    this.filtroEstadoModal = estado;
    if (this.gridCardsRef && this.gridCardsRef.nativeElement) {
      this.gridCardsRef.nativeElement.scrollTop = 0;
    }
  }

  abrirModalOpciones(producto: Producto): void {
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
    if (!this.productoSeleccionado) return;

    const precioFinal = this.calcularPrecioActualModal();
    const tamanio = this.productoSeleccionado.tienePorciones ? this.tamanioSeleccionado : undefined;
    const picante = this.productoSeleccionado.categoria !== 'bebidas' ? this.nivelPicanteSeleccionado : undefined;
    const obs = this.observacionItem.trim() || undefined;

    const itemExistente = this.carrito.find(i => 
      i.productoId === this.productoSeleccionado!.id &&
      i.tamanioSeleccionado === tamanio &&
      i.nivelPicante === picante &&
      i.observacion === obs
    );

    if (itemExistente) {
      itemExistente.cantidad += 1;
    } else {
      this.carrito.push({
        productoId: this.productoSeleccionado.id!,
        nombre: this.productoSeleccionado.nombre,
        categoria: this.productoSeleccionado.categoria,
        tamanioSeleccionado: tamanio,
        precioSeleccionado: precioFinal,
        nivelPicante: picante,
        observacion: obs,
        cantidad: 1
      });
    }

    this.cerrarModalOpciones();
    
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
    this.cdr.detectChanges();
  }

  removerItemCarrito(index: number): void {
    this.carrito.splice(index, 1);
    this.cdr.detectChanges();
  }

  get granTotalMesa(): number {
    const totalCarrito = this.carrito.reduce((acc, item) => acc + (item.precioSeleccionado * item.cantidad), 0);
    const totalEnviado = this.itemsPedidoEnviado.reduce((acc, item) => acc + (item.precioSeleccionado * item.cantidad), 0);
    return totalCarrito + totalEnviado;
  }

  async enviarPedidoNube(): Promise<void> {
    if (this.carrito.length === 0) return;

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
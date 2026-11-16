import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, runInInjectionContext, EnvironmentInjector, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot, Unsubscribe } from '@angular/fire/firestore';
import Swal from 'sweetalert2';

import { UsuarioTrabajador, RolTrabajador } from '../../models/usuario';
import { Producto } from '../../models/pedido';
import { CloudinaryService } from '../../services/cloudinary.service';

interface MesaDuenaMonitoreo {
  numero: number;
  estado: 'libre' | 'ocupada';
  cliente?: string;
  total?: number;
  items?: { nombre: string; cantidad: number; precioSeleccionado: number }[];
}

@Component({
  selector: 'app-duenia-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './duenia-panel.html',
  styleUrl: './duenia-panel.css'
})
export class DueniaPanel implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private cloudinarySvc = inject(CloudinaryService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private injector = inject(EnvironmentInjector);

  tabActiva: 'ventas' | 'mesas-config' | 'personal' | 'carta' | 'config' | 'qr-mesas' | 'historial-cierres' = 'ventas';

  // Selector para imprimir todas o una mesa individual
  mesaSeleccionadaImpresion: string | number = 'todos';

  // Variables de control para el menú desplegable personalizado de QR
  menuQrAbierto: boolean = false;

  listaHistorialCierres: any[] = [];
  usuarios: UsuarioTrabajador[] = [];
  cargandoRegistro: boolean = false;
  
  restaurantIdActivo: string = '';
  nombreLocalActivo: string = 'Mi Picantería';
  nombreDueniaActiva: string = 'Administrador(a)';
  logoUrlActivo: string = '';

  // Configuración de mesas
  totalMesasConfiguradas: number = 30;
  inputCantidadMesas: number = 30;

  // Control para cambiar logo
  archivoLogoDuena: File | null = null;
  previewLogoDuena: string | null = null;
  cargandoLogoDuenia: boolean = false;

  nuevoNombre: string = '';
  nuevoDni: string = '';
  nuevoPin: string = '';
  nuevoRol: RolTrabajador = 'cocina';
  verPasswordNuevo: boolean = false;

  prodTienePorciones: boolean = false;
  prodPrecioPersonal: number | null = null;
  prodPrecioMediano: number | null = null;
  prodPrecioFamiliar: number | null = null;

  categoriaSeleccionada: string = 'todos';

  // Variables de Ventas & Caja y Mesas
  totalVentasCajaHoy: number = 0;
  totalPlataConMozos: number = 0;
  totalMesasLibresDuena: number = 30;
  totalMesasOcupadasDuena: number = 0;
  listaMesasDuena: MesaDuenaMonitoreo[] = [];
  ultimosCobrosDuena: { numeroMesa: number; total: number; fecha: string }[] = [];
  
  private unsubscribeFinanzas?: Unsubscribe;
  private unsubscribeRestauranteConfig?: Unsubscribe;

  // Estado de Carta
  listaProductosCarta: Producto[] = [];
  cargandoCarta: boolean = false;
  editandoProductoId: string | null = null;
  prodNombre: string = '';
  prodDescripcion: string = '';
  prodPrecio: number | null = null;
  prodCategoria: string = 'ceviches';
  prodImagenUrl: string = '';
  archivoSeleccionado: File | null = null;
  previewImagenUrl: string | null = null;
  
  private unsubscribeMenu: (() => void) | null = null;

  ngOnInit(): void {
    const sesionStr = localStorage.getItem('sesion_picanteria');
    if (sesionStr) {
      try {
        const sesion = JSON.parse(sesionStr);
        this.restaurantIdActivo = (sesion.restaurantId || '').trim().toLowerCase();
        this.nombreLocalActivo = sesion.nombreComercial || 'Mi Picantería';
        this.nombreDueniaActiva = sesion.nombre || 'Administrador(a)';
        
        if (sesion.logoUrl && sesion.logoUrl.trim() !== '') {
          this.logoUrlActivo = sesion.logoUrl;
        } else if (this.restaurantIdActivo === 'moscu') {
          this.logoUrlActivo = 'img/logo-moscu.png';
        } else {
          this.logoUrlActivo = '';
        }

      } catch (e) {
        console.error('Error al parsear datos de sesión:', e);
      }
    }

    this.cargarConfiguracionLocal();
    this.cargarTrabajadores();
    this.cargarProductosLocal();
    this.cargarHistorialCierres();
  }

  ngOnDestroy(): void {
    if (this.unsubscribeMenu) this.unsubscribeMenu();
    if (this.unsubscribeFinanzas) this.unsubscribeFinanzas();
    if (this.unsubscribeRestauranteConfig) this.unsubscribeRestauranteConfig();
  }

  cargarConfiguracionLocal(): void {
    runInInjectionContext(this.injector, () => {
      const restRef = collection(this.firestore, 'restaurantes');
      const qRest = query(restRef, where('restaurantId', '==', this.restaurantIdActivo));

      this.unsubscribeRestauranteConfig = onSnapshot(qRest, (snapshot) => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          if (data['totalMesas']) {
            this.totalMesasConfiguradas = Number(data['totalMesas']);
            this.inputCantidadMesas = this.totalMesasConfiguradas;
          }
        }
        console.log("⚙️ Configuración del local cargada - Total de mesas:", this.totalMesasConfiguradas);
        this.inicializarMesasDinamicas();
        this.escucharDatosFinancierosDuena();
        this.cdr.detectChanges();
      });
    });
  }

  async guardarCantidadMesasLocal(): Promise<void> {
    if (!this.inputCantidadMesas || this.inputCantidadMesas <= 0) {
      Swal.fire('Atención', 'Ingresa un número válido de mesas.', 'warning');
      return;
    }

    try {
      const restRef = collection(this.firestore, 'restaurantes');
      const q = query(restRef, where('restaurantId', '==', this.restaurantIdActivo));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const docId = snap.docs[0].id;
        await updateDoc(doc(this.firestore, `restaurantes/${docId}`), {
          totalMesas: Number(this.inputCantidadMesas)
        });
      }

      this.totalMesasConfiguradas = Number(this.inputCantidadMesas);
      this.inicializarMesasDinamicas();
      this.escucharDatosFinancierosDuena();

      Swal.fire({
        icon: 'success',
        title: '¡Capacidad Actualizada!',
        text: `El restaurante ahora cuenta con ${this.totalMesasConfiguradas} mesas configuradas.`,
        confirmButtonColor: '#10b981'
      });

    } catch (err) {
      console.error('Error guardando cantidad de mesas:', err);
      Swal.fire('Error', 'No se pudo actualizar la cantidad de mesas.', 'error');
    }
  }

  inicializarMesasDinamicas(): void {
    const lista: MesaDuenaMonitoreo[] = [];
    for (let i = 1; i <= this.totalMesasConfiguradas; i++) {
      lista.push({ numero: i, estado: 'libre' });
    }
    this.listaMesasDuena = lista;
    this.totalMesasLibresDuena = this.totalMesasConfiguradas;
    this.totalMesasOcupadasDuena = 0;
    console.log("📌 Mesas dinámicas inicializadas correctamente:", this.listaMesasDuena);
  }

  escucharDatosFinancierosDuena(): void {
    runInInjectionContext(this.injector, () => {
      try {
        const pedidosRef = collection(this.firestore, 'pedidos');
        const q = query(pedidosRef, where('restaurantId', '==', this.restaurantIdActivo));

        if (this.unsubscribeFinanzas) {
          this.unsubscribeFinanzas();
        }

        this.unsubscribeFinanzas = onSnapshot(q, (snapshot) => {
          let ventasCajaTurno = 0;
          let plataMozos = 0;
          const mapaMesasActivas = new Map<number, { cliente: string; total: number; items: any[] }>();
          const cobrosDelTurno: { numeroMesa: number; total: number; fecha: string }[] = [];

          snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            const estado = data['estado'] || 'solicitado';
            const numMesa = Number(data['numeroMesa'] || 1);
            const total = Number(data['total'] || 0);
            const cliente = data['cliente'] || data['nombreCliente'] || 'Consumidor';
            const items = data['items'] || [];
            
            const fechaPedidoStr = data['fechaActualizacion'] || data['fechaCreacion'] || '';

            if (estado === 'pagado') {
              // 🎯 UNIFICACIÓN TOTAL: Todos los pedidos pagados del turno actual suman tanto arriba como abajo
              ventasCajaTurno += total;

              const fechaObj = new Date(fechaPedidoStr);
              const horaCorta = !isNaN(fechaObj.getTime()) 
                ? fechaObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              cobrosDelTurno.unshift({
                numeroMesa: numMesa,
                total: total,
                fecha: horaCorta
              });
            } else {
              // Pedidos activos con los mozos (mesas ocupadas en salón)
              plataMozos += total;
              if (mapaMesasActivas.has(numMesa)) {
                const mesaExistente = mapaMesasActivas.get(numMesa)!;
                mesaExistente.total += total;
                mesaExistente.items.push(...items);
              } else {
                mapaMesasActivas.set(numMesa, { cliente, total, items });
              }
            }
          });

          // Asignar los valores sincronizados
          this.totalVentasCajaHoy = ventasCajaTurno;
          this.totalPlataConMozos = plataMozos;
          this.ultimosCobrosDuena = cobrosDelTurno; // La tabla muestra exactamente lo mismo que suma la caja

          this.inicializarMesasDinamicas();
          this.listaMesasDuena.forEach(m => {
            if (mapaMesasActivas.has(m.numero)) {
              const datosActivos = mapaMesasActivas.get(m.numero)!;
              m.estado = 'ocupada';
              m.cliente = datosActivos.cliente;
              m.total = datosActivos.total;
              m.items = datosActivos.items;
            }
          });

          this.totalMesasOcupadasDuena = mapaMesasActivas.size;
          this.totalMesasLibresDuena = this.totalMesasConfiguradas - this.totalMesasOcupadasDuena;

          this.cdr.detectChanges();
        });
      } catch (err) {
        console.error('Error escuchando finanzas para la dueña:', err);
      }
    });
  }

  // 👁️ Método sin tilde para evitar errores de compilación
  verDetalleMesaDuena(m: MesaDuenaMonitoreo): void {
    if (m.estado === 'libre') {
      Swal.fire({
        icon: 'info',
        title: `Mesa N° ${m.numero}`,
        text: 'La mesa se encuentra libre y disponible.',
        confirmButtonColor: '#3b82f6',
        background: '#0f172a',
        color: '#fff'
      });
      return;
    }

    let htmlItems = '<div style="text-align: left; background: #1e293b; padding: 10px; border-radius: 6px; font-size: 0.8rem; color: #fff; max-height: 220px; overflow-y: auto; margin-bottom: 8px;">';
    if (m.items && m.items.length > 0) {
      m.items.forEach(i => {
        const subtotal = (i.precioSeleccionado || 0) * (i.cantidad || 1);
        htmlItems += `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px; border-bottom: 1px dashed #334155; padding-bottom: 4px;">
            <div><strong style="color: #38bdf8;">${i.cantidad}x</strong> ${i.nombre}</div>
            <div style="color: #34d399; font-weight: bold;">S/ ${subtotal.toFixed(2)}</div>
          </div>
        `;
      });
    } else {
      htmlItems += '<div style="text-align: center; color: #94a3b8;">Sin ítems registrados.</div>';
    }
    htmlItems += '</div>';

    Swal.fire({
      title: `🔴 Mesa N° ${m.numero} Ocupada`,
      html: `
        <div style="text-align: left; font-size: 0.85rem; color: #cbd5e1;">
          <p style="margin: 0 0 8px 0;"><strong>Cliente / Responsable:</strong> <span style="color: #38bdf8;">${m.cliente || 'Consumidor'}</span></p>
          <p style="margin: 0 0 6px 0; font-size: 0.78rem; color: #94a3b8;">Consumo actual:</p>
          ${htmlItems}
          <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(56, 189, 248, 0.1); border: 1px solid #38bdf8; padding: 8px; border-radius: 6px; font-weight:bold; color:#38bdf8; font-size: 0.95rem;">
            <span>TOTAL CONSUMO:</span>
            <span>S/ ${(m.total || 0).toFixed(2)}</span>
          </div>
        </div>
      `,
      confirmButtonText: 'Entendido 👍',
      confirmButtonColor: '#3b82f6',
      background: '#0f172a',
      color: '#fff',
      width: '400px'
    });
  }

  obtenerTextoTipo(categoria: string): { singular: string, articulo: string, articuloMayusc: string } {
    const esBebida = categoria === 'bebidas';
    return {
      singular: esBebida ? 'bebida' : 'plato',
      articulo: esBebida ? 'la' : 'el',
      articuloMayusc: esBebida ? 'La' : 'El'
    };
  }

  seleccionarLogoDuena(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.archivoLogoDuena = file;
      const reader = new FileReader();
      reader.onload = () => {
        this.previewLogoDuena = reader.result as string;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  async guardarNuevoLogoDuena(): Promise<void> {
    if (!this.archivoLogoDuena) {
      Swal.fire('Aviso', 'Selecciona una imagen primero.', 'warning');
      return;
    }

    this.cargandoLogoDuenia = true;
    this.cdr.detectChanges();

    runInInjectionContext(this.injector, async () => {
      try {
        const nuevaUrlLogo = await this.cloudinarySvc.subirImagen(
          this.archivoLogoDuena!, 
          `rivson_smartmenu/logos/${this.restaurantIdActivo}`
        );

        const restaurantesRef = collection(this.firestore, 'restaurantes');
        const q = query(restaurantesRef, where('restaurantId', '==', this.restaurantIdActivo));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const docId = snap.docs[0].id;
          const docRef = doc(this.firestore, `restaurantes/${docId}`);
          await updateDoc(docRef, { logoUrl: nuevaUrlLogo });
        }

        const sesionStr = localStorage.getItem('sesion_picanteria');
        if (sesionStr) {
          const sesion = JSON.parse(sesionStr);
          sesion.logoUrl = nuevaUrlLogo;
          localStorage.setItem('sesion_picanteria', JSON.stringify(sesion));
        }

        this.logoUrlActivo = nuevaUrlLogo;
        this.archivoLogoDuena = null;
        this.previewLogoDuena = null;

        Swal.fire({
          icon: 'success',
          title: '¡Logo Actualizado!',
          text: 'El nuevo logotipo ya se muestra en todo el sistema.',
          confirmButtonColor: '#10b981'
        });

      } catch (err) {
        console.error('Error actualizando logo:', err);
        Swal.fire('Error', 'No se pudo actualizar el logo.', 'error');
      } finally {
        this.cargandoLogoDuenia = false;
        this.cdr.detectChanges();
      }
    });
  }

  seleccionarImagen(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.archivoSeleccionado = file;
      const reader = new FileReader();
      reader.onload = () => {
        this.previewImagenUrl = reader.result as string;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  async subirImagenACloudinary(): Promise<string> {
    if (!this.archivoSeleccionado) {
      return this.prodImagenUrl || 'assets/img/plato-default.png';
    }

    return await this.cloudinarySvc.subirImagen(
      this.archivoSeleccionado, 
      `rivson_smartmenu/productos/${this.restaurantIdActivo}`
    );
  }

  cargarProductosLocal(): void {
    runInInjectionContext(this.injector, () => {
      try {
        const productosRef = collection(this.firestore, 'productos');
        const idLocal = (this.restaurantIdActivo || '').trim().toLowerCase();
        const q = query(productosRef, where('restaurantId', '==', idLocal));

        if (this.unsubscribeMenu) {
          this.unsubscribeMenu();
        }

        this.unsubscribeMenu = onSnapshot(q, (snapshot) => {
          this.listaProductosCarta = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Producto[];
          this.cdr.detectChanges();
        });

      } catch (err) {
        console.error('Error cargando carta:', err);
      }
    });
  }

  async guardarProductoCarta(): Promise<void> {
    const tipo = this.obtenerTextoTipo(this.prodCategoria);

    if (!this.prodNombre.trim()) {
      Swal.fire('Atención', `Ingresa el nombre de ${tipo.articulo} ${tipo.singular}.`, 'warning');
      return;
    }

    if (this.prodTienePorciones) {
      if (!this.prodPrecioPersonal || this.prodPrecioPersonal <= 0) {
        Swal.fire('Atención', 'Ingresa un precio válido para la porción Personal.', 'warning');
        return;
      }
    } else {
      if (this.prodPrecio === null || this.prodPrecio <= 0) {
        Swal.fire('Atención', 'Ingresa un precio base válido mayor a 0.', 'warning');
        return;
      }
    }

    this.cargandoCarta = true;
    this.cdr.detectChanges();

    runInInjectionContext(this.injector, async () => {
      try {
        const urlFinalImagen = await this.subirImagenACloudinary();
        const productosRef = collection(this.firestore, 'productos');
        
        const datosProducto = {
          restaurantId: this.restaurantIdActivo,
          nombre: this.prodNombre.trim(),
          descripcion: this.prodDescripcion.trim(),
          precio: this.prodTienePorciones ? Number(this.prodPrecioPersonal) : Number(this.prodPrecio),
          tienePorciones: this.prodTienePorciones,
          porciones: this.prodTienePorciones ? {
            personal: Number(this.prodPrecioPersonal),
            mediano: Number(this.prodPrecioMediano || 0),
            familiar: Number(this.prodPrecioFamiliar || 0)
          } : null,
          categoria: this.prodCategoria,
          imagenUrl: urlFinalImagen,
          disponible: true
        };

        if (this.editandoProductoId) {
          const docRef = doc(this.firestore, `productos/${this.editandoProductoId}`);
          await updateDoc(docRef, datosProducto);
          
          this.cargandoCarta = false;
          this.cdr.detectChanges();

          Swal.fire({
            icon: 'success',
            title: `¡${tipo.singular.charAt(0).toUpperCase() + tipo.singular.slice(1)} Actualizado(a)!`,
            text: `Cambios guardados en ${tipo.articulo} ${tipo.singular} de la carta.`,
            confirmButtonColor: '#10b981',
            confirmButtonText: 'Aceptar'
          });
        } else {
          await addDoc(productosRef, datosProducto);

          this.cargandoCarta = false;
          this.cdr.detectChanges();

          Swal.fire({
            icon: 'success',
            title: `¡${tipo.singular.charAt(0).toUpperCase() + tipo.singular.slice(1)} Agregado(a)!`,
            text: `Nuevo(a) ${tipo.singular} disponible en la carta digital.`,
            confirmButtonColor: '#10b981',
            confirmButtonText: 'Aceptar'
          });
        }

        this.limpiarFormularioCarta();

      } catch (err) {
        console.error('Error guardando ítem:', err);
        this.cargandoCarta = false;
        this.cdr.detectChanges();
        Swal.fire('Error', `No se pudo guardar ${tipo.articulo} ${tipo.singular} en la base de datos.`, 'error');
      } finally {
        this.cargandoCarta = false;
        this.cdr.detectChanges();
      }
    });
  }

  prepararEdicionProducto(p: Producto): void {
    this.editandoProductoId = p.id || null;
    this.prodNombre = p.nombre || '';
    this.prodDescripcion = p.descripcion || '';
    this.prodTienePorciones = p.tienePorciones || false;
    this.prodPrecio = p.precio ?? 0;
    this.prodPrecioPersonal = p.porciones?.personal || null;
    this.prodPrecioMediano = p.porciones?.mediano || null;
    this.prodPrecioFamiliar = p.porciones?.familiar || null;
    this.prodCategoria = p.categoria || 'ceviches';
    this.prodImagenUrl = p.imagenUrl || '';
    this.previewImagenUrl = p.imagenUrl || null;
    this.archivoSeleccionado = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  limpiarFormularioCarta(): void {
    this.editandoProductoId = null;
    this.prodNombre = '';
    this.prodDescripcion = '';
    this.prodPrecio = null;
    this.prodTienePorciones = false;
    this.prodPrecioPersonal = null;
    this.prodPrecioMediano = null;
    this.prodPrecioFamiliar = null;
    this.prodCategoria = 'ceviches';
    this.prodImagenUrl = '';
    this.archivoSeleccionado = null;
    this.previewImagenUrl = null;
    this.cargandoCarta = false;
    this.cdr.detectChanges();
  }

  async eliminarProductoCarta(producto: Producto): Promise<void> {
    if (!producto.id) return;

    const tipo = this.obtenerTextoTipo(producto.categoria || 'ceviches');

    const res = await Swal.fire({
      title: `¿Eliminar ${tipo.singular} de la carta?`,
      text: `Los clientes ya no podrán visualizar ${tipo.articulo} ni pedir${tipo.articulo === 'la' ? 'la' : 'lo'}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444'
    });

    if (res.isConfirmed) {
      runInInjectionContext(this.injector, async () => {
        try {
          await deleteDoc(doc(this.firestore, `productos/${producto.id}`));
          Swal.fire({
            icon: 'success',
            title: 'Eliminado',
            text: `${tipo.articuloMayusc} ${tipo.singular} fue retirado(a) de la carta.`,
            timer: 1500,
            showConfirmButton: false
          });
        } catch (e) {
          Swal.fire('Error', `No se pudo eliminar ${tipo.articulo} ${tipo.singular}.`, 'error');
        }
      });
    }
  }

  filtrarProductosPorCategoria(): Producto[] {
    if (this.categoriaSeleccionada === 'todos') {
      return this.listaProductosCarta;
    }
    return this.listaProductosCarta.filter(p => p.categoria === this.categoriaSeleccionada);
  }

  toggleVerPasswordNuevo(): void { this.verPasswordNuevo = !this.verPasswordNuevo; }
  limpiarCampoNombre(input: HTMLInputElement): void { this.nuevoNombre = ''; input.focus(); }
  limpiarCampoDni(input: HTMLInputElement): void { this.nuevoDni = ''; input.focus(); }
  limpiarCampoPin(input: HTMLInputElement): void { this.nuevoPin = ''; input.focus(); }

  async cargarTrabajadores(): Promise<void> {
    runInInjectionContext(this.injector, async () => {
      try {
        const usuariosRef = collection(this.firestore, 'usuarios');
        const q = query(usuariosRef, where('restaurantId', '==', this.restaurantIdActivo));
        const querySnapshot = await getDocs(q);
        this.usuarios = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UsuarioTrabajador[];
        this.cdr.detectChanges();
      } catch (err) { console.error(err); }
    });
  }

  async registrarTrabajador(): Promise<void> {
    if (!this.nuevoNombre.trim() || !this.nuevoDni.trim() || !this.nuevoPin.trim()) {
      Swal.fire('Campos Incompletos', 'Completa Nombre, DNI y PIN.', 'warning');
      return;
    }
    this.cargandoRegistro = true;
    this.cdr.detectChanges();

    runInInjectionContext(this.injector, async () => {
      try {
        const usuariosRef = collection(this.firestore, 'usuarios');
        const docRef = await addDoc(usuariosRef, {
          nombre: this.nuevoNombre.trim(),
          dni: this.nuevoDni.trim(),
          pin: this.nuevoPin.trim(),
          rol: this.nuevoRol,
          restaurantId: this.restaurantIdActivo,
          activo: true,
          fechaCreacion: new Date().toISOString()
        });

        this.usuarios.push({
          id: docRef.id,
          nombre: this.nuevoNombre.trim(),
          dni: this.nuevoDni.trim(),
          pin: this.nuevoPin.trim(),
          rol: this.nuevoRol,
          restaurantId: this.restaurantIdActivo,
          activo: true
        });

        this.nuevoNombre = '';
        this.nuevoDni = '';
        this.nuevoPin = '';
        this.nuevoRol = 'cocina';
        this.cargandoRegistro = false;
        this.cdr.detectChanges();

        Swal.fire('¡Perfil Creado!', 'Trabajador registrado.', 'success');
      } catch (error) {
        this.cargandoRegistro = false;
        this.cdr.detectChanges();
        Swal.fire('Error', 'No se pudo registrar.', 'error');
      }
    });
  }

  async cambiarEstadoActivo(user: UsuarioTrabajador): Promise<void> {
    if (!user.id) return;
    const nuevoEstado = !user.activo;
    const res = await Swal.fire({
      title: `¿Deseas ${nuevoEstado ? 'reactivar' : 'dar de baja'} a ${user.nombre}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: nuevoEstado ? '#10b981' : '#ef4444'
    });

    if (res.isConfirmed) {
      runInInjectionContext(this.injector, async () => {
        try {
          await updateDoc(doc(this.firestore, `usuarios/${user.id}`), { activo: nuevoEstado });
          user.activo = nuevoEstado;
          this.cdr.detectChanges();
          Swal.fire('Actualizado', 'Estado modificado con éxito.', 'success');
        } catch (e) {
          Swal.fire('Error', 'No se pudo actualizar.', 'error');
        }
      });
    }
  }

  cancelarImagenSeleccionada(): void {
    this.archivoSeleccionado = null;
    this.previewImagenUrl = this.editandoProductoId ? this.prodImagenUrl : null;
    
    const inputElement = document.getElementById('filePlatoCarta') as HTMLInputElement;
    if (inputElement) {
      inputElement.value = '';
    }
    
    this.cdr.detectChanges();
  }

  cerrarSesion(): void {
    localStorage.removeItem('sesion_picanteria');
    this.router.navigate(['/login']);
  }

  // 🧮 Calcular la suma total de las cuentas cobradas visibles
  calcularSumaCobrosVisibles(): number {
    if (!this.ultimosCobrosDuena || this.ultimosCobrosDuena.length === 0) return 0;
    return this.ultimosCobrosDuena.reduce((acc, curr) => acc + (curr.total || 0), 0);
  }

  // 🔒 Método con alerta limpia cuando la caja está en ceros
  async confirmarCierreDeCaja(): Promise<void> {
    const totalActual = this.totalVentasCajaHoy;

    // 🛑 VALIDACIÓN AMIGABLE: Si todo está en ceros y no hay cobros, lanzamos el SweetAlert explicativo
    if (this.totalVentasCajaHoy === 0 && this.totalPlataConMozos === 0 && this.ultimosCobrosDuena.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'ℹ️ No hay consumos en el día',
        text: 'Actualmente no se registran ventas ni cobros activos en este turno para realizar un cierre de caja.',
        confirmButtonColor: '#3b82f6',
        background: '#1e293b',
        color: '#ffffff'
      });
      return; // Frenamos aquí y no ejecutamos más
    }

    runInInjectionContext(this.injector, async () => {
      try {
        const pedidosRef = collection(this.firestore, 'pedidos');
        const qActivos = query(pedidosRef, where('restaurantId', '==', this.restaurantIdActivo));
        const snapshotActivos = await getDocs(qActivos);

        let hayPendientes = false;
        snapshotActivos.docs.forEach(docSnap => {
          const data = docSnap.data();
          const estado = data['estado'];
          const cajaValidada = data['cajaValidada'];

          if (
            (estado && estado !== 'pagado' && estado !== 'archivado_caja') || 
            (cajaValidada === false) || 
            (estado === 'por_validar')
          ) {
            hayPendientes = true;
          }
        });

        if (hayPendientes) {
          Swal.fire({
            icon: 'error',
            title: '❌ No se puede cerrar caja',
            text: 'Todavía hay cuentas pendientes por validar en el módulo de caja, mesas ocupadas o pedidos en curso. El cajero debe validar todo antes de cerrar el turno.',
            confirmButtonColor: '#ef4444',
            background: '#1e293b',
            color: '#fff'
          });
          return;
        }

        const res = await Swal.fire({
          title: '🔒 ¿Cerrar caja y finalizar turno?',
          html: `
            <div style="text-align: left; font-size: 0.82rem; color: #cbd5e1; background: #0f172a; padding: 12px; border-radius: 8px; border: 1px solid #334155;">
              <p style="margin: 0 0 6px 0;">Todas las cuentas han sido validadas por el cajero y el local está al día. Estás a punto de cerrar caja con un acumulado de:</p>
              <p style="font-size: 1.2rem; font-weight: 800; color: #34d399; margin: 0 0 10px 0; text-align: center;">S/ ${totalActual.toFixed(2)}</p>
              <p style="margin: 0; font-size: 0.72rem; color: #94a3b8;">⚠️ Al confirmar, se guardará el respaldo histórico, se limpiarán los pedidos pagados y todo el sistema quedará en ceros para el siguiente turno.</p>
            </div>
          `,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, cerrar caja y limpiar',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#10b981',
          cancelButtonColor: '#ef4444',
          background: '#1e293b',
          color: '#fff'
        });

        if (res.isConfirmed) {
          Swal.fire({
            title: 'Procesando cierre...',
            text: 'Guardando respaldo y limpiando pedidos de la base de datos.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); },
            background: '#1e293b',
            color: '#fff'
          });

          const historialRef = collection(this.firestore, 'cierres_caja');
          await addDoc(historialRef, {
            restaurantId: this.restaurantIdActivo,
            fechaCierre: new Date().toISOString(),
            responsable: this.nombreDueniaActiva,
            totalRecaudado: totalActual,
            cantidadTickets: this.ultimosCobrosDuena.length
          });

          const qPagados = query(pedidosRef, where('restaurantId', '==', this.restaurantIdActivo), where('estado', '==', 'pagado'));
          const snapshotPagados = await getDocs(qPagados);

          const promesasEliminacion = snapshotPagados.docs.map(docSnap => {
            const pedidoDocRef = doc(this.firestore, `pedidos/${docSnap.id}`);
            return deleteDoc(pedidoDocRef);
          });

          await Promise.all(promesasEliminacion);

          Swal.fire({
            icon: 'success',
            title: '¡Caja Cerrada y Limpia!',
            text: 'El turno se cerró con éxito, el respaldo se guardó en historiales y la tabla de pedidos quedó en cero.',
            confirmButtonColor: '#10b981',
            background: '#1e293b',
            color: '#fff'
          });
        }

      } catch (err) {
        console.error('Error al cerrar caja:', err);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo completar el cierre de caja. Inténtalo de nuevo.',
          confirmButtonColor: '#ef4444',
          background: '#1e293b',
          color: '#fff'
        });
      }
    });
  }

  filtrarMesasParaImprimir() {
    if (!this.mesaSeleccionadaImpresion || this.mesaSeleccionadaImpresion === 'todos' || this.mesaSeleccionadaImpresion === '') {
      return this.listaMesasDuena;
    }
    return this.listaMesasDuena.filter(m => m.numero === Number(this.mesaSeleccionadaImpresion));
  }

  imprimirQrsMesas(): void {
    // Cambiar temporalmente el título de la página para que el PDF se guarde con un nombre comercial limpio
    const tituloOriginal = document.title;
    document.title = `QR_Mesas_${this.nombreLocalActivo.replace(/\s+/g, '_')}`;

    window.print(); // Abre el diálogo nativo de impresión / guardar como PDF

    // Restaurar el título original de la aplicación tras un breve instante
    setTimeout(() => {
      document.title = tituloOriginal;
    }, 1000);
  }

  toggleMenuQr(event: Event): void {
    event.stopPropagation();
    this.menuQrAbierto = !this.menuQrAbierto;
  }

  seleccionarOpcionQr(valor: string | number): void {
    this.mesaSeleccionadaImpresion = valor;
    this.menuQrAbierto = false;
  }

  obtenerTextoSeleccionadoQr(): string {
    if (this.mesaSeleccionadaImpresion === 'todos' || !this.mesaSeleccionadaImpresion) {
      return '📋 Todas las Mesas';
    }
    return `Mesa N° ${this.mesaSeleccionadaImpresion}`;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.menuQrAbierto) {
      this.menuQrAbierto = false;
      this.cdr.detectChanges();
    }
  }

  async cargarHistorialCierres(): Promise<void> {
  runInInjectionContext(this.injector, async () => {
    try {
      const cierresRef = collection(this.firestore, 'cierres_caja');
      const q = query(cierresRef, where('restaurantId', '==', this.restaurantIdActivo));
      const snapshot = await getDocs(q);

      this.listaHistorialCierres = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      this.listaHistorialCierres.sort((a, b) => new Date(b.fechaCierre).getTime() - new Date(a.fechaCierre).getTime());
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error cargando historial de cierres:', err);
    }
  });
}

formatFechaCierre(isoStr: string): string {
  const d = new Date(isoStr);
  return !isNaN(d.getTime()) ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : isoStr;
}

obtenerUrlCodificadaMesa(numeroMesa: number): string {
    const urlDestino = `https://rivson-smartmenu-app.vercel.app/cliente?local=${this.restaurantIdActivo}&mesa=${numeroMesa}`;
    return encodeURIComponent(urlDestino);
  }
}
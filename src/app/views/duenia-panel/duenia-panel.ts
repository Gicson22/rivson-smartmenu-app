import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, runInInjectionContext, EnvironmentInjector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot } from '@angular/fire/firestore';
import Swal from 'sweetalert2';

import { UsuarioTrabajador, RolTrabajador } from '../../models/usuario';
import { Producto } from '../../models/pedido';
import { CloudinaryService } from '../../services/cloudinary.service';

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

  tabActiva: 'personal' | 'carta' | 'config' = 'personal';

  usuarios: UsuarioTrabajador[] = [];
  cargandoRegistro: boolean = false;
  
  restaurantIdActivo: string = '';
  nombreLocalActivo: string = 'Mi Picantería';
  nombreDueniaActiva: string = 'Administrador(a)';
  logoUrlActivo: string = '';

  // Control para cambiar logo de la dueña
  archivoLogoDuena: File | null = null;
  previewLogoDuena: string | null = null;
  cargandoLogoDuenia: boolean = false;

  nuevoNombre: string = '';
  nuevoDni: string = '';
  nuevoPin: string = '';
  nuevoRol: RolTrabajador = 'cocina';
  verPasswordNuevo: boolean = false;

  // Nuevas variables para porciones múltiples estilo El Moscú
  prodTienePorciones: boolean = false;
  prodPrecioPersonal: number | null = null;
  prodPrecioMediano: number | null = null;
  prodPrecioFamiliar: number | null = null;

  // Filtro por categoría en la vista de la dueña
  categoriaSeleccionada: string = 'todos';

  // 🍲 Estado de Carta y Subida de Archivo
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

    this.cargarTrabajadores();
    this.cargarProductosLocal();
  }

  ngOnDestroy(): void {
    if (this.unsubscribeMenu) {
      this.unsubscribeMenu();
    }
  }

  // 💡 Obtener texto dinámico inteligente (Plato o Bebida)
  obtenerTextoTipo(categoria: string): { singular: string, articulo: string, articuloMayusc: string } {
    const esBebida = categoria === 'bebidas';
    return {
      singular: esBebida ? 'bebida' : 'plato',
      articulo: esBebida ? 'la' : 'el',
      articuloMayusc: esBebida ? 'La' : 'El'
    };
  }

  // 📸 Capturar imagen local para el logo de la dueña
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

  // ☁️ Actualizar el logo del restaurante en Cloudinary y Firestore
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

  // 📸 Capturar imagen local para previsualización de platos
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

  // ☁️ Subir la foto real del plato directamente a Cloudinary
  async subirImagenACloudinary(): Promise<string> {
    if (!this.archivoSeleccionado) {
      return this.prodImagenUrl || 'assets/img/plato-default.png';
    }

    return await this.cloudinarySvc.subirImagen(
      this.archivoSeleccionado, 
      `rivson_smartmenu/productos/${this.restaurantIdActivo}`
    );
  }

  // 🍲 Cargar productos en tiempo real con onSnapshot
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

  // Guardar o Actualizar Plato o Bebida con mensajes y estado de carga limpios
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

    // ⏳ Activamos el estado de carga (el botón cambia de texto y se deshabilita)
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
          
          // 🛑 Apagamos el estado de carga antes de mostrar la alerta
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

          // 🛑 Apagamos el estado de carga antes de mostrar la alerta
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

  // Eliminar producto con mensajes verídicos (Plato o Bebida)
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

  // Filtrar productos por categoría seleccionada en el Navbar de la Dueña
  filtrarProductosPorCategoria(): Producto[] {
    if (this.categoriaSeleccionada === 'todos') {
      return this.listaProductosCarta;
    }
    return this.listaProductosCarta.filter(p => p.categoria === this.categoriaSeleccionada);
  }

  // ================= MÉTODOS DE PERSONAL =================
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

  // 🗑️ Cancelar la selección de la imagen para el plato o bebida
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
}
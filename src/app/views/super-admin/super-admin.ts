import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, runInInjectionContext, EnvironmentInjector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, collection, getDocs, addDoc, doc, updateDoc } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

import { Restaurante } from '../../models/restaurante';
import { CloudinaryService } from '../../services/cloudinary.service'; // 👈 Tu servicio de Cloudinary

@Component({
  selector: 'app-super-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './super-admin.html',
  styleUrl: './super-admin.css'
})
export class SuperAdmin implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private cloudinarySvc = inject(CloudinaryService); // 👈 Inyectamos el servicio aquí
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private injector = inject(EnvironmentInjector);

  restaurantes: Restaurante[] = [];
  private subRestaurantes?: Subscription;

  // Formulario de Alta
  nuevoRestaurantId: string = '';
  nuevoNombreComercial: string = '';
  nuevoRuc: string = '';
  primaryColor: string = '#f59e0b';
  secondaryColor: string = '#1e293b';

  // Control de Imagen de Logo
  archivoLogo: File | null = null;
  previewLogoUrl: string | null = null;
  cargandoAlta: boolean = false;

  // Datos Dueña
  nombreDuenia: string = '';
  dniDuenia: string = '';
  pinDuenia: string = '';
  verPasswordDuenia: boolean = false;

  ngOnInit(): void {
    console.log('🚀 Iniciando SuperAdmin y cargando restaurantes...');
    runInInjectionContext(this.injector, async () => {
      try {
        const restaurantesRef = collection(this.firestore, 'restaurantes');
        const querySnapshot = await getDocs(restaurantesRef);
        this.restaurantes = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Restaurante[];

        this.cdr.detectChanges();
      } catch (e) {
        console.error('❌ Error al cargar restaurantes desde Firestore:', e);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.subRestaurantes) {
      this.subRestaurantes.unsubscribe();
    }
  }

  // 📸 Captura el archivo seleccionado y genera la vista previa local
  seleccionarLogo(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.archivoLogo = file;
      const reader = new FileReader();
      reader.onload = () => {
        this.previewLogoUrl = reader.result as string;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  async registrarNuevaPicanteria(): Promise<void> {
    if (!this.nuevoRestaurantId.trim() || !this.nuevoNombreComercial.trim() || !this.nombreDuenia.trim() || !this.dniDuenia.trim() || !this.pinDuenia.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos Incompletos',
        text: 'Completa todos los campos obligatorios.',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    const idLimpio = this.nuevoRestaurantId.trim().toLowerCase().replace(/\s+/g, '-');
    const existe = this.restaurantes.some(r => r.restaurantId === idLimpio);
    if (existe) {
      Swal.fire({
        icon: 'error',
        title: 'ID Duplicado',
        text: `El ID '${idLimpio}' ya está registrado.`,
        confirmButtonText: 'Revisar',
        confirmButtonColor: '#ef4444'
      });
      return;
    }

    this.cargandoAlta = true;
    this.cdr.detectChanges();

    runInInjectionContext(this.injector, async () => {
      try {
        // 1. Subir logo a Cloudinary (organizado en su carpeta de logos)
        let logoUrlFinal = 'img/logo-moscu.png';
        if (this.archivoLogo) {
          logoUrlFinal = await this.cloudinarySvc.subirImagen(this.archivoLogo, `rivson_smartmenu/logos/${idLimpio}`);
        }

        // 2. Guardar en Firestore con la URL directa y limpia de Cloudinary
        const restaurantesRef = collection(this.firestore, 'restaurantes');
        const docRefRestaurante = await addDoc(restaurantesRef, {
          restaurantId: idLimpio,
          nombreComercial: this.nuevoNombreComercial.trim(),
          ruc: this.nuevoRuc.trim(),
          logoUrl: logoUrlFinal,
          theme: {
            primaryColor: this.primaryColor || '#f59e0b',
            secondaryColor: this.secondaryColor || '#1e293b',
            accentColor: '#10b981'
          },
          estadoSuscripcion: 'activo',
          fechaRegistro: new Date().toISOString()
        });

        // 3. Crear cuenta de la dueña en Firestore
        const usuariosRef = collection(this.firestore, 'usuarios');
        await addDoc(usuariosRef, {
          nombre: this.nombreDuenia.trim(),
          dni: this.dniDuenia.trim(),
          pin: this.pinDuenia.trim(),
          rol: 'dueña',
          restaurantId: idLimpio,
          activo: true,
          fechaCreacion: new Date().toISOString()
        });

        await Swal.fire({
          icon: 'success',
          title: '¡Picantería Aprobada!',
          text: `Se registró '${this.nuevoNombreComercial}' con su logo en Cloudinary y el acceso de la dueña.`,
          confirmButtonText: 'Aceptar',
          confirmButtonColor: '#10b981',
          allowOutsideClick: false
        });

        // 4. Inserción local inmediata para actualizar la UI sin recargar
        this.restaurantes.push({
          id: docRefRestaurante.id,
          restaurantId: idLimpio,
          nombreComercial: this.nuevoNombreComercial.trim(),
          ruc: this.nuevoRuc.trim(),
          logoUrl: logoUrlFinal,
          theme: {
            primaryColor: this.primaryColor,
            secondaryColor: this.secondaryColor,
            accentColor: '#10b981'
          },
          estadoSuscripcion: 'activo',
          fechaRegistro: new Date().toISOString()
        });

        // Limpiar campos
        this.nuevoRestaurantId = '';
        this.nuevoNombreComercial = '';
        this.nuevoRuc = '';
        this.archivoLogo = null;
        this.previewLogoUrl = null;
        this.nombreDuenia = '';
        this.dniDuenia = '';
        this.pinDuenia = '';

      } catch (error) {
        console.error('Error al registrar picantería:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo procesar el alta del restaurante.',
          confirmButtonText: 'Cerrar',
          confirmButtonColor: '#ef4444'
        });
      } finally {
        this.cargandoAlta = false;
        this.cdr.detectChanges();
      }
    });
  }

  async cambiarEstadoLicencia(r: Restaurante): Promise<void> {
    if (!r.id) return;
    const nuevoEstado = r.estadoSuscripcion === 'activo' ? 'suspendido' : 'activo';

    const confirm = await Swal.fire({
      title: `¿${nuevoEstado === 'suspendido' ? 'Suspender' : 'Activar'} licencia?`,
      text: `Restaurante: ${r.nombreComercial}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cambiar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b'
    });

    if (confirm.isConfirmed) {
      runInInjectionContext(this.injector, async () => {
        try {
          const docRef = doc(this.firestore, `restaurantes/${r.id}`);
          await updateDoc(docRef, { estadoSuscripcion: nuevoEstado });
          
          r.estadoSuscripcion = nuevoEstado;
          this.cdr.detectChanges();

          await Swal.fire({
            icon: 'success',
            title: 'Actualizado',
            text: `Licencia modificada a ${nuevoEstado.toUpperCase()}.`,
            confirmButtonText: 'OK',
            confirmButtonColor: '#10b981',
            allowOutsideClick: false
          });
        } catch (error) {
          console.error('❌ Error al actualizar licencia:', error);
          Swal.fire('Error', 'No se pudo actualizar el estado de la licencia.', 'error');
        }
      });
    }
  }

  cerrarSesion(): void {
    localStorage.removeItem('sesion_picanteria');
    this.router.navigate(['/login']);
  }

  toggleVerPassword(): void {
    this.verPasswordDuenia = !this.verPasswordDuenia;
  }
}
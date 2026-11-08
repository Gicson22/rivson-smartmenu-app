import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import Swal from 'sweetalert2';

import { UsuarioTrabajador, RolTrabajador } from '../../models/usuario';

@Component({
  selector: 'app-auth-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-login.html',
  styleUrl: './auth-login.css'
})
export class AuthLogin {
  private firestore = inject(Firestore);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  verPassword: boolean = false;
  rolSeleccionado: RolTrabajador = 'mozo'; 
  dniUsuario: string = '';
  pinAcceso: string = '';
  cargando: boolean = false;

  // 🧹 Funciones para limpiar y devolver el foco (cursor) automáticamente al input
  limpiarDni(inputElement: HTMLInputElement): void {
    this.dniUsuario = '';
    inputElement.focus();
  }

  limpiarPin(inputElement: HTMLInputElement): void {
    this.pinAcceso = '';
    inputElement.focus();
  }

  async ingresarAlSistema(): Promise<void> {
    if (!this.dniUsuario.trim() || !this.pinAcceso.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos Vacíos',
        text: 'Por favor, ingresa tu DNI y tu contraseña.',
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'Entendido'
      });
      return;
    }

    this.cargando = true;
    this.cdr.detectChanges();

    try {
      // 1. LLAVE MAESTRA SUPER ADMIN
      if (this.dniUsuario.trim() === '71102367' && this.pinAcceso.trim() === 'g1c50nrivasS') {
        const sesionSuper = {
          uid: 'super-admin-gicson',
          nombre: 'Gicson Rivas (Super Admin)',
          dni: '71102367',
          rol: 'super',
          restaurantId: 'master',
          nombreComercial: 'Rivson SaaS Master',
          logoUrl: ''
        };
        localStorage.setItem('sesion_picanteria', JSON.stringify(sesionSuper));

        this.cargando = false;
        this.cdr.detectChanges();

        const resultado = await Swal.fire({
          icon: 'success',
          title: '¡Bienvenido, Jefazo!',
          text: 'Accediendo al Panel Maestro de Rivson SaaS...',
          confirmButtonText: 'OK, Vamos',
          confirmButtonColor: '#38bdf8',
          allowOutsideClick: false
        });

        if (resultado.isConfirmed) {
          this.router.navigate(['/admin/super']);
        }
        return;
      }

      // 2. VALIDACIÓN DEL TRABAJADOR CONTRA FIRESTORE
      const usuariosRef = collection(this.firestore, 'usuarios');
      const q = query(
        usuariosRef,
        where('dni', '==', this.dniUsuario.trim()),
        where('pin', '==', this.pinAcceso.trim()),
        where('rol', '==', this.rolSeleccionado)
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        this.cargando = false;
        this.cdr.detectChanges();
        Swal.fire({
          icon: 'error',
          title: 'Acceso Denegado',
          text: 'DNI, PIN o Rol incorrectos. Verifica tus datos.',
          confirmButtonColor: '#ef4444',
          confirmButtonText: 'Intentar de nuevo'
        });
        return;
      }

      const usuarioDoc = querySnapshot.docs[0];
      const usuario = usuarioDoc.data() as UsuarioTrabajador;

      if (usuario.activo === false) {
        this.cargando = false;
        this.cdr.detectChanges();
        Swal.fire({
          icon: 'error',
          title: 'Acceso Restringido',
          text: 'Tu perfil personal ha sido desactivado. Comunícate con gerencia.',
          confirmButtonColor: '#ef4444',
          confirmButtonText: 'Entendido'
        });
        return;
      }

      const restaurantIdUser = (usuario as any).restaurantId || 'moscu';

      let nombreComercialFinal = 'Mi Picantería';
      let logoUrlFinal = '';

      const restaurantesRef = collection(this.firestore, 'restaurantes');
      const qRest = query(restaurantesRef, where('restaurantId', '==', restaurantIdUser));
      const querySnapshotRest = await getDocs(qRest);

      if (!querySnapshotRest.empty) {
        const restDocData = querySnapshotRest.docs[0].data() as any;
        const estadoSuscripcion = restDocData.estadoSuscripcion || 'activo';
        
        if (estadoSuscripcion === 'suspendido' || restDocData.activo === false) {
          this.cargando = false;
          this.cdr.detectChanges();
          Swal.fire({
            icon: 'warning',
            title: 'Local Suspendido / Inactivo',
            text: `El establecimiento "${restDocData.nombreComercial || 'Comercial'}" se encuentra suspendido o con membresía inactiva en el SaaS.`,
            confirmButtonColor: '#f59e0b',
            confirmButtonText: 'Entendido'
          });
          return;
        }

        nombreComercialFinal = restDocData.nombreComercial || nombreComercialFinal;
        logoUrlFinal = restDocData.logoUrl && restDocData.logoUrl !== 'assets/default-logo.png' ? restDocData.logoUrl : '';
      }

      const sesionPersonal = {
        uid: usuarioDoc.id,
        nombre: usuario.nombre,
        dni: usuario.dni,
        rol: usuario.rol,
        restaurantId: restaurantIdUser,
        nombreComercial: nombreComercialFinal,
        logoUrl: logoUrlFinal,
        turno: new Date().toLocaleTimeString()
      };
      
      localStorage.setItem('sesion_picanteria', JSON.stringify(sesionPersonal));

      this.cargando = false;
      this.cdr.detectChanges();

      const resultadoPersonal = await Swal.fire({
        icon: 'success',
        title: `¡Hola, ${usuario.nombre}!`,
        text: `Iniciando turno en ${nombreComercialFinal}...`,
        confirmButtonText: 'Ingresar al Turno',
        confirmButtonColor: '#10b981',
        allowOutsideClick: false
      });

      if (resultadoPersonal.isConfirmed) {
        this.redirigirSegunRol(usuario.rol);
      }

    } catch (error) {
      console.error('Error en login:', error);
      this.cargando = false;
      this.cdr.detectChanges();
      Swal.fire('Error', 'Ocurrió un problema al conectar con la base de datos.', 'error');
    }
  }

  private redirigirSegunRol(rol: string): void {
    switch (rol) {
      case 'dueña':
        this.router.navigate(['/admin/gerencia']);
        break;
      case 'mozo':
        this.router.navigate(['/admin/mozo']);
        break;
      case 'cocina':
        this.router.navigate(['/admin/comandas']);
        break;
      case 'caja':
        this.router.navigate(['/admin/caja']);
        break;
      case 'guardia':
        this.router.navigate(['/admin/puerta']);
        break;
      default:
        this.router.navigate(['/login']);
        break;
    }
  }

  toggleVerPassword(): void {
    this.verPassword = !this.verPassword;
  }
}
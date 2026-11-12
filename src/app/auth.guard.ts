import { inject } from '@angular/core';
import { Router, CanActivateFn, UrlTree } from '@angular/router';
import Swal from 'sweetalert2';

export const authGuard: CanActivateFn = (route, state): boolean | UrlTree => {
  const router = inject(Router);
  const sesionStr = localStorage.getItem('sesion_picanteria');

  // Si no hay sesión, fuera directo al login
  if (!sesionStr) {
    return router.createUrlTree(['/login']);
  }

  try {
    const sesion = JSON.parse(sesionStr);
    const rolUsuario = sesion.rol; // 'super', 'dueña', 'mozo', 'cocina', 'caja', 'guardia'
    const rutaActual = state.url;

    let autorizado = true;

    // 1. Super Admin
    if (rutaActual.includes('/admin/super') && rolUsuario !== 'super') {
      autorizado = false;
    }
    // 2. Gerencia / Dueña
    else if (rutaActual.includes('/admin/gerencia') && rolUsuario !== 'dueña' && rolUsuario !== 'super') {
      autorizado = false;
    }
    // 3. Mozo
    else if (rutaActual.includes('/admin/mozo') && rolUsuario !== 'mozo' && rolUsuario !== 'dueña' && rolUsuario !== 'super') {
      autorizado = false;
    }
    // 4. Cocina / Comandas
    else if (rutaActual.includes('/admin/comandas') && rolUsuario !== 'cocina' && rolUsuario !== 'dueña' && rolUsuario !== 'super') {
      autorizado = false;
    }
    // 5. Caja
    else if (rutaActual.includes('/admin/caja') && rolUsuario !== 'caja' && rolUsuario !== 'dueña' && rolUsuario !== 'super') {
      autorizado = false;
    }
    // 6. Puerta / Guardia
    else if (rutaActual.includes('/admin/puerta') && rolUsuario !== 'guardia' && rolUsuario !== 'dueña' && rolUsuario !== 'super') {
      autorizado = false;
    }

    if (!autorizado) {
      // Mostramos la alerta de acceso denegado de forma limpia
      Swal.fire({
        icon: 'error',
        title: 'Acceso Restringido',
        text: 'No tienes autorización para ingresar a este panel.',
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Entendido',
        background: '#0f172a',
        color: '#fff'
      });
      return router.createUrlTree(['/login']);
    }

    return true;
  } catch (e) {
    localStorage.removeItem('sesion_picanteria');
    return router.createUrlTree(['/login']);
  }
};
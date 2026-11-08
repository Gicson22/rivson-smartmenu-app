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

    // 1. Super Admin (Solo rol 'super')
    if (rutaActual.includes('/admin/super') && rolUsuario !== 'super') {
      return router.createUrlTree(['/login']);
    }

    // 2. Gerencia / Dueña (Solo rol 'dueña' o 'super')
    if (rutaActual.includes('/admin/gerencia') && rolUsuario !== 'dueña' && rolUsuario !== 'super') {
      // Opcional: Si quieres mostrar una alerta antes de rebotarlo
      Swal.fire({
        icon: 'error',
        title: 'Acceso Restringido',
        text: 'No tienes autorización para ingresar a este panel.',
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Entendido'
      });
      return router.createUrlTree(['/login']);
    }

    // 3. Mozo (Permite a 'mozo' o 'dueña')
    if (rutaActual.includes('/admin/mozo') && rolUsuario !== 'mozo' && rolUsuario !== 'dueña' && rolUsuario !== 'super') {
      return router.createUrlTree(['/login']);
    }

    // 4. Cocina / Comandas (Permite a 'cocina' o 'dueña')
    if (rutaActual.includes('/admin/comandas') && rolUsuario !== 'cocina' && rolUsuario !== 'dueña' && rolUsuario !== 'super') {
      return router.createUrlTree(['/login']);
    }

    // 5. Caja (Permite a 'caja' o 'dueña')
    if (rutaActual.includes('/admin/caja') && rolUsuario !== 'caja' && rolUsuario !== 'dueña' && rolUsuario !== 'super') {
      return router.createUrlTree(['/login']);
    }

    // 6. Puerta / Guardia (Permite a 'guardia' o 'dueña')
    if (rutaActual.includes('/admin/puerta') && rolUsuario !== 'guardia' && rolUsuario !== 'dueña' && rolUsuario !== 'super') {
      return router.createUrlTree(['/login']);
    }

    return true;
  } catch (e) {
    localStorage.removeItem('sesion_picanteria');
    return router.createUrlTree(['/login']);
  }
};
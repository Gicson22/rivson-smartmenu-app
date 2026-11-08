import { Routes } from '@angular/router';
import { AuthLogin } from './views/auth-login/auth-login';
import { ClienteMenu } from './views/cliente-menu/cliente-menu';
import { GuardiaPuerta } from './views/guardia-puerta/guardia-puerta';
import { CocinaComandas } from './views/cocina-comandas/cocina-comandas';
import { CajaAdmin } from './views/caja-admin/caja-admin';
import { MozoAtencion } from './views/mozo-atencion/mozo-atencion';
import { DueniaPanel } from './views/duenia-panel/duenia-panel';
import { SuperAdmin } from './views/super-admin/super-admin';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', component: AuthLogin },
  { path: 'cliente', component: ClienteMenu }, //ingreso libre
  
  // 2. Rutas protegidas con el guardián
  { path: 'admin/puerta', component: GuardiaPuerta, canActivate: [authGuard] }, //blokeado excelentemente
  { path: 'admin/comandas', component: CocinaComandas, canActivate: [authGuard] }, //entro con normalidad digitando ocambiandoi ruta domas
  { path: 'admin/caja', component: CajaAdmin, canActivate: [authGuard] }, //blokeado excelentemente
  { path: 'admin/mozo', component: MozoAtencion, canActivate: [authGuard] }, //entro con normalidad digitando ocambiandoi ruta domas
  { path: 'admin/gerencia', component: DueniaPanel, canActivate: [authGuard] }, //blokeado excelentemente pero no aprece la alerta que esta blokeado el acceso a esa interfaz por no autorizado
  { path: 'admin/super', component: SuperAdmin, canActivate: [authGuard] }, //entro con normalidad digitando ocambiandoi ruta domas

  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
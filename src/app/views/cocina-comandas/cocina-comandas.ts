import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, runInInjectionContext, EnvironmentInjector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { 
  Firestore, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  QuerySnapshot,
  DocumentData,
  Unsubscribe 
} from '@angular/fire/firestore';

interface ItemComanda {
  nombre: string;
  cantidad: number;
  precioSeleccionado: number;
  categoria?: string;
  tamanioSeleccionado?: string; 
  nivelPicante?: string; 
  observacion?: string;  
  estadoItem?: 'solicitado' | 'preparando' | 'listo' | 'entregado';
  cocineroAsignado?: string;               
  cocineroSeleccionadoTemporal?: Cocinero; 
}

export interface ComandaCocina {
  idComanda: string;
  numeroMesa: number | string;
  items: ItemComanda[];
  estado: 'solicitado' | 'preparando' | 'listo' | 'entregado';
  horaPedido: string;
  timestamp?: number;
}

interface Cocinero {
  id: string;
  nombre: string;
  platosEnCurso: number;
  platosPreparadosHoy: number;
  historialPlatos: any[];
}

@Component({
  selector: 'app-cocina-comandas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cocina-comandas.html',
  styleUrl: './cocina-comandas.css'
})
export class CocinaComandas implements OnInit, OnDestroy {
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);

  private subComandas?: Unsubscribe;
  private subCocineros?: Unsubscribe;
  private subRestaurante?: Unsubscribe;

  filtroEstado: 'solicitado' | 'preparando' | 'listo' | 'entregado' = 'solicitado';

  restaurantId: string = 'moscu';
  logoUrl: string = '';

  cocineros: Cocinero[] = [];
  comandasCola: ComandaCocina[] = [];

  ngOnInit(): void {
    this.cargarLogoRestaurante();
    this.escucharCocinerosEnVivo();
    this.escucharComandasEnVivo();
  }

  ngOnDestroy(): void {
    if (this.subComandas) this.subComandas();
    if (this.subCocineros) this.subCocineros();
    if (this.subRestaurante) this.subRestaurante();
  }

  cargarLogoRestaurante(): void {
    runInInjectionContext(this.injector, () => {
      const restRef = collection(this.firestore, 'restaurantes');
      const qRest = query(restRef, where('restaurantId', '==', this.restaurantId.trim().toLowerCase()));

      this.subRestaurante = onSnapshot(qRest, (snapshot: QuerySnapshot<DocumentData>) => {
        if (!snapshot.empty) {
          const restData = snapshot.docs[0].data();
          this.logoUrl = restData['logoUrl'] || restData['logo'] || restData['icono'] || '';
        } else {
          this.logoUrl = '';
        }
        this.cdr.detectChanges();
      });
    });
  }

  escucharCocinerosEnVivo(): void {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const qCocineros = query(usuariosRef, where('rol', '==', 'cocina'));
    
    this.subCocineros = onSnapshot(qCocineros, (snapshot: QuerySnapshot<DocumentData>) => {
      this.cocineros = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          nombre: data['nombre'] || 'Cocinero',
          platosEnCurso: 0,
          platosPreparadosHoy: Number(data['platosPreparadosHoy']) || 0,
          historialPlatos: Array.isArray(data['historialPlatos']) ? data['historialPlatos'] : []
        };
      }) as Cocinero[];

      this.actualizarMetricasCocineros();
      this.cdr.detectChanges();
    });
  }

  escucharComandasEnVivo(): void {
    const pedidosRef = collection(this.firestore, 'pedidos');
    const q = query(pedidosRef, where('restaurantId', '==', this.restaurantId), where('destino', '==', 'cocina'));
    
    this.subComandas = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      this.comandasCola = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const itemsBD = data['items'] || [];
        const estadoGlobalDoc = data['estado'] || 'solicitado';

        const itemsConEstado = itemsBD.map((it: any) => ({
          ...it,
          estadoItem: it.estadoItem || it.estado || estadoGlobalDoc,
          cocineroAsignado: it.cocineroAsignado || undefined
        }));

        let estadoCalculado: 'solicitado' | 'preparando' | 'listo' | 'entregado' = estadoGlobalDoc;
        const todosEntregados = itemsConEstado.length > 0 && itemsConEstado.every((i: any) => i.estadoItem === 'entregado');
        const todosListos = itemsConEstado.length > 0 && itemsConEstado.every((i: any) => i.estadoItem === 'listo' || i.estadoItem === 'entregado');
        const algunPreparando = itemsConEstado.some((i: any) => i.estadoItem === 'preparando');

        if (todosEntregados) {
          estadoCalculado = 'entregado';
        } else if (todosListos) {
          estadoCalculado = 'listo';
        } else if (algunPreparando) {
          estadoCalculado = 'preparando';
        } else {
          estadoCalculado = 'solicitado';
        }

        return {
          idComanda: docSnap.id,
          numeroMesa: data['numeroMesa'] || '1',
          items: itemsConEstado,
          estado: estadoCalculado,
          horaPedido: data['fechaCreacion'] ? new Date(data['fechaCreacion']).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '12:00 PM',
          timestamp: data['fechaCreacion'] ? new Date(data['fechaCreacion']).getTime() : 1
        };
      }) as ComandaCocina[];

      this.actualizarMetricasCocineros();
      this.cdr.detectChanges();
    });
  }

  actualizarMetricasCocineros(): void {
    if (!this.cocineros.length) return;
    this.cocineros.forEach(c => c.platosEnCurso = 0);

    this.comandasCola.forEach(cmd => {
      cmd.items.forEach(item => {
        if (item.estadoItem === 'preparando' && item.cocineroAsignado) {
          const cocinero = this.cocineros.find(c => c.nombre === item.cocineroAsignado);
          if (cocinero) {
            cocinero.platosEnCurso += item.cantidad;
          }
        }
      });
    });
  }

  get comandasFiltradas(): ComandaCocina[] {
    let lista = [...this.comandasCola];
    
    lista = lista.filter(c => 
      c.items.some(i => {
        const estadoItem = i.estadoItem || 'solicitado';
        if (this.filtroEstado === 'listo') {
          return estadoItem === 'listo';
        }
        if (this.filtroEstado === 'entregado') {
          return estadoItem === 'entregado';
        }
        return estadoItem === this.filtroEstado;
      })
    );

    return lista.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  getItemsFiltrados(comanda: ComandaCocina): ItemComanda[] {
    return comanda.items.filter(i => {
      const estadoItem = i.estadoItem || 'solicitado';
      if (this.filtroEstado === 'listo') {
        return estadoItem === 'listo';
      }
      if (this.filtroEstado === 'entregado') {
        return estadoItem === 'entregado';
      }
      return estadoItem === this.filtroEstado;
    });
  }

  obtenerEstadoVisualComanda(comanda: ComandaCocina): string {
    if (this.filtroEstado === 'solicitado') return '⏳ EN COLA';
    if (this.filtroEstado === 'preparando') return '🔥 PREPARANDO';
    if (this.filtroEstado === 'listo') return '✅ LISTO';
    if (this.filtroEstado === 'entregado') return '🍽️ ENTREGADO';
    return '⏳ EN COLA';
  }

  obtenerClaseEstadoVisual(comanda: ComandaCocina): string {
    return this.filtroEstado;
  }

  contarEstado(estado: string): number {
    if (estado === 'solicitado') {
      return this.comandasCola.reduce((acc, c) => acc + c.items.filter(i => (i.estadoItem || 'solicitado') === 'solicitado').length, 0);
    }
    if (estado === 'preparando') {
      return this.comandasCola.reduce((acc, c) => acc + c.items.filter(i => i.estadoItem === 'preparando').length, 0);
    }
    if (estado === 'listo') {
      return this.comandasCola.reduce((acc, c) => acc + c.items.filter(i => i.estadoItem === 'listo').length, 0);
    }
    if (estado === 'entregado') {
      return this.comandasCola.reduce((acc, c) => acc + c.items.filter(i => i.estadoItem === 'entregado').length, 0);
    }
    return 0;
  }

  async tomarPlatoIndividual(comanda: ComandaCocina, itemOriginal: ItemComanda): Promise<void> {
    if (!itemOriginal.cocineroSeleccionadoTemporal) {
      Swal.fire({
        icon: 'warning',
        title: '¡Falta el cocinero!',
        text: 'Debes seleccionar un cocinero para este plato.',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    const cocineroElegido = itemOriginal.cocineroSeleccionadoTemporal;

    try {
      itemOriginal.estadoItem = 'preparando';
      itemOriginal.cocineroAsignado = cocineroElegido.nombre;

      const algunPreparando = comanda.items.some(i => i.estadoItem === 'preparando');
      const todosListos = comanda.items.every(i => i.estadoItem === 'listo' || i.estadoItem === 'entregado');

      let nuevoEstadoGlobal: any = 'solicitado';
      if (todosListos) nuevoEstadoGlobal = 'listo';
      else if (algunPreparando) nuevoEstadoGlobal = 'preparando';

      const itemsLimpios = comanda.items.map(it => {
        const itemLimpio: any = {
          nombre: it.nombre,
          cantidad: it.cantidad,
          precioSeleccionado: it.precioSeleccionado,
          estadoItem: it.estadoItem || 'solicitado',
          cocineroAsignado: it.cocineroAsignado || cocineroElegido.nombre
        };
        if (it.categoria) itemLimpio.categoria = it.categoria;
        if (it.tamanioSeleccionado) itemLimpio.tamanioSeleccionado = it.tamanioSeleccionado;
        if (it.nivelPicante) itemLimpio.nivelPicante = it.nivelPicante;
        if (it.observacion) itemLimpio.observacion = it.observacion;
        if (it.cocineroAsignado) itemLimpio.cocineroAsignado = it.cocineroAsignado;
        return itemLimpio;
      });

      const pedidoDocRef = doc(this.firestore, 'pedidos', comanda.idComanda);
      await updateDoc(pedidoDocRef, {
        estado: nuevoEstadoGlobal,
        items: itemsLimpios
      });

      Swal.fire({
        icon: 'success',
        title: '¡Plato Tomado!',
        text: `${cocineroElegido.nombre} asumió: ${itemOriginal.nombre}`,
        timer: 1200,
        showConfirmButton: false
      });
    } catch (error) {
      console.error('Error al tomar plato individual:', error);
      Swal.fire('Error', 'No se pudo asignar el plato.', 'error');
    }
  }

  async marcarPlatoListo(comanda: ComandaCocina, itemOriginal: ItemComanda): Promise<void> {
    try {
      itemOriginal.estadoItem = 'listo';

      const todosListos = comanda.items.every(i => i.estadoItem === 'listo' || i.estadoItem === 'entregado');
      const algunPreparando = comanda.items.some(i => i.estadoItem === 'preparando');

      let nuevoEstadoGlobal: any = 'solicitado';
      if (todosListos) nuevoEstadoGlobal = 'listo';
      else if (algunPreparando) nuevoEstadoGlobal = 'preparando';

      const itemsLimpios = comanda.items.map(it => {
        const itemLimpio: any = {
          nombre: it.nombre,
          cantidad: it.cantidad,
          precioSeleccionado: it.precioSeleccionado,
          estadoItem: it.estadoItem || 'solicitado',
          cocineroAsignado: it.cocineroAsignado || null
        };
        if (it.categoria) itemLimpio.categoria = it.categoria;
        if (it.tamanioSeleccionado) itemLimpio.tamanioSeleccionado = it.tamanioSeleccionado;
        if (it.nivelPicante) itemLimpio.nivelPicante = it.nivelPicante;
        if (it.observacion) itemLimpio.observacion = it.observacion;
        if (it.cocineroAsignado) itemLimpio.cocineroAsignado = it.cocineroAsignado;
        return itemLimpio;
      });

      const pedidoDocRef = doc(this.firestore, 'pedidos', comanda.idComanda);
      await updateDoc(pedidoDocRef, {
        estado: nuevoEstadoGlobal,
        items: itemsLimpios
      });

      if (itemOriginal.cocineroAsignado) {
        const cocineroObj = this.cocineros.find(c => c.nombre.trim().toLowerCase() === itemOriginal.cocineroAsignado?.trim().toLowerCase());
        
        if (cocineroObj) {
          const cocineroDocRef = doc(this.firestore, 'usuarios', cocineroObj.id);
          
          const nuevoHistorialItem = {
            numeroMesa: comanda.numeroMesa,
            nombrePlato: itemOriginal.nombre,
            cantidad: itemOriginal.cantidad,
            horaPreparado: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          const actualTotal = Number(cocineroObj.platosPreparadosHoy) || 0;
          const nuevoTotalHoy = actualTotal + Number(itemOriginal.cantidad);
          const historialActual = Array.isArray(cocineroObj.historialPlatos) ? cocineroObj.historialPlatos : [];
          const nuevoHistorial = [nuevoHistorialItem, ...historialActual];

          await updateDoc(cocineroDocRef, {
            platosPreparadosHoy: nuevoTotalHoy,
            historialPlatos: nuevoHistorial
          });

          cocineroObj.platosPreparadosHoy = nuevoTotalHoy;
          cocineroObj.historialPlatos = nuevoHistorial;
        }
      }

      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
        background: '#0f172a',
        color: '#34d399'
      });
      Toast.fire({
        icon: 'success',
        title: `¡${itemOriginal.nombre} listo para barra!`
      });

      this.cdr.detectChanges();

    } catch (error) {
      console.error('Error al marcar plato listo:', error);
      Swal.fire('Error', 'No se pudo actualizar el plato.', 'error');
    }
  }

  verDetalleCocinero(cocinero: Cocinero): void {
    if (!cocinero.historialPlatos || cocinero.historialPlatos.length === 0) {
      Swal.fire({
        icon: 'info',
        title: cocinero.nombre,
        text: 'Aún no registra platos preparados en el turno de hoy.',
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#3b82f6',
        background: '#0f172a',
        color: '#fff',
        padding: '12px'
      });
      return;
    }

    const headerHtml = `
      <div style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 0; margin: 0; width: 100%;">
        ${this.logoUrl ? 
          `<img src="${this.logoUrl}" alt="Logo Local" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 2px solid #38bdf8; box-shadow: 0 2px 4px rgba(0,0,0,0.3);" />` : 
          `<div style="width: 44px; height: 44px; background: #1e293b; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #38bdf8; flex-shrink: 0; border: 2px solid #38bdf8;">🥘</div>`
        }
        <h2 style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 1.25rem; color: #38bdf8; font-weight: 400; text-align: left; line-height: 1.1; white-space: nowrap;">Detalle de ${cocinero.nombre}</h2>
      </div>
    `;

    let htmlLista = '<div style="text-align: left; max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-top: 8px; padding-right: 2px;">';
    cocinero.historialPlatos.forEach((p, index) => {
      htmlLista += `
        <div style="background: #1e293b; padding: 8px 10px; border-radius: 6px; border-left: 3px solid #38bdf8; color: #f8fafc; display: flex; flex-direction: column; gap: 2px;">
          <div style="font-size: 0.8rem; font-weight: bold; color: #38bdf8;">#${index + 1} - Mesa N° ${p.numeroMesa}</div>
          <div style="font-size: 0.78rem; color: #f8fafc;">🍽️ ${p.cantidad}x ${p.nombrePlato}</div>
          <div style="font-size: 0.65rem; color: #94a3b8; font-style: italic;">🕒 Preparado a las: ${p.horaPreparado}</div>
        </div>
      `;
    });
    htmlLista += '</div>';

    Swal.fire({
      title: headerHtml,
      html: htmlLista,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#3b82f6',
      width: '380px',
      background: '#0f172a',
      color: '#fff',
      padding: '12px 15px',
      customClass: {
        popup: 'modal-custom-cocina-identico',  
        confirmButton: 'btn-cerrar-identico'        
      }
    });
  }
}
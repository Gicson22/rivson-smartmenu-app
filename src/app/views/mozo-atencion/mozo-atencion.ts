import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
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

export interface ItemMesaMozo {
  idDocumentoPedido: string;
  nombre: string;
  cantidad: number;
  precioSeleccionado: number;
  estado: 'solicitado' | 'preparando' | 'listo' | 'entregado';
  destino?: string;
  tamanioSeleccionado?: string;
  nivelPicante?: string;
  observacion?: string;
  cocineroAsignado?: string;
}

export interface MesaSalon {
  numeroMesa: number;
  mozoAsignado: string | null;
  estadoMesa: 'libre' | 'atendiendo' | 'llamando' | 'pagado';
  itemsEnMesa: ItemMesaMozo[];
  totalMesa: number;
  solicitandoCobro?: boolean;
}

export interface MesaCobradaHistorial {
  numeroMesa: number;
  total: number;
  items: ItemMesaMozo[];
  fecha: string;
}

@Component({
  selector: 'app-mozo-atencion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mozo-atencion.html',
  styleUrl: './mozo-atencion.css'
})
export class MozoAtencion implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private injector = inject(EnvironmentInjector);

  private unsubscribePedidos?: Unsubscribe;
  private unsubscribeMozo?: Unsubscribe;
  private unsubscribeRestaurante?: Unsubscribe;

  nombreMozoActual: string = 'Cargando mozo...'; 
  restaurantId: string = 'moscu';
  restaurantIconUrl: string = '';
  
  filtroMozoTab: 'mis-mesas' | 'cobradas' | 'alertas' = 'alertas';
  mesasSalon: MesaSalon[] = [];
  mesasCobradasHistorial: MesaCobradaHistorial[] = [];
  
  mesaModalAbierta: MesaSalon | null = null;
  private mesasConAlertaCobroEmitida: Set<number> = new Set();

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['local']) {
        this.restaurantId = params['local'].trim().toLowerCase();
      }
    });

    this.inicializarMesasBase();
    this.cargarIconoRestaurante();
    this.cargarMozoDesdeFirestore();
    this.escucharPedidosSalonFirestore();
  }

  ngOnDestroy(): void {
    if (this.unsubscribePedidos) this.unsubscribePedidos();
    if (this.unsubscribeMozo) this.unsubscribeMozo();
    if (this.unsubscribeRestaurante) this.unsubscribeRestaurante();
  }

  inicializarMesasBase(): void {
    this.mesasSalon = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => ({
      numeroMesa: num,
      mozoAsignado: null,
      estadoMesa: 'libre',
      itemsEnMesa: [],
      totalMesa: 0,
      solicitandoCobro: false
    }));
  }

  cargarIconoRestaurante(): void {
    runInInjectionContext(this.injector, () => {
      const restRef = collection(this.firestore, 'restaurantes');
      const qRest = query(restRef, where('restaurantId', '==', this.restaurantId));

      this.unsubscribeRestaurante = onSnapshot(qRest, (snapshot: QuerySnapshot<DocumentData>) => {
        if (!snapshot.empty) {
          const restData = snapshot.docs[0].data();
          this.restaurantIconUrl = restData['logoUrl'] || restData['logo'] || restData['icono'] || '';
        } else {
          this.restaurantIconUrl = '';
        }
        this.cdr.detectChanges();
      });
    });
  }

  cargarMozoDesdeFirestore(): void {
    runInInjectionContext(this.injector, () => {
      const usuariosRef = collection(this.firestore, 'usuarios');
      const qMozos = query(
        usuariosRef, 
        where('rol', '==', 'mozo'),
        where('restaurantId', '==', this.restaurantId.trim().toLowerCase())
      );

      this.unsubscribeMozo = onSnapshot(qMozos, (snapshot: QuerySnapshot<DocumentData>) => {
        if (!snapshot.empty) {
          const dataMozo = snapshot.docs[0].data();
          this.nombreMozoActual = dataMozo['nombre'] || dataMozo['nombres'] || 'Mozo de Turno';
        } else {
          this.nombreMozoActual = 'Mozo Principal';
        }
        this.cdr.detectChanges();
      });
    });
  }

  escucharPedidosSalonFirestore(): void {
    runInInjectionContext(this.injector, () => {
      try {
        const pedidosRef = collection(this.firestore, 'pedidos');
        const q = query(
          pedidosRef, 
          where('restaurantId', '==', this.restaurantId)
        );

        this.unsubscribePedidos = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
          this.mesasSalon.forEach(m => {
            m.itemsEnMesa = [];
            m.totalMesa = 0;
            m.mozoAsignado = null;
            m.solicitandoCobro = false;
          });

          snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            const numMesa = Number(data['numeroMesa'] || 1);
            const estadoGlobal = data['estado'] || 'solicitado';
            const items = data['items'] || [];
            const totalDoc = data['total'] || 0;
            const mozoEnBD = data['mozoAsignado'] || null;
            const solicitandoCobro = data['solicitandoCobro'] || false;

            if (estadoGlobal === 'pagado') {
              const yaExisteEnHistorial = this.mesasCobradasHistorial.some(h => h.numeroMesa === numMesa && h.total === totalDoc);
              if (!yaExisteEnHistorial) {
                const ahora = new Date();
                const fechaCorta = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                const horaCorta = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                this.mesasCobradasHistorial.unshift({
                  numeroMesa: numMesa,
                  total: totalDoc,
                  items: items,
                  fecha: `${fechaCorta} - ${horaCorta}`
                });
              }
              return;
            }

            let mesaEncontrada = this.mesasSalon.find(m => m.numeroMesa === numMesa);
            if (!mesaEncontrada) {
              mesaEncontrada = {
                numeroMesa: numMesa,
                mozoAsignado: mozoEnBD,
                estadoMesa: 'libre',
                itemsEnMesa: [],
                totalMesa: 0,
                solicitandoCobro: false
              };
              this.mesasSalon.push(mesaEncontrada);
            }

            if (mozoEnBD) {
              mesaEncontrada.mozoAsignado = mozoEnBD;
            }

            if (solicitandoCobro) {
              mesaEncontrada.solicitandoCobro = true;

              if (mozoEnBD === this.nombreMozoActual && !this.mesasConAlertaCobroEmitida.has(numMesa)) {
                this.mesasConAlertaCobroEmitida.add(numMesa);
                
                if (navigator.vibrate) {
                  navigator.vibrate([300, 100, 300, 100, 500]);
                }

                Swal.fire({
                  title: `💳 ¡Mesa N° ${numMesa} Pide Cuenta!`,
                  html: `El cliente está solicitando el cobro de su consumo.<br>Total estimado: <b>S/ ${totalDoc.toFixed(2)}</b><br><br><i>Dirígete a cobrar en persona.</i>`,
                  icon: 'warning',
                  allowOutsideClick: false,
                  allowEscapeKey: false,
                  confirmButtonText: '¡Entendido, voy a cobrar!',
                  confirmButtonColor: '#059669',
                  background: '#0f172a',
                  color: '#fff'
                });
              }
            }

            mesaEncontrada.totalMesa += totalDoc;

            items.forEach((item: any) => {
              let estadoRealItem = item.estadoItem || item.estado;
              
              if (estadoRealItem === 'pendiente_despacho' || !estadoRealItem || estadoRealItem === 'undefined') {
                estadoRealItem = 'solicitado';
              }

              mesaEncontrada!.itemsEnMesa.push({
                idDocumentoPedido: docSnap.id,
                nombre: item.nombre,
                cantidad: item.cantidad,
                precioSeleccionado: item.precioSeleccionado,
                estado: estadoRealItem,
                destino: item.destino || data['destino'] || 'cocina',
                tamanioSeleccionado: item.tamanioSeleccionado,
                nivelPicante: item.nivelPicante,
                observacion: item.observacion,
                cocineroAsignado: item.cocineroAsignado || null
              });
            });
          });

          if (this.mesaModalAbierta) {
            const mesaActualizada = this.mesasSalon.find(m => m.numeroMesa === this.mesaModalAbierta?.numeroMesa);
            if (mesaActualizada) {
              this.mesaModalAbierta = mesaActualizada;
              this.actualizarContenidoModalSiEstaAbierto(mesaActualizada);
            }
          }

          this.cdr.detectChanges();
        });
      } catch (err) {
        console.error('Error escuchando pedidos en salón:', err);
      }
    });
  }

  async tomarMesa(mesa: MesaSalon): Promise<void> {
    try {
      if (!mesa.itemsEnMesa || mesa.itemsEnMesa.length === 0) return;

      const promesas = mesa.itemsEnMesa.map(item => {
        const pedidoRef = doc(this.firestore, 'pedidos', item.idDocumentoPedido);
        return updateDoc(pedidoRef, {
          mozoAsignado: this.nombreMozoActual
        });
      });

      await Promise.all(promesas);

      mesa.mozoAsignado = this.nombreMozoActual;
      mesa.estadoMesa = 'atendiendo';
      this.filtroMozoTab = 'mis-mesas';
      this.cdr.detectChanges();

      Swal.fire({
        icon: 'success',
        title: '¡Mesa Asignada!',
        text: `Ahora te haces cargo de la Mesa N° ${mesa.numeroMesa}.`,
        confirmButtonText: 'OK',
        confirmButtonColor: '#3b82f6'
      });

    } catch (error) {
      console.error('Error al tomar mesa:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo asignar la mesa en Firestore.',
        confirmButtonText: 'OK'
      });
    }
  }

  private generarHtmlItemsModal(mesa: MesaSalon): string {
    let htmlLista = '<div id="lista-items-modal" style="text-align: left; max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-top: 6px; padding-right: 4px;">';

    mesa.itemsEnMesa.forEach((item, index) => {
      let bgColor = 'rgba(59, 130, 246, 0.15)';
      let borderColor = '#3b82f6';
      let textColor = '#60a5fa';
      let textoEstadoPlato = '⏳ Solicitado';

      if (item.estado === 'solicitado') {
        bgColor = 'rgba(217, 119, 6, 0.2)';
        borderColor = '#d97706';
        textColor = '#fbbf24';
        textoEstadoPlato = '⏳ Solicitado';
      } else if (item.estado === 'preparando') {
        bgColor = 'rgba(245, 158, 11, 0.2)';
        borderColor = '#f59e0b';
        textColor = '#fbbf24';
        textoEstadoPlato = '🔥 Preparando';
      } else if (item.estado === 'listo') {
        bgColor = 'rgba(16, 185, 129, 0.2)';
        borderColor = '#10b981';
        textColor = '#34d399';
        textoEstadoPlato = '✅ ¡LISTO!';
      } else if (item.estado === 'entregado') {
        bgColor = 'rgba(139, 92, 246, 0.2)';
        borderColor = '#8b5cf6';
        textColor = '#c084fc';
        textoEstadoPlato = '🍽️ Entregado';
      }

      const colorBordeLateral = item.estado === 'listo' ? '#10b981' : item.estado === 'preparando' ? '#f59e0b' : item.estado === 'entregado' ? '#8b5cf6' : '#3b82f6';
      
      const esCocina = item.destino === 'cocina';
      const textoDestino = esCocina ? 'Cocina' : 'Bebida';
      const colorBadgeBg = esCocina ? 'rgba(56, 189, 248, 0.1)' : 'rgba(251, 191, 36, 0.1)';
      const colorBadgeText = esCocina ? '#38bdf8' : '#fbbf24';

      const tieneMozoAsignado = !!mesa.mozoAsignado;
      const esDeCocina = item.destino === 'cocina';
      const mostrarBotonEntrega = tieneMozoAsignado && item.estado !== 'entregado' && (esDeCocina ? item.estado === 'listo' : true);

      htmlLista += `
        <div style="background: #1e293b; padding: 8px 10px; border-radius: 6px; border-left: 4px solid ${colorBordeLateral}; color: #f8fafc; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
          
          <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
            <div style="font-size: 0.9rem; font-weight: bold;">${item.cantidad}x ${item.nombre}</div>
            ${item.tamanioSeleccionado ? `<div style="font-size: 0.72rem; color: #38bdf8; font-weight: bold;">(${item.tamanioSeleccionado.toUpperCase()})</div>` : ''}
            ${item.nivelPicante ? `<div style="font-size: 0.75rem; color: #fbbf24; font-weight: bold;">🌶️ Ají: ${item.nivelPicante.toUpperCase()}</div>` : ''}
            ${item.observacion ? `<div style="font-size: 0.7rem; color: #c084fc; font-style: italic;">📝 ${item.observacion}</div>` : ''}
            
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
              <span style="font-size: 0.68rem; color: #94a3b8;">Estado:</span>
              <span style="display: inline-flex; justify-content: center; align-items: center; padding: 4px 10px; border-radius: 20px; background-color: ${bgColor}; border: 1px solid ${borderColor}; color: ${textColor}; font-size: 0.72rem; font-weight: bold; min-width: 95px; text-align: center;">
                ${textoEstadoPlato}
              </span>
            </div>
            
            ${mostrarBotonEntrega ? `
              <button id="btn-entregar-item-${index}" style="margin-top: 6px; background: #059669; color: white; border: none; padding: 5px 10px; border-radius: 4px; font-size: 0.68rem; font-weight: bold; cursor: pointer;">
                🏃‍♂️ Marcar Entregado
              </button>` : ''}
          </div>

          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0;">
            <span style="font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; background: ${colorBadgeBg}; color: ${colorBadgeText}; display: flex; align-items: center; gap: 3px; font-weight: bold;">
              <span style="width: 4px; height: 4px; background: ${colorBadgeText}; border-radius: 50%;"></span>
              ${textoDestino}
            </span>
            <div style="font-size: 0.8rem; color: #34d399; font-weight: bold;">
              S/ ${(item.precioSeleccionado * item.cantidad).toFixed(2)}
            </div>
          </div>

        </div>
      `;
    });
    htmlLista += '</div>';
    return htmlLista;
  }

  private actualizarContenidoModalSiEstaAbierto(mesa: MesaSalon): void {
    const container = Swal.getHtmlContainer();
    if (container) {
      const htmlListaDiv = container.querySelector('#lista-items-modal');
      if (htmlListaDiv) {
        htmlListaDiv.outerHTML = this.generarHtmlItemsModal(mesa);

        mesa.itemsEnMesa.forEach((item, index) => {
          const btn = document.getElementById(`btn-entregar-item-${index}`);
          if (btn) {
            btn.addEventListener('click', () => {
              this.entregarItemDesdeModal(mesa, item, index);
            });
          }
        });
      }
    }
  }

  verDetallePedido(mesa: MesaSalon): void {
    this.mesaModalAbierta = mesa;

    const headerHtml = `
      <div style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 0; margin: 0;">
        ${this.restaurantIconUrl ? 
          `<img src="${this.restaurantIconUrl}" alt="Logo Local" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.3);" />` : 
          `<div style="width: 52px; height: 52px; background: #1e293b; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #64748b; flex-shrink: 0;">Logo</div>`
        }
        <h2 style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 1.5rem; color: #38bdf8; font-weight: 400; text-align: left; line-height: 1.1;">Detalle - Mesa Nº ${mesa.numeroMesa}</h2>
      </div>
    `;

    const htmlLista = this.generarHtmlItemsModal(mesa);

    const footerHtml = `
      <div style="width: 100%; padding-top: 6px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.15);">
        <div style="display: flex; justify-content: space-between; align-items: center; color: #34d399; font-weight: bold; font-size: 1rem; padding: 0 4px;">
          <span>Total estimado:</span>
          <span style="font-size: 1.1rem;">S/ ${mesa.totalMesa.toFixed(2)}</span>
        </div>
      </div>
    `;

    Swal.fire({
      title: headerHtml,
      html: htmlLista,
      footer: footerHtml,
      showConfirmButton: true,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#3b82f6',
      width: '440px',
      background: '#0f172a',
      color: '#fff',
      padding: '12px 15px',
      customClass: {
        popup: 'modal-custom-mozo-identico',
        confirmButton: 'btn-cerrar-identico'
      },
      didOpen: () => {
        mesa.itemsEnMesa.forEach((item, index) => {
          const btn = document.getElementById(`btn-entregar-item-${index}`);
          if (btn) {
            btn.addEventListener('click', () => {
              this.entregarItemDesdeModal(mesa, item, index);
            });
          }
        });
      },
      willClose: () => {
        this.mesaModalAbierta = null;
      }
    });
  }

  async entregarItemDesdeModal(mesa: MesaSalon, item: ItemMesaMozo, indexBtn: number): Promise<void> {
    try {
      const pedidoRef = doc(this.firestore, 'pedidos', item.idDocumentoPedido);
      
      const itemsActualizadosBD = mesa.itemsEnMesa
        .filter(it => it.idDocumentoPedido === item.idDocumentoPedido)
        .map(it => {
          const esElItemModificado = (it.nombre === item.nombre && it.precioSeleccionado === item.precioSeleccionado);
          const nuevoEstadoItem = esElItemModificado ? 'entregado' : (it.estado || 'solicitado');
          const chefAsignado = it.cocineroAsignado || item.cocineroAsignado || (it as any).cocineroAsignado || null;
          
          return {
            productoId: (it as any).productoId || '',
            nombre: it.nombre,
            cantidad: it.cantidad,
            precioSeleccionado: it.precioSeleccionado,
            categoria: (it as any).categoria || 'bebidas',
            estadoItem: nuevoEstadoItem,
            estado: nuevoEstadoItem,
            destino: it.destino || 'mozo',
            tamanioSeleccionado: it.tamanioSeleccionado || null,
            nivelPicante: it.nivelPicante || null,
            observacion: it.observacion || null,
            cocineroAsignado: chefAsignado
          };
        });

      const todosEntregados = itemsActualizadosBD.every(i => i.estadoItem === 'entregado');
      const estadoGlobalDoc = todosEntregados ? 'entregado' : 'pendiente_despacho';

      await updateDoc(pedidoRef, {
        estado: estadoGlobalDoc,
        items: itemsActualizadosBD
      });

      item.estado = 'entregado';

      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        background: '#0f172a',
        color: '#38bdf8'
      });
      Toast.fire({
        icon: 'success',
        title: `¡${item.nombre} marcado como entregado!`
      });

    } catch (error) {
      console.error('Error al entregar item desde modal:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo actualizar el estado.',
        confirmButtonText: 'OK'
      });
    }
  }

  get mesasFiltradas(): MesaSalon[] {
    if (this.filtroMozoTab === 'alertas') {
      return this.mesasSalon.filter(m => !m.mozoAsignado && m.itemsEnMesa.length > 0 && m.itemsEnMesa.some(i => i.estado !== 'entregado'));
    } else if (this.filtroMozoTab === 'mis-mesas') {
      return this.mesasSalon.filter(m => m.mozoAsignado === this.nombreMozoActual && m.itemsEnMesa.length > 0);
    }
    return [];
  }

  contarTab(tipo: string): number {
    if (tipo === 'alertas') return this.mesasSalon.filter(m => !m.mozoAsignado && m.itemsEnMesa.length > 0 && m.itemsEnMesa.some(i => i.estado !== 'entregado')).length;
    if (tipo === 'mis-mesas') return this.mesasSalon.filter(m => m.mozoAsignado === this.nombreMozoActual && m.itemsEnMesa.length > 0).length;
    if (tipo === 'cobradas') return this.mesasCobradasHistorial.length;
    return 0;
  }

  async cobrarMesa(mesa: MesaSalon): Promise<void> {
    if (!mesa.itemsEnMesa || mesa.itemsEnMesa.length === 0) return;

    // ⚡ VALIDACIÓN: REVISAR SI TODOS LOS ÍTEMS DE LA MESA ESTÁN ENTREGADOS
    const hayPendientesDeEntrega = mesa.itemsEnMesa.some(item => {
      const estado = (item.estado || '').toLowerCase();
      return estado !== 'entregado' && estado !== 'servido' && estado !== 'despachado' && estado !== 'cancelado';
    });

    if (hayPendientesDeEntrega) {
      Swal.fire({
        icon: 'warning',
        title: `⚠️ No se puede cobrar la Mesa N° ${mesa.numeroMesa}`,
        text: 'Aún hay platos o bebidas pendientes por entregar en esta mesa. Debes marcar todos los ítems como entregados antes de procesar el cobro.',
        confirmButtonText: 'Entendido 👍',
        confirmButtonColor: '#f59e0b',
        background: '#0f172a',
        color: '#ffffff'
      });
      return; 
    }

    const confirm = await Swal.fire({
      title: `¿Cobrar Mesa N° ${mesa.numeroMesa}?`,
      text: `El total a cancelar es S/ ${mesa.totalMesa.toFixed(2)}. Esto cerrará la cuenta.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, ¡Cobrar y Cerrar!',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
      background: '#0f172a',
      color: '#ffffff'
    });

    if (!confirm.isConfirmed) return;

    try {
      const itemsCopia = JSON.parse(JSON.stringify(mesa.itemsEnMesa));
      const totalCopia = mesa.totalMesa;

      const promesas = mesa.itemsEnMesa.map(i => {
        const ref = doc(this.firestore, 'pedidos', i.idDocumentoPedido);
        return updateDoc(ref, { estado: 'pagado', solicitandoCobro: false });
      });

      await Promise.all(promesas);

      // 🕒 Formato compacto: Fecha corta + Hora (Ej: 13/11 - 19:07)
      const ahora = new Date();
      const fechaCorta = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
      const horaCorta = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const fechaHoraCompacta = `${fechaCorta} - ${horaCorta}`;

      this.mesasCobradasHistorial.unshift({
        numeroMesa: mesa.numeroMesa,
        total: totalCopia,
        items: itemsCopia,
        fecha: fechaHoraCompacta
      });

      mesa.mozoAsignado = null;
      mesa.estadoMesa = 'libre';
      mesa.itemsEnMesa = [];
      mesa.totalMesa = 0;
      mesa.solicitandoCobro = false;

      this.mesasConAlertaCobroEmitida.delete(mesa.numeroMesa);
      this.cdr.detectChanges();

      Swal.fire({
        icon: 'success',
        title: '¡Mesa Cobrada con Éxito!',
        text: 'La cuenta ha sido cancelada y la mesa se encuentra libre nuevamente.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#10b981',
        background: '#0f172a',
        color: '#ffffff'
      });

    } catch (err) {
      console.error('Error al cobrar mesa:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo procesar el cobro.',
        confirmButtonText: 'OK',
        background: '#0f172a',
        color: '#ffffff'
      });
    }
  }

  verVoucherCobrado(cobrada: MesaCobradaHistorial): void {
    const fechaObj = new Date();
    const opcionesFecha: Intl.DateTimeFormatOptions = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
    const fechaFormateada = fechaObj.toLocaleDateString('es-PE', opcionesFecha);
    const fechaLid = fechaFormateada.charAt(0).toUpperCase() + fechaFormateada.slice(1);

    let htmlItems = '<div style="text-align: left; background: #1e293b; padding: 10px; border-radius: 6px; font-size: 0.8rem; color: #fff; max-height: 200px; overflow-y: auto; margin-bottom: 8px;">';
    
    if (cobrada.items && cobrada.items.length > 0) {
      cobrada.items.forEach(i => {
        const subtotal = i.precioSeleccionado * i.cantidad;
        htmlItems += `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px; border-bottom: 1px dashed #334155; padding-bottom: 4px;">
            <div>
              <strong style="color: #38bdf8;">${i.cantidad}x</strong> ${i.nombre}
              ${i.tamanioSeleccionado ? `<span style="font-size: 0.68rem; color: #fbbf24;">(${i.tamanioSeleccionado})</span>` : ''}
            </div>
            <div style="color: #34d399; font-weight: bold;">S/ ${subtotal.toFixed(2)}</div>
          </div>
        `;
      });
    } else {
      htmlItems += '<div style="text-align: center; color: #94a3b8;">Sin ítems registrados.</div>';
    }
    htmlItems += '</div>';

    Swal.fire({
      title: `🧾 Voucher - Mesa Nº ${cobrada.numeroMesa}`,
      html: `
        <div id="area-impresion-voucher" style="text-align: left; font-size: 0.82rem; color: #cbd5e1;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.78rem; color: #94a3b8; background: #0f172a; padding: 6px 8px; border-radius: 4px;">
            <span>📅 ${fechaLid}</span>
            <span>🕒 ${cobrada.fecha}</span>
          </div>
          ${htmlItems}
          <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; padding: 8px; border-radius: 6px; font-weight:bold; color:#34d399; font-size: 0.95rem;">
            <span>TOTAL PAGADO:</span>
            <span>S/ ${cobrada.total.toFixed(2)}</span>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: '🖨️ Imprimir Voucher',
      confirmButtonColor: '#0284c7',
      cancelButtonText: 'Cerrar',
      cancelButtonColor: '#334155',
      background: '#0f172a',
      color: '#fff',
      width: '420px'
    }).then((result) => {
      if (result.isConfirmed) {
        this.ejecutarImpresionVoucher(cobrada, fechaLid);
      }
    });
  }

  private ejecutarImpresionVoucher(cobrada: MesaCobradaHistorial, fechaStr: string): void {
    let contenidoItemsPrint = '';
    cobrada.items.forEach(i => {
      contenidoItemsPrint += `
        <tr>
          <td style="padding: 2px 0; border-bottom: 1px dashed #000; font-size: 11px;">${i.cantidad}x ${i.nombre} ${i.tamanioSeleccionado ? '(' + i.tamanioSeleccionado + ')' : ''}</td>
          <td style="text-align: right; padding: 2px 0; border-bottom: 1px dashed #000; font-size: 11px;">S/ ${(i.precioSeleccionado * i.cantidad).toFixed(2)}</td>
        </tr>
      `;
    });

    const ventanaPrint = window.open('', '_print', 'height=700,width=450');
    if (ventanaPrint) {
      ventanaPrint.document.write(`
        <html>
          <head>
            <title>Ticket - Mesa N° ${cobrada.numeroMesa}</title>
            <style>
              @page {
                size: 80mm 150mm;
                margin: 0;
              }
              html, body {
                width: 76mm;
                margin: 0 auto;
                padding: 4mm 0;
                font-family: 'Courier New', Courier, monospace;
                font-size: 11px;
                color: #000;
                background: #fff;
              }
              .text-center { text-align: center; }
              .bold { font-weight: bold; }
              table { width: 100%; border-collapse: collapse; margin-top: 4px; }
              .linea { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
            </style>
          </head>
          <body>
            <div class="text-center bold" style="font-size: 13px;">RESTAURANTE MOSCÚ</div>
            <div class="text-center" style="font-size: 9px; margin-bottom: 4px;">Comprobante de Consumo</div>
            <hr class="linea">
            <div style="font-size: 10px;"><b>Mesa N°:</b> ${cobrada.numeroMesa}</div>
            <div style="font-size: 10px;"><b>Mozo:</b> ${this.nombreMozoActual}</div>
            <div style="font-size: 10px;"><b>Fecha:</b> ${fechaStr}</div>
            <div style="font-size: 10px;"><b>Hora:</b> ${cobrada.fecha}</div>
            <hr class="linea">
            <table>
              <thead>
                <tr>
                  <th style="text-align: left; font-size: 10px;">Descripción</th>
                  <th style="text-align: right; font-size: 10px;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${contenidoItemsPrint}
              </tbody>
            </table>
            
            <div style="margin-top: 6px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 3px 0; display: flex; justify-content: space-between; font-size: 12px;" class="bold">
              <span>TOTAL:</span>
              <span>S/ ${cobrada.total.toFixed(2)}</span>
            </div>

            <div class="text-center" style="margin-top: 8px; font-size: 8.5px;">
              ¡Gracias por su preferencia!<br>Conserve su ticket
            </div>
          </body>
        </html>
      `);
      ventanaPrint.document.close();
      ventanaPrint.focus();
      
      setTimeout(() => {
        ventanaPrint.print();
        ventanaPrint.close();
      }, 250);
    }
  }
}
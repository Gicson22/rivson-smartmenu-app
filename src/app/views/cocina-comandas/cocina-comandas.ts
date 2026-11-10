import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
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
  DocumentData 
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

interface ItemComanda {
  nombre: string;
  cantidad: number;
  precioSeleccionado: number;
  categoria?: string;
  tamanioSeleccionado?: string; 
  nivelPicante?: string; 
  observacion?: string;  
}

export interface ComandaCocina {
  idComanda: string; // Usaremos el ID del primer documento o lo manejaremos consolidado
  idsOriginales: string[]; // 👈 Guardamos todos los IDs de los sub-pedidos de esta mesa para actualizarlos juntos
  numeroMesa: number | string;
  items: ItemComanda[];
  estado: 'solicitado' | 'preparando' | 'listo';
  horaPedido: string;
  cocineroAsignado?: string;
  cocineroSeleccionadoTemporal?: Cocinero;
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

  private subComandas?: Subscription;
  private subCocineros?: Subscription;

  filtroEstado: 'todos' | 'solicitado' | 'preparando' | 'listo' = 'solicitado';

  cocineros: Cocinero[] = [];
  comandasCola: ComandaCocina[] = [];

  ngOnInit(): void {
    this.escucharCocinerosEnVivo();
    this.escucharComandasEnVivo();
  }

  ngOnDestroy(): void {
    if (this.subComandas) this.subComandas.unsubscribe();
    if (this.subCocineros) this.subCocineros.unsubscribe();
  }

  escucharCocinerosEnVivo(): void {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const qCocineros = query(usuariosRef, where('rol', '==', 'cocina'));
    
    this.subCocineros = new Subscription();
    const unsubscribe = onSnapshot(qCocineros, (snapshot: QuerySnapshot<DocumentData>) => {
      this.cocineros = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          nombre: data['nombre'] || 'Cocinero',
          platosEnCurso: 0,
          platosPreparadosHoy: data['platosPreparadosHoy'] || 0,
          historialPlatos: data['historialPlatos'] || []
        };
      }) as Cocinero[];

      this.actualizarMetricasCocineros();
      this.cdr.detectChanges();
    });

    this.subCocineros.add(() => unsubscribe());
  }

  escucharComandasEnVivo(): void {
    const pedidosRef = collection(this.firestore, 'pedidos');
    const q = query(pedidosRef, where('destino', '==', 'cocina'));
    
    this.subComandas = new Subscription();
    const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      // Cada documento es un ticket independiente en la cola de cocina
      this.comandasCola = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          idComanda: docSnap.id,
          numeroMesa: data['numeroMesa'] || '1',
          items: data['items'] || [],
          estado: data['estado'] || 'solicitado',
          horaPedido: data['fechaCreacion'] ? new Date(data['fechaCreacion']).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '12:00 PM',
          cocineroAsignado: data['cocineroAsignado'],
          timestamp: data['fechaCreacion'] ? new Date(data['fechaCreacion']).getTime() : 1
        };
      }) as ComandaCocina[];

      this.actualizarMetricasCocineros();
      this.cdr.detectChanges();
    });

    this.subComandas.add(() => unsubscribe());
  }

  actualizarMetricasCocineros(): void {
    if (!this.cocineros.length) return;
    this.cocineros.forEach(c => c.platosEnCurso = 0);

    this.comandasCola.forEach(cmd => {
      if (cmd.estado === 'preparando' && cmd.cocineroAsignado) {
        const cocinero = this.cocineros.find(c => c.nombre === cmd.cocineroAsignado);
        if (cocinero) {
          const totalItems = cmd.items ? cmd.items.reduce((sum, item) => sum + item.cantidad, 0) : 0;
          cocinero.platosEnCurso += totalItems;
        }
      }
    });
  }

  get comandasFiltradas(): ComandaCocina[] {
    let lista = [...this.comandasCola];
    if (this.filtroEstado !== 'todos') {
      lista = lista.filter(c => c.estado === this.filtroEstado);
    }
    return lista.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  contarEstado(estado: string): number {
    return this.comandasCola.filter(c => c.estado === estado).length;
  }

  async iniciarPreparacion(comanda: ComandaCocina): Promise<void> {
    if (!comanda.cocineroSeleccionadoTemporal) {
      Swal.fire({
        icon: 'warning',
        title: '¡Falta el cocinero!',
        text: 'Debes seleccionar un cocinero del menú desplegable.',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    const cocineroElegido = comanda.cocineroSeleccionadoTemporal;

    try {
      // Como cada tarjeta es un pedido independiente, actualizamos directo su idComanda
      const pedidoDocRef = doc(this.firestore, 'pedidos', comanda.idComanda);
      
      await updateDoc(pedidoDocRef, {
        estado: 'preparando',
        cocineroAsignado: cocineroElegido.nombre
      });

      Swal.fire({
        icon: 'info',
        title: '¡Comanda Tomada!',
        text: `${cocineroElegido.nombre} asumió la preparación de la Mesa N° ${comanda.numeroMesa}.`,
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      console.error('Error al tomar comanda:', error);
      Swal.fire('Error', 'No se pudo actualizar el estado.', 'error');
    }
  }

  async marcarListo(comanda: ComandaCocina): Promise<void> {
    try {
      // Como cada tarjeta es un pedido independiente, actualizamos directo su idComanda
      const ref = doc(this.firestore, 'pedidos', comanda.idComanda);
      await updateDoc(ref, {
        estado: 'listo'
      });

      Swal.fire({
        icon: 'success',
        title: '¡Plato Listo en Barra!',
        text: `Se notificó al mozo para la Mesa N° ${comanda.numeroMesa}.`,
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      console.error('Error al marcar listo:', error);
      Swal.fire('Error', 'No se pudo actualizar el estado.', 'error');
    }
  }

  verDetalleCocinero(cocinero: Cocinero): void {
    if (!cocinero.historialPlatos || cocinero.historialPlatos.length === 0) {
      Swal.fire({
        icon: 'info',
        title: cocinero.nombre,
        text: 'Aún no registra platos preparados en el turno de hoy.',
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#3b82f6'
      });
      return;
    }

    let htmlLista = '<div style="text-align: left; max-height: 250px; overflow-y: auto; font-size: 0.85rem;">';
    cocinero.historialPlatos.forEach((p, index) => {
      htmlLista += `
        <div style="background: #1e293b; padding: 8px; margin-bottom: 6px; border-radius: 6px; border-left: 3px solid #38bdf8; color: #f8fafc;">
          <strong>#${index + 1} - Mesa N° ${p.numeroMesa}</strong><br>
          🍽️ ${p.cantidad}x ${p.nombrePlato}<br>
          🕒 <em>Preparado a las: ${p.horaPreparado}</em>
        </div>
      `;
    });
    htmlLista += '</div>';

    Swal.fire({
      title: `📊 Detalle de ${cocinero.nombre}`,
      html: htmlLista,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#3b82f6',
      width: '400px'
    });
  }
}

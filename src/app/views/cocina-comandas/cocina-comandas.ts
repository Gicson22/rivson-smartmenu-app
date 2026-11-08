import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

interface ItemComanda {
  nombre: string;
  cantidad: number;
}

export interface ComandaCocina {
  idComanda: string;
  numeroMesa: number;
  items: ItemComanda[];
  estado: 'solicitado' | 'preparando' | 'listo';
  horaPedido: string;
  cocineroAsignado?: string;
  timestamp?: number;
}

interface DetallePlatoPreparado {
  nombrePlato: string;
  cantidad: number;
  numeroMesa: number;
  horaPreparado: string;
}

interface Cocinero {
  id: string;
  nombre: string;
  platosEnCurso: number;
  platosPreparadosHoy: number;
  historialPlatos: DetallePlatoPreparado[];
}

@Component({
  selector: 'app-cocina-comandas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cocina-comandas.html',
  styleUrl: './cocina-comandas.css'
})
export class CocinaComandas implements OnInit {
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // Filtro activo para las pestañas horizontales ('todos' | 'solicitado' | 'preparando' | 'listo')
  filtroEstado: 'todos' | 'solicitado' | 'preparando' | 'listo' = 'solicitado';

  cocineros: Cocinero[] = [
    { 
      id: 'c1', 
      nombre: 'Cocinero Carlos', 
      platosEnCurso: 0, 
      platosPreparadosHoy: 2,
      historialPlatos: [
        { nombrePlato: 'Ceviche Mixto Tradicional', cantidad: 2, numeroMesa: 1, horaPreparado: '12:35 PM' },
        { nombrePlato: 'Arroz con Mariscos', cantidad: 1, numeroMesa: 1, horaPreparado: '12:40 PM' }
      ]
    },
    { 
      id: 'c2', 
      nombre: 'Cocinero Mateo', 
      platosEnCurso: 1, 
      platosPreparadosHoy: 1,
      historialPlatos: [
        { nombrePlato: 'Parihuela Especial', cantidad: 1, numeroMesa: 4, horaPreparado: '12:15 PM' }
      ]
    },
    { 
      id: 'c3', 
      nombre: 'Cocinero Luis', 
      platosEnCurso: 0, 
      platosPreparadosHoy: 0,
      historialPlatos: []
    }
  ];

  comandasCola: ComandaCocina[] = [];

  ngOnInit(): void {
    this.cargarComandasPrueba();
  }

  cargarComandasPrueba(): void {
    this.comandasCola = [
      {
        idComanda: 'CMD-101',
        numeroMesa: 2,
        items: [
          { nombre: 'Chicharrón de Calamar', cantidad: 1 },
          { nombre: 'Arroz con Pato Norteño', cantidad: 2 }
        ],
        estado: 'solicitado',
        horaPedido: '12:50 PM',
        timestamp: 1
      },
      {
        idComanda: 'CMD-102',
        numeroMesa: 4,
        items: [
          { nombre: 'Seco de Cabrito', cantidad: 1 }
        ],
        estado: 'preparando',
        horaPedido: '12:55 PM',
        cocineroAsignado: 'Cocinero Mateo',
        timestamp: 2
      }
    ];
  }

  // Getter para filtrar las comandas según la pestaña seleccionada en la barra horizontal
  get comandasFiltradas(): ComandaCocina[] {
    let lista = [...this.comandasCola];
    if (this.filtroEstado !== 'todos') {
      lista = lista.filter(c => c.estado === this.filtroEstado);
    }
    // Ordenamos por timestamp (FIFO)
    return lista.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  // Contadores para las burbujas de la barra horizontal
  contarEstado(estado: string): number {
    return this.comandasCola.filter(c => c.estado === estado).length;
  }

  iniciarPreparacion(comanda: ComandaCocina, cocinero: Cocinero): void {
    comanda.estado = 'preparando';
    comanda.cocineroAsignado = cocinero.nombre;
    cocinero.platosEnCurso++;

    this.cdr.detectChanges();
    
    Swal.fire({
      icon: 'info',
      title: '¡Comanda Tomada!',
      text: `${cocinero.nombre} sumó la Mesa N° ${comanda.numeroMesa} a sus preparaciones.`,
      confirmButtonText: 'Aceptar',
      confirmButtonColor: '#3b82f6',
      allowOutsideClick: false
    });
  }

  marcarListo(comanda: ComandaCocina): void {
    comanda.estado = 'listo';

    if (comanda.cocineroAsignado) {
      const cocinero = this.cocineros.find(c => c.nombre === comanda.cocineroAsignado);
      if (cocinero) {
        if (cocinero.platosEnCurso > 0) {
          cocinero.platosEnCurso--;
        }
        cocinero.platosPreparadosHoy++;

        const horaActual = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        comanda.items.forEach(it => {
          cocinero.historialPlatos.push({
            nombrePlato: it.nombre,
            cantidad: it.cantidad,
            numeroMesa: comanda.numeroMesa,
            horaPreparado: horaActual
          });
        });
      }
    }

    this.cdr.detectChanges();

    Swal.fire({
      icon: 'success',
      title: '¡Plato Listo en Barra!',
      text: `Se notificó al mozo para la Mesa N° ${comanda.numeroMesa}.`,
      confirmButtonText: 'Aceptar',
      confirmButtonColor: '#10b981',
      allowOutsideClick: false
    });
  }

  verDetalleCocinero(cocinero: Cocinero): void {
    if (cocinero.historialPlatos.length === 0) {
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
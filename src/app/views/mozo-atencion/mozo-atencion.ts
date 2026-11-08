import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

interface ItemPedido {
  nombre: string;
  cantidad: number;
  tipo: 'comida' | 'bebida' | 'extra';
}

export interface MesaSalon {
  numeroMesa: number;
  mozoAsignado: string | null;
  estadoMesa: 'libre' | 'atendiendo' | 'llamando' | 'por_cobrar';
  llamadaMotivo?: string;
  pedidosBebidasExtras: ItemPedido[];
  platosEnCocina: {
    nombre: string;
    cantidad: number;
    estado: 'solicitado' | 'preparando' | 'listo';
  }[];
}

@Component({
  selector: 'app-mozo-atencion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mozo-atencion.html',
  styleUrl: './mozo-atencion.css'
})
export class MozoAtencion implements OnInit {
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  nombreMozoActual: string = 'Mozo Juan';

  // Pestaña activa en la barra superior del mozo
  filtroMozoTab: 'libres' | 'mis-mesas' | 'colegas' | 'alertas' = 'libres';

  mesasSalon: MesaSalon[] = [
    {
      numeroMesa: 1,
      mozoAsignado: 'Mozo Juan',
      estadoMesa: 'atendiendo',
      pedidosBebidasExtras: [
        { nombre: 'Jarra de Chicha Morada', cantidad: 1, tipo: 'bebida' },
        { nombre: 'Cerveza Cusqueña Hielera', cantidad: 2, tipo: 'bebida' }
      ],
      platosEnCocina: [
        { nombre: 'Ceviche Mixto Tradicional', cantidad: 2, estado: 'listo' }
      ]
    },
    {
      numeroMesa: 2,
      mozoAsignado: null, // Libre
      estadoMesa: 'libre',
      pedidosBebidasExtras: [],
      platosEnCocina: []
    },
    {
      numeroMesa: 3,
      mozoAsignado: 'Mozo Carlos', // Colega
      estadoMesa: 'atendiendo',
      pedidosBebidasExtras: [],
      platosEnCocina: [
        { nombre: 'Arroz con Mariscos', cantidad: 1, estado: 'preparando' }
      ]
    },
    {
      numeroMesa: 4,
      mozoAsignado: 'Mozo Juan',
      estadoMesa: 'llamando',
      llamadaMotivo: '🚨 ¡El cliente está pidiendo la Cuenta!',
      pedidosBebidasExtras: [],
      platosEnCocina: []
    },
    {
      numeroMesa: 5,
      mozoAsignado: null, // Libre
      estadoMesa: 'libre',
      pedidosBebidasExtras: [],
      platosEnCocina: []
    }
  ];

  ngOnInit(): void {}

  // Getter que filtra las mesas según la pestaña seleccionada en la barra horizontal
  get mesasFiltradas(): MesaSalon[] {
    if (this.filtroMozoTab === 'libres') {
      return this.mesasSalon.filter(m => !m.mozoAsignado);
    } else if (this.filtroMozoTab === 'mis-mesas') {
      return this.mesasSalon.filter(m => m.mozoAsignado === this.nombreMozoActual);
    } else if (this.filtroMozoTab === 'colegas') {
      return this.mesasSalon.filter(m => m.mozoAsignado && m.mozoAsignado !== this.nombreMozoActual);
    } else if (this.filtroMozoTab === 'alertas') {
      return this.mesasSalon.filter(m => m.estadoMesa === 'llamando');
    }
    return this.mesasSalon;
  }

  // Contadores dinámicos para los badges de las pestañas
  contarTab(tipo: string): number {
    if (tipo === 'libres') return this.mesasSalon.filter(m => !m.mozoAsignado).length;
    if (tipo === 'mis-mesas') return this.mesasSalon.filter(m => m.mozoAsignado === this.nombreMozoActual).length;
    if (tipo === 'colegas') return this.mesasSalon.filter(m => m.mozoAsignado && m.mozoAsignado !== this.nombreMozoActual).length;
    if (tipo === 'alertas') return this.mesasSalon.filter(m => m.estadoMesa === 'llamando').length;
    return 0;
  }

  tomarMesa(mesa: MesaSalon): void {
    mesa.mozoAsignado = this.nombreMozoActual;
    mesa.estadoMesa = 'atendiendo';

    this.cdr.detectChanges();

    Swal.fire({
      icon: 'success',
      title: '¡Mesa Asignada!',
      text: `Ahora te haces cargo de la Mesa N° ${mesa.numeroMesa}.`,
      confirmButtonText: 'Aceptar',
      confirmButtonColor: '#3b82f6',
      allowOutsideClick: false
    });
  }

  atenderLlamado(mesa: MesaSalon): void {
    mesa.estadoMesa = 'atendiendo';
    mesa.llamadaMotivo = undefined;

    this.cdr.detectChanges();

    Swal.fire({
      icon: 'info',
      title: '¡Llamado Atendido!',
      text: `Acudiste al llamado de la Mesa N° ${mesa.numeroMesa}.`,
      confirmButtonText: 'Aceptar',
      confirmButtonColor: '#10b981',
      allowOutsideClick: false
    });
  }

  entregarPlato(mesa: MesaSalon, plato: any): void {
    Swal.fire({
      icon: 'success',
      title: '¡Plato Entregado!',
      text: `Confirmaste la entrega de ${plato.cantidad}x ${plato.nombre} en la Mesa N° ${mesa.numeroMesa}.`,
      confirmButtonText: 'Aceptar',
      confirmButtonColor: '#10b981',
      allowOutsideClick: false
    });
  }

  marcarBebidaAtendida(mesa: MesaSalon, index: number): void {
    Swal.fire({
      icon: 'success',
      title: '¡Bebida / Extra Despachado!',
      text: `El pedido de la Mesa N° ${mesa.numeroMesa} fue entregado con éxito.`,
      confirmButtonText: 'Aceptar',
      confirmButtonColor: '#3b82f6',
      allowOutsideClick: false
    });
    mesa.pedidosBebidasExtras.splice(index, 1);
    this.cdr.detectChanges();
  }
}
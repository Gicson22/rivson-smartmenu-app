import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, addDoc, doc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface ComandaFirestore {
  id?: string;
  numeroMesa: number;
  items: { nombre: string; cantidad: number; tipo?: string }[];
  estado: 'solicitado' | 'preparando' | 'listo';
  horaPedido: string;
  cocineroAsignado?: string;
  mozoAsignado?: string | null;
  timestamp?: number;
}

@Injectable({
  providedIn: 'root'
})
export class FirestoreService {
  private firestore = inject(Firestore);

  // Obtener todas las comandas en tiempo real (Observable)
  getComandas(): Observable<ComandaFirestore[]> {
    const comandasRef = collection(this.firestore, 'comandas');
    return collectionData(comandasRef, { idField: 'id' }) as Observable<ComandaFirestore[]>;
  }

  // Crear una nueva comanda (ej. cuando el cliente hace el pedido por QR)
  async agregarComanda(comanda: ComandaFirestore): Promise<string> {
    const comandasRef = collection(this.firestore, 'comandas');
    const docRef = await addDoc(comandasRef, comanda);
    return docRef.id;
  }

  // Actualizar el estado o asignación de una comanda (ej. Cocina toma el pedido o lo marca listo)
  async actualizarComanda(id: string, data: Partial<ComandaFirestore>): Promise<void> {
    const comandaDocRef = doc(this.firestore, `comandas/${id}`);
    await updateDoc(comandaDocRef, data);
  }
}
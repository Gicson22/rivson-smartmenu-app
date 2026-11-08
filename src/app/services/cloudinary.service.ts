import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CloudinaryService {
  private cloudName = 'hac9neg3';
  private uploadPreset = 'regalos_preset'; // O el preset unsigned que uses

  // Método general que acepta la carpeta de destino como parámetro
  async subirImagen(file: File, carpeta: string = 'rivson_smartmenu/general'): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('folder', carpeta); // 👈 ¡Esto manda la foto directo a la carpeta ordenada en Cloudinary!

    const response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Error al subir la imagen a Cloudinary');
    }

    const data = await response.json();
    return data.secure_url; // URL pública lista para guardar en Firestore
  }
}
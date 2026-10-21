// Corre en el navegador: achica la foto antes de subirla (las de cámara pesan varios MB y el servidor
// acepta hasta ~4 MB). Si no puede (formato raro), devuelve el original y que el servidor se arregle.
export async function achicarFoto(archivo: Blob, lado: number): Promise<Blob> {
  try {
    const img = await createImageBitmap(archivo)
    const escala = Math.min(1, lado / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise((ok) => canvas.toBlob((b) => ok(b ?? archivo), 'image/jpeg', 0.88))
  } catch {
    return archivo
  }
}

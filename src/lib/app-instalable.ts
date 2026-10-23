// Corre en el navegador: GiftR como app (el service worker).

/**
 * El service worker de GiftR (avisos y compartir). Siempre el mismo script y el mismo scope, desde todos lados
 * (RegistrarSW y ActivarAvisos): con otro, el navegador reemplaza el registro (y con él, la suscripción a los avisos).
 */
export const registrarSW = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })

// En qué deploy corre la app. Los de prueba (la rama dev y los demás previews de Vercel) usan la misma base que producción,
// así que se tienen que distinguir a simple vista: otro ícono (verde, con "DEV") y otro nombre (ver layout.tsx y manifest.ts).
// Sin las variables de Vercel (en la compu, o si un día no estuvieran) es el de siempre: nunca producción con el de prueba.

/** Un deploy de prueba de Vercel (VERCEL_ENV la pone Vercel al compilar y al servir). */
export const DE_PRUEBA = process.env.VERCEL_ENV === 'preview'

/** El nombre de la app: con "dev" en los de prueba. */
export const NOMBRE_APP = DE_PRUEBA ? 'GiftR dev' : 'GiftR'

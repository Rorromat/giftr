import type { Metadata } from 'next'
import Link from 'next/link'
import { LogoSticker } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Tu privacidad en GiftR',
  description: 'Qué guarda GiftR de vos, quién ve qué, las cookies que usa y cómo descargar tus datos o borrar tu cuenta.',
}

// TODO(contacto): falta a quién escribirle por un tema de privacidad (un mail) y quién es el responsable del servicio (la
// razón social, si la hay). Lo completa el dueño del producto: no se inventa acá. Tampoco se afirma que se cumple ninguna
// ley en particular.

/**
 * Qué guarda GiftR, quién lo ve y cómo llevárselo o borrarlo, en pocas palabras. Pública y estática. Dice solo lo que el
 * código hace: si cambia quién ve algo (perfilPublico, misCuentas), una cookie (cookie-invitado.ts) o un servicio de
 * afuera (auth.ts, codazos.ts, pagina-de-afuera.ts), cambia también acá.
 */
export default function Privacidad() {
  return (
    <main className="flex flex-col gap-7 pb-16 pt-2">
      <header className="flex min-h-14 items-center justify-center"><Link href="/" aria-label="GiftR, al inicio"><LogoSticker /></Link></header>

      <div className="flex flex-col gap-2">
        <h1 className="gr-title">Tu privacidad en GiftR</h1>
        <p className="text-[15px] leading-snug text-gr-muted">Cortito: qué guardamos, quién lo ve y cómo te lo llevás o lo borrás.</p>
      </div>

      <Parte titulo="Qué guardamos y para qué">
        <li><b>De tu cuenta de Google:</b> tu nombre, tu mail y tu foto, para que entres y tu gente te reconozca. Tu contraseña no la vemos nunca.</li>
        <li><b>Lo que cargás vos:</b> tus deseos (con sus fotos, links y notas), tu cumple, tus gustos y talles, tu @usuario y, si querés, tu alias o CVU para que te transfieran.</li>
        <li><b>Lo que hacés para regalar:</b> qué reservaste o compraste, los regalos grupales en los que estás y sus cuentas, lo que escribís para coordinar un regalo y tus amigos invisibles.</li>
        <li><b>Tu gente:</b> tus amigos, las solicitudes y las listas que abriste.</li>
        <li><b>Si activás los avisos:</b> la dirección que nos da tu navegador para mandártelos a ese dispositivo. Los de la campanita se borran solos a los 60 días.</li>
        <li>GiftR no tiene publicidad ni herramientas de seguimiento de otras empresas.</li>
      </Parte>

      <Parte titulo="Quién ve qué">
        <li><b>La sorpresa:</b> quien arma una lista nunca ve quién le reservó o le compró algo, ni lo que hablan los que le regalan.</li>
        <li><b>Quien tiene el link de tu lista</b> ve tus deseos y tu perfil: nombre, foto, cumple (día y mes), gustos y talles. No hace falta que sea tu amigo ni que tenga cuenta. Tus amigos la ven sin el link.</li>
        <li><b>Los que regalan en una lista</b> con su cuenta ven entre ellos quién reservó qué, con su nombre, para no comprar lo mismo. Quien entra sin cuenta ve qué está ocupado; por quién, solo en las listas que no lo reservan a los que tienen cuenta.</li>
        <li><b>Tu alias o CVU</b> lo ve solo quien te debe su parte de un regalo grupal.</li>
        <li><b>Si pedís un aporte en plata,</b> el alias o CVU que pongas en ese deseo lo ve cualquiera que tenga el link de la lista. Quién aportó no lo ves en GiftR (lo ven los demás que regalan), y cuánto puso cada uno lo ve solo quien lo anotó.</li>
        <li><b>Tu @usuario</b> lo puede buscar cualquiera con cuenta para sumarte como amigo: ve tu nombre y tu foto.</li>
        <li><b>Tu mail</b> no aparece en tu lista ni en tu perfil.</li>
        <li><b>En un amigo invisible,</b> a quién le regalás lo sabés solo vos.</li>
        <li><b>Si regalás sin cuenta,</b> dejás solo un nombre (lo ven los demás que regalan en esa lista) y una cookie en tu navegador para reconocerte.</li>
      </Parte>

      <Parte titulo="Las cookies que usamos">
        <li><b>La de sesión:</b> para que sigas adentro después de entrar con Google.</li>
        <li><b>La de invitado:</b> si regalás sin cuenta, recuerda quién sos en ese navegador. Dura un año.</li>
        <li><b>La de cuentas del navegador:</b> anota qué cuentas entraron ahí. Sirve para cuidar la sorpresa en un dispositivo compartido: después de cerrar sesión, desde ese navegador nadie ve quién te reservó qué.</li>
        <li>Tres más son chicas: que dijiste “No soy yo” cuando te preguntamos por un invitado, a quién sacaste de las sugerencias con “Ahora no”, y cuántos invitados se anotaron hoy desde ese navegador (hay un tope por día).</li>
        <li>Ninguna es de publicidad ni de otra empresa.</li>
      </Parte>

      <Parte titulo="Con quién se comparte algo">
        <li><b>Google,</b> para entrar: nos da tu nombre, tu mail y tu foto. De lo que hacés en GiftR no le mandamos nada.</li>
        <li><b>Vercel y Neon:</b> donde corre GiftR y donde está su base de datos. Ahí se guarda todo lo de arriba.</li>
        <li><b>El servicio de avisos de tu navegador</b> (el de Google, Apple, Mozilla o Microsoft, según cuál uses): si activás los avisos, pasan por ahí, cifrados.</li>
        <li><b>Las tiendas:</b> cuando pegás el link de un producto, GiftR pide esa página para completar el nombre, la foto y el precio. Solo se pide la página; no se manda nada tuyo. <Link href="/bot" className="font-semibold underline underline-offset-2">Cómo lee los links</Link>.</li>
        <li><b>Fotos y videos de otros sitios:</b> algunas fotos se muestran desde la tienda o desde Google (tu foto, si no subiste otra), y los videos desde YouTube, TikTok, Instagram o Vimeo. Al verlos, tu navegador se los pide a ese sitio.</li>
      </Parte>

      <Parte titulo="Lo que podés hacer">
        <li><b>Cambiar el link de tu lista:</b> en <Link href="/perfil#link" className="font-semibold underline underline-offset-2">tu perfil</Link>, “Cambiar el link para regalar”. El de antes deja de andar para todos los que lo tenían. Dejar de ser amigos de alguien no le saca el link que ya vio: para eso, cambialo.</li>
        <li><b>Descargar tus datos:</b> en tu perfil, “Descargar mis datos”. Baja un archivo con todo lo tuyo.</li>
        <li><b>Borrar tu cuenta:</b> en tu perfil, “Borrar mi cuenta”. Se borra lo tuyo. Lo que compartías con otros y no se puede borrar sin romperles algo (las cuentas de un regalo grupal ya comprado, un amigo invisible ya sorteado, lo que ya compraste para alguien) queda a nombre de “Cuenta eliminada”, sin tu nombre, tu mail ni tu foto.</li>
        <li><b>Si regalaste sin cuenta,</b> tu nombre queda junto a lo que reservaste. “Salir de este dispositivo” borra la cookie de ese navegador.</li>
      </Parte>
    </main>
  )
}

function Parte({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="gr-heading">{titulo}</h2>
      <ul className="gr-card flex list-disc flex-col gap-2.5 py-4 pl-9 pr-4 text-[15px] leading-snug">{children}</ul>
    </section>
  )
}

import { redirect } from 'next/navigation'

// Los grupos (listas en común) se eligen arriba de Mi lista; este link viejo lleva ahí.
export default function Grupos() {
  redirect('/mi-lista')
}

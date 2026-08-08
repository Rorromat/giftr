import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { addItemAction } from '@/app/actions'

const CATEGORIAS = ['Tecnología', 'Casa', 'Ropa', 'Libros', 'Experiencias', 'Hobbies']

export default async function Agregar() {
  const session = await auth()
  if (!session?.userId) redirect('/')

  return (
    <main className="pt-6">
      <h1 className="text-2xl font-bold">Agregar deseo</h1>
      <form action={addItemAction} className="mt-4 space-y-4">
        <input name="titulo" required placeholder="¿Qué querés? Pegá un link o escribí"
               className="w-full rounded-2xl border border-stone-300 p-3" />
        <div className="flex gap-2">
          <label className="flex-1 rounded-2xl border border-stone-300 p-3 text-center has-[:checked]:border-[#E2725B] has-[:checked]:bg-orange-50">
            <input type="radio" name="tipo" value="exacto" defaultChecked className="sr-only" /> Quiero ESTO
          </label>
          <label className="flex-1 rounded-2xl border border-stone-300 p-3 text-center has-[:checked]:border-[#E2725B] has-[:checked]:bg-orange-50">
            <input type="radio" name="tipo" value="idea" className="sr-only" /> Algo así
          </label>
        </div>
        <input name="linkTienda" placeholder="Link a la tienda (opcional)" className="w-full rounded-2xl border border-stone-300 p-3" />
        <input name="fotoUrl" placeholder="URL de foto (opcional)" className="w-full rounded-2xl border border-stone-300 p-3" />
        <div className="flex gap-2">
          <input name="precio" placeholder="Precio (ej. $45.000)" className="w-1/2 rounded-2xl border border-stone-300 p-3" />
          <input name="cantidad" type="number" min="1" defaultValue="1" className="w-1/2 rounded-2xl border border-stone-300 p-3" />
        </div>
        <input name="rangoPrecio" placeholder="Rango si es idea (ej. $10–30k)" className="w-full rounded-2xl border border-stone-300 p-3" />
        <select name="categoria" className="w-full rounded-2xl border border-stone-300 p-3">
          <option value="">Categoría…</option>
          {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select name="prioridad" defaultValue="gustaria" className="w-full rounded-2xl border border-stone-300 p-3">
          <option value="mucho">❤️❤️❤️ Lo quiero mucho</option>
          <option value="gustaria">❤️❤️ Me gustaría</option>
          <option value="suelta">❤️ Idea suelta</option>
        </select>
        <textarea name="notas" placeholder="Notas (talle, color…)" className="w-full rounded-2xl border border-stone-300 p-3" />
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" name="repetible" /> Se puede repetir (para ideas)
        </label>
        <button className="w-full rounded-2xl bg-[#E2725B] py-3 font-semibold text-white shadow-md">Agregar a mi lista</button>
      </form>
    </main>
  )
}

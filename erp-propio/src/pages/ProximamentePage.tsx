export function ProximamentePage({ titulo, fase }: { titulo: string; fase: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800">{titulo}</h1>
      <p className="mt-1 text-sm text-slate-400">{fase} — esquema real ya desplegado, pantalla pendiente de construir.</p>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-400">
        Próximamente
      </div>
    </div>
  )
}

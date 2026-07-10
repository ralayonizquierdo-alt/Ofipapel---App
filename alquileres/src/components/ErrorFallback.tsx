export default function ErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-6">
      <div className="max-w-sm text-center">
        <p className="text-lg font-semibold text-slate-800">Algo ha ido mal</p>
        <p className="mt-2 text-sm text-slate-500">
          Se ha registrado el error. Recarga la página para seguir.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Recargar
        </button>
      </div>
    </div>
  )
}

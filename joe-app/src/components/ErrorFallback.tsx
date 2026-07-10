export default function ErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-6">
      <div className="max-w-sm text-center">
        <p className="text-lg font-semibold text-neutral-800">Algo ha ido mal</p>
        <p className="mt-2 text-sm text-neutral-500">
          Se ha registrado el error. Recarga la página para seguir.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-5 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Recargar
        </button>
      </div>
    </div>
  )
}

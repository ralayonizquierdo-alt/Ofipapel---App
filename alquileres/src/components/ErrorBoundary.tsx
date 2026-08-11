import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null; info: string }

/**
 * Sin esto, cualquier error de React deja la pantalla completamente en blanco
 * y sin ninguna pista de qué ha fallado. Aquí lo capturamos y lo mostramos en
 * pantalla para poder diagnosticarlo desde el móvil, sin necesidad de abrir la
 * consola del navegador.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack || '' })
    console.error('Error capturado por ErrorBoundary:', error, info)
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    const detalle = `${error.name}: ${error.message}\n\n${error.stack || ''}\n\nComponentes:${info}`

    return (
      <div className="min-h-screen bg-slate-100 p-4 flex items-start justify-center">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-5 mt-6">
          <h1 className="text-base font-semibold text-red-700 mb-1">Se ha producido un error</h1>
          <p className="text-sm text-slate-600 mb-3">
            La aplicación ha fallado. Copia este texto y envíalo para poder corregirlo.
          </p>

          <pre className="text-[11px] leading-snug bg-slate-900 text-slate-100 rounded-lg p-3 overflow-auto max-h-80 whitespace-pre-wrap break-words">
            {detalle}
          </pre>

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => navigator.clipboard?.writeText(detalle)}
              className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
            >
              Copiar error
            </button>
            <button
              onClick={() => this.setState({ error: null, info: '' })}
              className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
            >
              Volver a intentar
            </button>
            <button
              onClick={() => location.reload()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              Recargar
            </button>
          </div>
        </div>
      </div>
    )
  }
}

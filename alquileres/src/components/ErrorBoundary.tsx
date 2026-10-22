import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null; info: string; copiado: boolean }

/** Chrome marca el <html> al traducir y envuelve el texto en <font style="vertical-align:inherit">.
 *  Si está traduciendo, reescribe el DOM por debajo de React y la app se cae haga
 *  lo que haga el código: no es un fallo que se pueda esquivar, hay que avisar.
 *
 *  Hay que vigilarlo desde el arranque: cuando el árbol se cae, los <font> del
 *  traductor se van con él, así que comprobarlo al renderizar el error llega tarde. */
let traductorVisto = false

function comprobarTraductor(): boolean {
  if (/translated/.test(document.documentElement.className)) traductorVisto = true
  else if (document.querySelector('font[style*="vertical-align"]')) traductorVisto = true
  return traductorVisto
}

if (typeof MutationObserver !== 'undefined') {
  comprobarTraductor()
  new MutationObserver(comprobarTraductor).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
  })
}

/** navigator.clipboard falla o no existe en varios navegadores móviles y en
 *  navegadores embebidos (Facebook, Instagram…), así que hace falta respaldo. */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

/**
 * Sin esto, cualquier error de React deja la pantalla completamente en blanco
 * y sin ninguna pista de qué ha fallado. Aquí lo capturamos y lo mostramos en
 * pantalla para poder diagnosticarlo desde el móvil, sin necesidad de abrir la
 * consola del navegador.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '', copiado: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack || '' })
    console.error('Error capturado por ErrorBoundary:', error, info)
  }

  render() {
    const { error, info, copiado } = this.state
    if (!error) return this.props.children

    const detalle = `${error.name}: ${error.message}\n\n${error.stack || ''}\n\nComponentes:${info}`

    return (
      <div className="min-h-screen bg-slate-100 p-4 flex items-start justify-center" translate="no">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-5 mt-6">
          <h1 className="text-base font-semibold text-red-700 mb-1">Se ha producido un error</h1>

          {comprobarTraductor() ? (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-3">
              <p className="text-sm font-semibold text-amber-900 mb-1">
                El navegador está traduciendo esta página
              </p>
              <p className="text-sm text-amber-900">
                Eso es lo que rompe la aplicación. Desactívalo así: menú <b>⋮</b> del
                navegador → <b>Traducir</b> → <b>Nunca traducir este sitio</b>. Después
                recarga. La app ya está en español, no necesita traducción.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600 mb-3">
              La aplicación ha fallado. Copia este texto y envíalo para poder corregirlo.
            </p>
          )}

          {/* Seleccionable a mano por si el botón de copiar tampoco funciona */}
          <pre
            onClick={e => {
              const r = document.createRange()
              r.selectNodeContents(e.currentTarget)
              const sel = getSelection()
              sel?.removeAllRanges()
              sel?.addRange(r)
            }}
            className="text-[11px] leading-snug bg-slate-900 text-slate-100 rounded-lg p-3 overflow-auto max-h-80 whitespace-pre-wrap break-words select-all"
          >
            {detalle}
          </pre>

          <div className="flex gap-3 mt-4">
            <button
              onClick={async () => this.setState({ copiado: await copiar(detalle) })}
              className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
            >
              {copiado ? '¡Copiado!' : 'Copiar error'}
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

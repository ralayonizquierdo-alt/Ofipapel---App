// Pestaña «Operativa»: cómo se usa una pantalla, en pocas líneas (petición de Luis, 29/10/2026:
// cada pantalla nueva o cambiada lleva la suya, a modo de manual).

export interface BloqueOperativa {
  titulo: string
  /** Pasos numerados. */
  pasos?: string[]
  /** Notas sueltas, con viñeta. */
  notas?: string[]
}

export function GwOperativa({ bloques }: { bloques: BloqueOperativa[] }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-4 p-1 text-[15px] leading-[22px]">
      {bloques.map((b) => (
        <section key={b.titulo} className="flex flex-col gap-1">
          <h3 className="text-[16px] font-bold text-[#1d3a8a]">{b.titulo}</h3>
          {b.pasos && (
            <ol className="ml-6 list-decimal">
              {b.pasos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          )}
          {b.notas && (
            <ul className="ml-6 list-disc">
              {b.notas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

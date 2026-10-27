// Markdown básico para las respuestas de NEXA, sin dependencias y sin innerHTML (todo se
// construye como elementos de React, así que el texto de la IA nunca se interpreta como HTML).
// Soporta: párrafos, títulos (#), listas (- * 1.), tablas (| a | b |), citas (>), bloques de
// código (```), **negrita**, *cursiva* / _cursiva_, `código` y enlaces [texto](url).

import { Fragment, type ReactNode } from 'react'

type Bloque =
  | { t: 'p'; texto: string }
  | { t: 'h'; nivel: number; texto: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'tabla'; cabecera: string[]; filas: string[][]; alineacion: ('left' | 'right' | 'center')[] }
  | { t: 'code'; texto: string }
  | { t: 'cita'; texto: string }
  | { t: 'hr' }

const esFilaTabla = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const esSeparador = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)
const celdas = (l: string) =>
  l
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

function analizar(md: string): Bloque[] {
  const lineas = md.replace(/\r\n?/g, '\n').split('\n')
  const bloques: Bloque[] = []
  let i = 0
  while (i < lineas.length) {
    const l = lineas[i]
    if (!l.trim()) {
      i++
      continue
    }
    if (/^\s*```/.test(l)) {
      const cuerpo: string[] = []
      i++
      while (i < lineas.length && !/^\s*```/.test(lineas[i])) cuerpo.push(lineas[i++])
      i++
      bloques.push({ t: 'code', texto: cuerpo.join('\n') })
      continue
    }
    const h = l.match(/^\s*(#{1,4})\s+(.*)$/)
    if (h) {
      bloques.push({ t: 'h', nivel: h[1].length, texto: h[2] })
      i++
      continue
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
      bloques.push({ t: 'hr' })
      i++
      continue
    }
    if (esFilaTabla(l) && i + 1 < lineas.length && esSeparador(lineas[i + 1])) {
      const cabecera = celdas(l)
      const alineacion = celdas(lineas[i + 1]).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left',
      ) as ('left' | 'right' | 'center')[]
      i += 2
      const filas: string[][] = []
      while (i < lineas.length && esFilaTabla(lineas[i])) filas.push(celdas(lineas[i++]))
      bloques.push({ t: 'tabla', cabecera, filas, alineacion })
      continue
    }
    if (/^\s*>/.test(l)) {
      const cuerpo: string[] = []
      while (i < lineas.length && /^\s*>/.test(lineas[i])) cuerpo.push(lineas[i++].replace(/^\s*>\s?/, ''))
      bloques.push({ t: 'cita', texto: cuerpo.join(' ') })
      continue
    }
    const ul = /^\s*[-*•]\s+/
    const ol = /^\s*\d+[.)]\s+/
    if (ul.test(l) || ol.test(l)) {
      const tipo = ul.test(l) ? 'ul' : 'ol'
      const re = tipo === 'ul' ? ul : ol
      const items: string[] = []
      while (i < lineas.length && (re.test(lineas[i]) || (/^\s{2,}\S/.test(lineas[i]) && items.length))) {
        if (re.test(lineas[i])) items.push(lineas[i].replace(re, ''))
        else items[items.length - 1] += ' ' + lineas[i].trim()
        i++
      }
      bloques.push({ t: tipo, items })
      continue
    }
    const parrafo: string[] = []
    while (
      i < lineas.length &&
      lineas[i].trim() &&
      !/^\s*(```|#{1,4}\s|>|[-*•]\s|\d+[.)]\s)/.test(lineas[i]) &&
      !(esFilaTabla(lineas[i]) && esSeparador(lineas[i + 1] ?? ''))
    ) {
      parrafo.push(lineas[i++])
    }
    if (!parrafo.length) parrafo.push(lineas[i++])
    bloques.push({ t: 'p', texto: parrafo.join('\n') })
  }
  return bloques
}

// ---------------------------------------------------------------- En línea

const RE_EN_LINEA = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\([^)\s]+\))/g

function enLinea(texto: string, clave = ''): ReactNode[] {
  const out: ReactNode[] = []
  let ultimo = 0
  let n = 0
  for (const m of texto.matchAll(RE_EN_LINEA)) {
    const idx = m.index ?? 0
    if (idx > ultimo) out.push(saltos(texto.slice(ultimo, idx), `${clave}t${n}`))
    const s = m[0]
    const k = `${clave}m${n++}`
    if (s.startsWith('`')) out.push(<code key={k} className="rounded bg-slate-200/70 px-1 font-mono text-[11.5px]">{s.slice(1, -1)}</code>)
    else if (s.startsWith('**') || s.startsWith('__')) out.push(<strong key={k}>{enLinea(s.slice(2, -2), k)}</strong>)
    else if (s.startsWith('[')) {
      const mm = s.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!
      const url = mm[2]
      const seguro = /^https?:\/\//i.test(url)
      out.push(
        seguro ? (
          <a key={k} href={url} target="_blank" rel="noreferrer noopener" className="text-[#1f4e9c] underline">
            {mm[1]}
          </a>
        ) : (
          <span key={k}>{mm[1]}</span>
        ),
      )
    } else out.push(<em key={k}>{enLinea(s.slice(1, -1), k)}</em>)
    ultimo = idx + s.length
  }
  if (ultimo < texto.length) out.push(saltos(texto.slice(ultimo), `${clave}t${n}`))
  return out
}

function saltos(texto: string, clave: string) {
  const partes = texto.split('\n')
  return (
    <Fragment key={clave}>
      {partes.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {p}
        </Fragment>
      ))}
    </Fragment>
  )
}

// ---------------------------------------------------------------- Componente

const pareceNumero = (s: string) => /^[-+]?[\d.,\s]+\s*(€|%|uds?\.?)?$/i.test(s.replace(/\*\*/g, '').trim()) && /\d/.test(s)

export function Markdown({ texto }: { texto: string }) {
  const bloques = analizar(texto)
  return (
    <div className="nexa-md space-y-2">
      {bloques.map((b, i) => {
        switch (b.t) {
          case 'p':
            return <p key={i}>{enLinea(b.texto)}</p>
          case 'h':
            return (
              <p key={i} className={b.nivel <= 2 ? 'text-[14px] font-bold' : 'font-bold'}>
                {enLinea(b.texto)}
              </p>
            )
          case 'ul':
            return (
              <ul key={i} className="list-disc space-y-0.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{enLinea(it)}</li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} className="list-decimal space-y-0.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{enLinea(it)}</li>
                ))}
              </ol>
            )
          case 'code':
            return (
              <pre key={i} className="overflow-x-auto rounded bg-slate-900/90 px-2.5 py-2 font-mono text-[11.5px] leading-snug text-slate-100">
                {b.texto}
              </pre>
            )
          case 'cita':
            return (
              <blockquote key={i} className="border-l-2 border-[#1f4e9c]/50 pl-2.5 text-slate-600">
                {enLinea(b.texto)}
              </blockquote>
            )
          case 'hr':
            return <hr key={i} className="border-slate-300/70" />
          case 'tabla': {
            // Columnas numéricas a la derecha aunque la IA no lo marque.
            const numerica = b.cabecera.map((_, c) => b.filas.length > 0 && b.filas.every((f) => !f[c] || pareceNumero(f[c])))
            const alin = (c: number) => (b.alineacion[c] !== 'left' ? b.alineacion[c] : numerica[c] ? 'right' : 'left')
            return (
              <div key={i} className="nexa-tabla max-w-full overflow-x-auto rounded border border-slate-300/80 bg-white/80">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[#1f4e9c]/10">
                      {b.cabecera.map((c, j) => (
                        <th key={j} style={{ textAlign: alin(j) }} className="whitespace-nowrap border-b border-slate-300 px-2 py-1 font-semibold text-slate-700">
                          {enLinea(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.filas.map((f, r) => (
                      <tr key={r} className="odd:bg-white even:bg-slate-50/80">
                        {b.cabecera.map((_, j) => (
                          <td key={j} style={{ textAlign: alin(j) }} className={`border-b border-slate-200 px-2 py-[3px] align-top ${numerica[j] ? 'whitespace-nowrap tabular-nums' : ''}`}>
                            {enLinea(f[j] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        }
      })}
    </div>
  )
}

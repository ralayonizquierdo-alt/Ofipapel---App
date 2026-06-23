import { useState, useEffect } from 'react'
import { format, parseISO, isFuture } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, X, Stethoscope, Utensils, Pill, StickyNote, Weight, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { LimonRecord } from '../types'

const TYPE_CONFIG = {
  vet:        { label: 'Veterinario', icon: Stethoscope, color: '#e05252', bg: '#e0525215' },
  medication: { label: 'Medicación',  icon: Pill,        color: '#5b8dd9', bg: '#5b8dd915' },
  food:       { label: 'Comida',      icon: Utensils,    color: '#6db56d', bg: '#6db56d15' },
  weight:     { label: 'Peso',        icon: Weight,      color: '#c9a96e', bg: '#c9a96e15' },
  note:       { label: 'Nota',        icon: StickyNote,  color: '#888888', bg: '#88888815' },
} as const

type RecordType = keyof typeof TYPE_CONFIG

const emptyForm = (): Partial<LimonRecord> => ({
  type: 'vet',
  title: '',
  description: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  next_date: '',
  value: '',
})

export default function LimonPage() {
  const [records, setRecords] = useState<LimonRecord[]>([])
  const [filter, setFilter] = useState<RecordType | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<Partial<LimonRecord>>(emptyForm())

  useEffect(() => { loadRecords() }, [])

  async function loadRecords() {
    const { data } = await supabase
      .from('limon_records')
      .select('*')
      .order('date', { ascending: false })
    if (data) setRecords(data)
  }

  async function save() {
    if (!form.title?.trim()) return
    if (form.id) {
      await supabase.from('limon_records').update(form).eq('id', form.id)
    } else {
      await supabase.from('limon_records').insert(form)
    }
    setShowModal(false)
    setForm(emptyForm())
    loadRecords()
  }

  async function del(id: string) {
    await supabase.from('limon_records').delete().eq('id', id)
    loadRecords()
  }

  const upcoming = records.filter(r => r.next_date && isFuture(parseISO(r.next_date)))
  const filtered = filter === 'all' ? records : records.filter(r => r.type === filter)

  return (
    <div className="animate-fadeIn max-w-3xl mx-auto">

      {/* Hero banner con el gato */}
      <div className="relative rounded-2xl overflow-hidden mb-8"
        style={{
          background: 'linear-gradient(135deg, #0e1a0e 0%, #111 50%, #1a1208 100%)',
          border: '1px solid #2a3a2a',
          minHeight: '200px',
        }}
      >
        {/* Resplandor verde suave */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 20% 50%, #6db56d22 0%, transparent 60%)' }} />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 80% 30%, #c9a96e12 0%, transparent 50%)' }} />

        {/* Foto real de Limón — fondo difuminado */}
        <div className="absolute right-0 top-0 bottom-0 w-56 pointer-events-none"
          style={{ opacity: 0.25, filter: 'blur(3px)' }}>
          <img src={`${import.meta.env.BASE_URL}limon.png`} alt="" className="w-full h-full object-contain object-bottom" />
        </div>

        {/* Foto real de Limón — destacada */}
        <div className="absolute right-2 bottom-0 w-44 pointer-events-none"
          style={{ filter: 'drop-shadow(0 0 24px #6db56d40)' }}>
          <img src={`${import.meta.env.BASE_URL}limon.png`} alt="Limón" className="w-full" />
        </div>

        {/* Overlay para que el texto sea legible */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to right, #0e1a0e 40%, transparent 75%)' }} />

        {/* Texto */}
        <div className="relative z-10 px-7 py-7">
          <p className="text-xs tracking-[0.3em] uppercase text-[#6db56d80] mb-2">El rey de la casa</p>
          <h2 className="font-display text-4xl font-bold leading-none mb-1" style={{
            background: 'linear-gradient(135deg, #a0d4a0, #6db56d, #c9a96e)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Limón
          </h2>
          <p className="text-2xl mt-1">🍋</p>
        </div>
      </div>

      {/* Botón nueva entrada */}
      <div className="flex justify-end mb-6">
        <button
          onClick={() => { setForm(emptyForm()); setShowModal(true) }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} /> Nueva entrada
        </button>
      </div>

      {/* Próximas citas */}
      {upcoming.length > 0 && (
        <div className="card mb-6 border-[#e05252]/30 bg-[#e0525208]">
          <h3 className="text-sm font-semibold text-[#e0e0e0] flex items-center gap-2 mb-3">
            <AlertCircle size={14} className="text-[#e05252]" /> Próximas citas
          </h3>
          <div className="space-y-2">
            {upcoming.slice(0, 3).map(r => {
              const cfg = TYPE_CONFIG[r.type]
              const Icon = cfg.icon
              return (
                <div key={r.id} className="flex items-center gap-3 text-sm">
                  <Icon size={14} style={{ color: cfg.color }} />
                  <span className="text-[#ccc] flex-1">{r.title}</span>
                  <span className="text-[#888] text-xs">
                    {format(parseISO(r.next_date!), "d MMM", { locale: es })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            filter === 'all' ? 'bg-[#c9a96e] text-[#0a0a0a] border-[#c9a96e]' : 'border-[#2a2a2a] text-[#888] hover:border-[#3a3a3a]'
          }`}
        >
          Todo
        </button>
        {(Object.keys(TYPE_CONFIG) as RecordType[]).map(key => {
          const cfg = TYPE_CONFIG[key]
          const Icon = cfg.icon
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filter === key ? 'text-[#0a0a0a] border-transparent' : 'border-[#2a2a2a] text-[#888]'
              }`}
              style={filter === key ? { backgroundColor: cfg.color } : {}}
            >
              <Icon size={11} /> {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Lista registros */}
      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <span className="text-5xl">🍋</span>
          <p className="text-[#555] mt-4">Sin registros aún</p>
          <p className="text-[#444] text-sm">Añade la primera entrada de Limón</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const cfg = TYPE_CONFIG[r.type]
            const Icon = cfg.icon
            return (
              <div
                key={r.id}
                className="card cursor-pointer hover:border-[#3a3a3a] transition-all group"
                onClick={() => { setForm(r); setShowModal(true) }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cfg.bg }}>
                    <Icon size={16} style={{ color: cfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[#e0e0e0]">{r.title}</p>
                      {r.value && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                          {r.value}
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <p className="text-xs text-[#666] mt-0.5 truncate">{r.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-[#555]">
                        {format(parseISO(r.date), "d MMM yyyy", { locale: es })}
                      </span>
                      {r.next_date && (
                        <span className="text-xs text-[#888]">
                          → próxima: {format(parseISO(r.next_date), "d MMM", { locale: es })}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); del(r.id) }}
                    className="text-[#444] hover:text-[#e05252] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-md animate-fadeIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">Registro de Limón</h3>
              <button onClick={() => { setShowModal(false); setForm(emptyForm()) }} className="text-[#555] hover:text-[#888]">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Tipo */}
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider block mb-2">Tipo</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(Object.keys(TYPE_CONFIG) as RecordType[]).map(key => {
                    const cfg = TYPE_CONFIG[key]
                    const Icon = cfg.icon
                    return (
                      <button
                        key={key}
                        onClick={() => setForm(p => ({ ...p, type: key }))}
                        className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-all ${
                          form.type === key ? 'border-transparent text-[#0a0a0a]' : 'border-[#2a2a2a] text-[#666]'
                        }`}
                        style={form.type === key ? { backgroundColor: cfg.color } : {}}
                      >
                        <Icon size={14} />
                        <span className="leading-none">{cfg.label.split(' ')[0]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Título</label>
                <input
                  type="text"
                  value={form.title ?? ''}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Vacuna antirrábica, pienso premium..."
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Fecha</label>
                  <input type="date" value={form.date ?? ''} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#c9a96e] focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Próxima cita</label>
                  <input type="date" value={form.next_date ?? ''} onChange={e => setForm(p => ({ ...p, next_date: e.target.value }))}
                    className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#c9a96e] focus:outline-none" />
                </div>
              </div>
              {(form.type === 'weight' || form.type === 'medication' || form.type === 'food') && (
                <div>
                  <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">
                    {form.type === 'weight' ? 'Peso (kg)' : form.type === 'medication' ? 'Dosis' : 'Cantidad/Marca'}
                  </label>
                  <input type="text" value={form.value ?? ''} onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                    className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#c9a96e] focus:outline-none" />
                </div>
              )}
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Notas</label>
                <textarea value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-2">
              <button onClick={() => { setShowModal(false); setForm(emptyForm()) }} className="btn-ghost">Cancelar</button>
              <button onClick={save} className="btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

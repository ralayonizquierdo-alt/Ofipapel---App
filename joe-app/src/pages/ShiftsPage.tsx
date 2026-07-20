import { useState, useEffect } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, isSameDay, isToday,
  startOfWeek, endOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, Plus, X, MapPin,
  Moon, Sun, Sunrise, Sunset, Activity, Eraser,
  Building2, Stethoscope, Layers, Mic, MicOff, Download, Settings,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { HospitalShift } from '../types'

// ── Shift type definitions ───────────────────────────────────────────────────

interface ShiftTypeDef {
  key: string
  label: string
  color: string
  bg: string
  hours: number
  builtIn: boolean
  icon?: React.ElementType<{ size?: number; style?: React.CSSProperties; className?: string }>
}

const BUILTIN: ShiftTypeDef[] = [
  { key: 'morning',   label: 'Mañana', color: '#e0a84a', bg: '#e0a84a15', hours: 7,  builtIn: true, icon: Sun },
  { key: 'dia',       label: 'Día',    color: '#e05252', bg: '#e0525215', hours: 12, builtIn: true, icon: Sunrise },
  { key: 'afternoon', label: 'Tarde',  color: '#e0854a', bg: '#e0854a15', hours: 7,  builtIn: true, icon: Sunset },
  { key: 'night',     label: 'Noche',  color: '#5b8dd9', bg: '#5b8dd915', hours: 12, builtIn: true, icon: Moon },
  { key: 'hd',        label: 'HD',     color: '#c97ab0', bg: '#c97ab015', hours: 0,  builtIn: true, icon: Activity },
  { key: 'free',      label: 'Libre',  color: '#6db56d', bg: '#6db56d15', hours: 0,  builtIn: true, icon: X },
]

const CUSTOM_KEY = 'joe_shift_types'

function loadCustom(): ShiftTypeDef[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]') } catch { return [] }
}

function saveCustom(types: ShiftTypeDef[]) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(types)) } catch {}
}

function hexBg(hex: string) { return hex + '20' }

function slugKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now()
}

// ── Work-center config ───────────────────────────────────────────────────────

type WorkCenter = 'hospital' | 'centro_salud'

const TAB_CONFIG: Record<WorkCenter, { label: string; icon: typeof Building2; color: string }> = {
  hospital:     { label: 'Hospital',        icon: Building2,   color: '#5b8dd9' },
  centro_salud: { label: 'Centro de Salud', icon: Stethoscope, color: '#9b6bb5' },
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ShiftsPage() {
  const [activeTab, setActiveTab]   = useState<WorkCenter>('hospital')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [shifts, setShifts]         = useState<HospitalShift[]>([])
  const [selected, setSelected]     = useState<Date>(new Date())
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm]             = useState<Partial<HospitalShift>>({ shift_type: 'morning', location: '', floor: '' })
  const [listeningNotes, setListeningNotes] = useState(false)

  // Custom shift types
  const [customTypes, setCustomTypes] = useState<ShiftTypeDef[]>(loadCustom)
  const allTypes = [...BUILTIN, ...customTypes]

  function getType(key: string): ShiftTypeDef {
    return allTypes.find(t => t.key === key) ?? { key, label: key, color: '#888', bg: '#88888820', hours: 0, builtIn: false }
  }

  // Import modal
  const [showImport, setShowImport]           = useState(false)
  const [importMonth, setImportMonth]         = useState(new Date())
  const [importBrush, setImportBrush]         = useState<string>('morning')
  const [importSelections, setImportSelections] = useState<Record<string, string | null>>({})
  const [importDbShifts, setImportDbShifts]   = useState<HospitalShift[]>([])

  // Types management modal
  const [showTypes, setShowTypes]   = useState(false)
  const [newLabel, setNewLabel]     = useState('')
  const [newColor, setNewColor]     = useState('#c9a96e')
  const [newHours, setNewHours]     = useState<number>(8)
  // Edit built-in hours
  const [editHours, setEditHours]   = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('joe_shift_hours') ?? '{}') } catch { return {} }
  })

  // ── Data ─────────────────────────────────────────────────────────────────

  useEffect(() => { loadShifts() }, [currentMonth])

  async function loadShifts() {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end   = format(endOfMonth(currentMonth),   'yyyy-MM-dd')
    const { data } = await supabase.from('hospital_shifts').select('*').gte('date', start).lte('date', end)
    if (data) setShifts(data)
  }

  async function saveShift() {
    if (!form.shift_type) return
    const payload = {
      shift_type: form.shift_type,
      location:   form.location ?? '',
      floor:      form.floor    ?? '',
      notes:      form.notes    ?? '',
      work_center: activeTab,
      date: format(selected, 'yyyy-MM-dd'),
      ...(form.id ? { id: form.id } : {}),
    }
    if (form.id) await supabase.from('hospital_shifts').update(payload).eq('id', form.id)
    else          await supabase.from('hospital_shifts').insert(payload)
    setShowModal(false)
    setForm({ shift_type: 'morning', location: '', floor: '' })
    loadShifts()
  }

  async function deleteShift(id: string) {
    await supabase.from('hospital_shifts').delete().eq('id', id)
    loadShifts()
  }

  function startVoiceNotes() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript
      setForm(p => ({ ...p, notes: (p.notes ? p.notes + ' ' : '') + text }))
      setListeningNotes(false)
    }
    rec.onend = () => setListeningNotes(false)
    rec.start()
    setListeningNotes(true)
  }

  // ── Import helpers ────────────────────────────────────────────────────────

  async function loadImportShifts(month: Date) {
    const start = format(startOfMonth(month), 'yyyy-MM-dd')
    const end   = format(endOfMonth(month),   'yyyy-MM-dd')
    const { data } = await supabase.from('hospital_shifts').select('*')
      .gte('date', start).lte('date', end).eq('work_center', activeTab)
    if (data) setImportDbShifts(data)
  }

  function openImport() {
    setImportMonth(currentMonth)
    setImportBrush('morning')
    setImportSelections({})
    setImportDbShifts(shifts.filter(s => (s.work_center ?? 'hospital') === activeTab))
    setShowImport(true)
  }

  async function changeImportMonth(month: Date) {
    setImportMonth(month)
    await loadImportShifts(month)
  }

  function importEffective(dateStr: string): string | null {
    if (dateStr in importSelections) return importSelections[dateStr]
    return importDbShifts.find(s => s.date === dateStr)?.shift_type ?? null
  }

  function importClickDay(day: Date) {
    if (format(day, 'yyyy-MM') !== format(importMonth, 'yyyy-MM')) return
    const dateStr = format(day, 'yyyy-MM-dd')
    setImportSelections(p => ({ ...p, [dateStr]: importBrush === 'erase' ? null : importBrush }))
  }

  async function saveImport() {
    const entries = Object.entries(importSelections)
    if (!entries.length) { setShowImport(false); return }
    await supabase.from('hospital_shifts').delete()
      .in('date', entries.map(([d]) => d)).eq('work_center', activeTab)
    const toInsert = entries.filter(([, t]) => t !== null)
      .map(([date, shift_type]) => ({ date, shift_type, work_center: activeTab, location: '', floor: '', notes: '' }))
    if (toInsert.length) await supabase.from('hospital_shifts').insert(toInsert)
    setShowImport(false)
    setImportSelections({})
    loadShifts()
  }

  // ── Types management ──────────────────────────────────────────────────────

  function addCustomType() {
    if (!newLabel.trim()) return
    const t: ShiftTypeDef = {
      key: slugKey(newLabel), label: newLabel.trim(),
      color: newColor, bg: hexBg(newColor), hours: newHours, builtIn: false,
    }
    const next = [...customTypes, t]
    setCustomTypes(next)
    saveCustom(next)
    setNewLabel('')
    setNewColor('#c9a96e')
    setNewHours(8)
  }

  function deleteCustomType(key: string) {
    const next = customTypes.filter(t => t.key !== key)
    setCustomTypes(next)
    saveCustom(next)
  }

  function updateBuiltinHours(key: string, hours: number) {
    const next = { ...editHours, [key]: hours }
    setEditHours(next)
    try { localStorage.setItem('joe_shift_hours', JSON.stringify(next)) } catch {}
  }

  function resolvedHours(t: ShiftTypeDef): number {
    return t.builtIn && editHours[t.key] !== undefined ? editHours[t.key] : t.hours
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const tabShifts = shifts.filter(s => (s.work_center ?? 'hospital') === activeTab)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd   = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: startOfWeek(monthStart, { weekStartsOn: 1 }), end: endOfWeek(monthEnd, { weekStartsOn: 1 }) })

  const importDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(importMonth), { weekStartsOn: 1 }),
    end:   endOfWeek(endOfMonth(importMonth),     { weekStartsOn: 1 }),
  })

  const dayShift = (date: Date) => tabShifts.find(s => s.date === format(date, 'yyyy-MM-dd'))

  const totalHours = allTypes.reduce((sum, t) => {
    const h = resolvedHours(t)
    const count = tabShifts.filter(s => s.shift_type === t.key).length
    return sum + count * h
  }, 0)

  const importChanges = Object.keys(importSelections).length
  const importTurnos  = Object.values(importSelections).filter(Boolean).length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fadeIn max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-2">
        <div>
          <h2 className="font-display text-3xl font-bold text-gold-gradient capitalize">Turnos</h2>
          <p className="text-[#aaa] text-sm mt-1">
            {tabShifts.filter(s => s.shift_type !== 'free').length} turnos · {totalHours}h este mes
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => setShowTypes(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-[#2a2a2a] text-[#666] hover:border-[#c9a96e] hover:text-[#c9a96e] transition-all">
            <Settings size={14} /> Tipos
          </button>
          <button onClick={openImport}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-[#2a2a2a] text-[#aaa] hover:border-[#c9a96e] hover:text-[#c9a96e] transition-all">
            <Download size={14} /> Importar
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="btn-ghost p-2 rounded-lg"><ChevronLeft size={18} /></button>
            <span className="text-base text-[#ddd] font-semibold capitalize min-w-[110px] text-center">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn-ghost p-2 rounded-lg"><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(Object.entries(TAB_CONFIG) as [WorkCenter, typeof TAB_CONFIG[WorkCenter]][]).map(([key, cfg]) => {
          const Icon = cfg.icon
          const isActive = activeTab === key
          return (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-base font-semibold border transition-all ${
                isActive ? 'border-transparent text-[#0a0a0a]' : 'border-[#2a2a2a] text-[#aaa] hover:border-[#3a3a3a]'
              }`}
              style={isActive ? { backgroundColor: cfg.color } : {}}>
              <Icon size={15} /> {cfg.label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Calendar */}
        <div className="lg:col-span-2 card">
          <div className="grid grid-cols-7 mb-2">
            {['L','M','X','J','V','S','D'].map(d => (
              <div key={d} className="text-center text-base text-[#aaa] font-bold py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 overflow-hidden">
            {days.map(day => {
              const shift = dayShift(day)
              const isSelected = isSameDay(day, selected)
              const isCurrentMon = format(day, 'MM') === format(currentMonth, 'MM')
              const cfg = shift ? getType(shift.shift_type) : null
              const Icon = cfg?.icon
              return (
                <button key={day.toISOString()}
                  onClick={() => setSelected(day)}
                  onDoubleClick={() => { setSelected(day); setForm({ shift_type: 'morning', location: '', floor: '', ...(shift ?? {}) }); setShowModal(true) }}
                  className={`flex flex-col items-center py-2 px-0.5 rounded-lg transition-all min-h-[76px] border
                    ${isSelected ? 'border-[#c9a96e]' : 'border-transparent'}
                    ${!isCurrentMon ? 'opacity-25' : ''}
                    ${cfg ? '' : 'hover:bg-[#1a1a1a]'}`}
                  style={cfg ? { backgroundColor: cfg.bg, borderColor: isSelected ? '#c9a96e' : cfg.color + '30' } : {}}>
                  <span className={`text-lg font-bold w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full
                    ${isToday(day) ? 'bg-[#c9a96e] text-[#0a0a0a]' : 'text-[#f0f0f0]'}`}>
                    {format(day, 'd')}
                  </span>
                  {cfg && isCurrentMon && (
                    Icon
                      ? <Icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />
                      : <div className="w-3 h-3 mt-0.5 rounded-sm flex-shrink-0" style={{ background: cfg.color }} />
                  )}
                </button>
              )
            })}
          </div>
          <div className="divider-gold my-4" />
          <div className="flex flex-wrap gap-3">
            {allTypes.map(t => {
              const Icon = t.icon
              return (
                <span key={t.key} className="flex items-center gap-1.5 text-sm text-[#bbb]">
                  {Icon ? <Icon size={13} style={{ color: t.color }} /> : <div className="w-3 h-3 rounded-sm" style={{ background: t.color }} />}
                  {t.label}
                </span>
              )
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className="card flex flex-col gap-0">

          {/* Selected day */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-2xl font-bold capitalize text-[#f0f0f0]">
              {format(selected, 'EEE d MMM', { locale: es })}
            </h3>
            <button onClick={() => { setForm({ shift_type: 'morning', location: '', floor: '' }); setShowModal(true) }}
              className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"><Plus size={14} /></button>
          </div>

          {(() => {
            const shift = dayShift(selected)
            if (!shift) return <p className="text-[#999] text-base text-center py-6">Sin turno asignado</p>
            const cfg = getType(shift.shift_type)
            const Icon = cfg.icon
            return (
              <div className="rounded-xl p-4 border" style={{ backgroundColor: cfg.bg, borderColor: cfg.color + '40' }}>
                <div className="flex items-center gap-3 mb-3">
                  {Icon ? <Icon size={24} style={{ color: cfg.color }} /> : <div className="w-6 h-6 rounded-md" style={{ background: cfg.color }} />}
                  <span className="text-xl font-bold text-[#f0f0f0]">{cfg.label}</span>
                  {resolvedHours(cfg) > 0 && <span className="text-sm font-semibold ml-auto" style={{ color: cfg.color }}>{resolvedHours(cfg)}h</span>}
                  <button onClick={() => deleteShift(shift.id)} className="text-[#999] hover:text-[#e05252] ml-1"><X size={16} /></button>
                </div>
                {activeTab === 'hospital' && shift.floor && (
                  <p className="text-sm text-[#bbb] flex items-center gap-1.5 mb-1"><Layers size={13} /> Planta: {shift.floor}</p>
                )}
                {shift.location && <p className="text-sm text-[#bbb] flex items-center gap-1.5"><MapPin size={13} /> {shift.location}</p>}
                {shift.notes && <p className="text-sm text-[#bbb] mt-2">{shift.notes}</p>}
                <button onClick={() => { setForm(shift); setShowModal(true) }}
                  className="mt-3 text-sm text-[#bbb] hover:text-[#c9a96e] transition-colors">Editar</button>
              </div>
            )
          })()}

          {/* Stats */}
          <div className="divider-gold my-4" />
          <h4 className="text-sm text-[#aaa] uppercase tracking-wider mb-3">Este mes</h4>
          <div className="space-y-2 flex-1">
            {allTypes.map(t => {
              const count = tabShifts.filter(s => s.shift_type === t.key).length
              const h = resolvedHours(t)
              const Icon = t.icon
              return (
                <div key={t.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-[#bbb]">
                    {Icon ? <Icon size={14} style={{ color: t.color }} /> : <div className="w-3 h-3 rounded-sm" style={{ background: t.color }} />}
                    {t.label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-[#555]">{count}×</span>
                    <span className="font-bold w-10 text-right" style={{ color: count > 0 ? t.color : '#444' }}>
                      {h > 0 ? `${count * h}h` : count > 0 ? count : '—'}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-[#2a2a2a] flex items-center justify-between">
            <span className="text-sm text-[#aaa]">Total horas</span>
            <span className="font-bold text-xl text-[#c9a96e]">{totalHours}h</span>
          </div>
        </div>
      </div>

      {/* ── Edit modal ─────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-sm animate-fadeIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">
                {TAB_CONFIG[activeTab].label} — {format(selected, 'd MMM', { locale: es })}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-[#999] hover:text-[#bbb]"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-2">Turno</label>
                <div className="grid grid-cols-2 gap-2">
                  {allTypes.map(t => {
                    const Icon = t.icon
                    const isActive = form.shift_type === t.key
                    return (
                      <button key={t.key} onClick={() => setForm(p => ({ ...p, shift_type: t.key }))}
                        className={`flex items-center gap-2 py-2.5 px-3 rounded-lg border text-sm transition-all ${
                          isActive ? 'border-transparent text-[#0a0a0a] font-semibold' : 'border-[#2a2a2a] text-[#bbb]'
                        }`}
                        style={isActive ? { backgroundColor: t.color } : {}}>
                        {Icon ? <Icon size={13} /> : <div className="w-3 h-3 rounded-sm" style={{ background: t.color }} />}
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              {activeTab === 'hospital' && (
                <div>
                  <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Planta / Unidad</label>
                  <input type="text" value={form.floor ?? ''} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))}
                    placeholder="Planta 3, UCI, Urgencias…"
                    className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none" />
                </div>
              )}
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">
                  {activeTab === 'hospital' ? 'Hospital' : 'Centro de Salud'}
                </label>
                <input type="text" value={form.location ?? ''} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                  placeholder={activeTab === 'hospital' ? 'Hospital Universitario…' : 'Centro de Salud Norte…'}
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-[#bbb] uppercase tracking-wider">Notas</label>
                  <button onClick={startVoiceNotes}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                      listeningNotes ? 'border-[#e05252] text-[#e05252]' : 'border-[#3a3a3a] text-[#999] hover:border-[#c9a96e] hover:text-[#c9a96e]'
                    }`}>
                    {listeningNotes ? <MicOff size={12} /> : <Mic size={12} />}
                    {listeningNotes ? 'Escuchando…' : 'Voz'}
                  </button>
                </div>
                <textarea value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancelar</button>
              <button onClick={saveShift} className="btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import modal ───────────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-lg my-4 animate-fadeIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <div>
                <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">Importar turnos</h3>
                <p className="text-xs text-[#aaa] mt-0.5">{TAB_CONFIG[activeTab].label} · toca cada día para pintar el turno</p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-[#999] hover:text-[#bbb]"><X size={20} /></button>
            </div>
            <div className="flex items-center justify-center gap-3 px-6 py-3 border-b border-[#2a2a2a]">
              <button onClick={() => changeImportMonth(subMonths(importMonth, 1))} className="btn-ghost p-1.5 rounded-lg"><ChevronLeft size={16} /></button>
              <span className="text-sm font-semibold text-[#ddd] capitalize min-w-[150px] text-center">
                {format(importMonth, 'MMMM yyyy', { locale: es })}
              </span>
              <button onClick={() => changeImportMonth(addMonths(importMonth, 1))} className="btn-ghost p-1.5 rounded-lg"><ChevronRight size={16} /></button>
            </div>
            <div className="px-4 py-3 border-b border-[#2a2a2a]">
              <p className="text-[10px] text-[#666] uppercase tracking-wider mb-2">Pincel activo</p>
              <div className="flex flex-wrap gap-1.5">
                {allTypes.map(t => {
                  const Icon = t.icon
                  const isActive = importBrush === t.key
                  return (
                    <button key={t.key} onClick={() => setImportBrush(t.key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isActive ? 'border-transparent text-[#0a0a0a]' : 'border-[#2a2a2a] text-[#bbb] hover:border-[#3a3a3a]'
                      }`}
                      style={isActive ? { backgroundColor: t.color } : {}}>
                      {Icon ? <Icon size={11} style={!isActive ? { color: t.color } : {}} /> : <div className="w-2.5 h-2.5 rounded-sm" style={{ background: isActive ? '#0a0a0a' : t.color }} />}
                      {t.label}
                    </button>
                  )
                })}
                <button onClick={() => setImportBrush('erase')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    importBrush === 'erase' ? 'border-[#555] bg-[#333] text-[#ccc]' : 'border-[#2a2a2a] text-[#666] hover:border-[#3a3a3a] hover:text-[#999]'
                  }`}>
                  <Eraser size={11} /> Borrar
                </button>
              </div>
            </div>
            <div className="px-4 py-4">
              <div className="grid grid-cols-7 mb-1">
                {['L','M','X','J','V','S','D'].map(d => (
                  <div key={d} className="text-center text-[11px] text-[#555] font-bold py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {importDays.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const isCurrentMon = format(day, 'yyyy-MM') === format(importMonth, 'yyyy-MM')
                  const effectiveKey = importEffective(dateStr)
                  const cfg = effectiveKey ? getType(effectiveKey) : null
                  const changed = dateStr in importSelections
                  return (
                    <button key={day.toISOString()} onClick={() => importClickDay(day)} disabled={!isCurrentMon}
                      className={`flex flex-col items-center py-1.5 rounded-lg border transition-all min-h-[54px] ${
                        !isCurrentMon ? 'opacity-15 cursor-default' : 'cursor-pointer hover:opacity-90 active:scale-95'
                      }`}
                      style={cfg && isCurrentMon
                        ? { backgroundColor: cfg.bg, borderColor: changed ? '#c9a96e' : cfg.color + '35', boxShadow: changed ? '0 0 0 1px #c9a96e55' : undefined }
                        : { borderColor: 'transparent', backgroundColor: isCurrentMon ? '#111' : 'transparent' }}>
                      <span className={`text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday(day) ? 'bg-[#c9a96e] text-[#0a0a0a]' : 'text-[#e0e0e0]'
                      }`}>{format(day, 'd')}</span>
                      {cfg && isCurrentMon && (
                        <span className="text-[8px] font-semibold mt-0.5 leading-none" style={{ color: cfg.color }}>{cfg.label}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex items-center justify-between gap-3">
              <span className="text-xs text-[#555]">
                {importChanges > 0 ? `${importChanges} día${importChanges !== 1 ? 's' : ''} modificado${importChanges !== 1 ? 's' : ''}` : 'Sin cambios'}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setShowImport(false)} className="btn-ghost">Cancelar</button>
                <button onClick={saveImport} className="btn-primary"
                  disabled={importChanges === 0} style={importChanges === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>
                  {importTurnos > 0 ? `Guardar ${importTurnos} turno${importTurnos !== 1 ? 's' : ''}` : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Types management modal ─────────────────────────────────────────── */}
      {showTypes && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-sm my-4 animate-fadeIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">Tipos de turno</h3>
              <button onClick={() => setShowTypes(false)} className="text-[#999] hover:text-[#bbb]"><X size={20} /></button>
            </div>

            {/* Existing types */}
            <div className="px-4 py-3 space-y-2 max-h-80 overflow-y-auto">
              {allTypes.map(t => {
                const Icon = t.icon
                return (
                  <div key={t.key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#222]"
                    style={{ backgroundColor: t.bg }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: t.color }}>
                      {Icon ? <Icon size={14} style={{ color: '#0a0a0a' }} /> : null}
                    </div>
                    <span className="flex-1 text-sm font-medium text-[#e0e0e0]">{t.label}</span>
                    {t.builtIn ? (
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} max={24}
                          value={editHours[t.key] ?? t.hours}
                          onChange={e => updateBuiltinHours(t.key, Number(e.target.value))}
                          className="w-12 bg-[#111] border border-[#3a3a3a] rounded-md px-2 py-1 text-xs text-[#e0e0e0] text-center focus:border-[#c9a96e] focus:outline-none" />
                        <span className="text-xs text-[#555]">h</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#aaa]">{t.hours}h</span>
                        <button onClick={() => deleteCustomType(t.key)} className="text-[#555] hover:text-[#e05252] transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Add new type */}
            <div className="px-4 py-4 border-t border-[#2a2a2a]">
              <p className="text-xs text-[#666] uppercase tracking-wider mb-3">Nuevo tipo</p>
              <div className="flex gap-2 mb-2">
                <input type="text" placeholder="Nombre del turno" value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomType()}
                  className="flex-1 bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none" />
                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                  className="w-11 h-10 rounded-lg border border-[#3a3a3a] bg-[#111] cursor-pointer p-1.5" />
              </div>
              <div className="flex gap-2">
                <div className="flex items-center gap-1.5 bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5">
                  <input type="number" min={0} max={24} value={newHours} onChange={e => setNewHours(Number(e.target.value))}
                    className="w-10 bg-transparent text-sm text-[#e0e0e0] text-center focus:outline-none" />
                  <span className="text-xs text-[#555]">h / turno</span>
                </div>
                <button onClick={addCustomType} disabled={!newLabel.trim()}
                  className="flex-1 btn-primary text-sm"
                  style={!newLabel.trim() ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>
                  Añadir tipo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

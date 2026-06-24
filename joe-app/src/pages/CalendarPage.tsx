import { useState, useEffect, useRef } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths, isToday,
  parseISO, startOfWeek, endOfWeek, startOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Mic, MicOff, X, Bell, MapPin, Heart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { CalendarEvent, EventCategory } from '../types'

const CATEGORY_CONFIG: Record<EventCategory, { label: string; color: string; bg: string; heart?: boolean }> = {
  pareja:     { label: 'Rober ♥',    color: '#e8304a', bg: '#e8304a20', heart: true },
  empresa:    { label: 'Empresa',    color: '#9b6bb5', bg: '#9b6bb520' },
  zumba:      { label: 'Zumba',      color: '#e0854a', bg: '#e0854a20' },
  meditacion: { label: 'Meditación', color: '#6db59e', bg: '#6db59e20' },
  enologia:   { label: 'Enología',   color: '#c9a96e', bg: '#c9a96e20' },
  astrologia: { label: 'Astrología', color: '#b56db5', bg: '#b56db520' },
  personal:   { label: 'Personal',   color: '#888888', bg: '#88888820' },
  limon:      { label: 'Limón',      color: '#6db56d', bg: '#6db56d20' },
}

const emptyEvent = (): Partial<CalendarEvent> => ({
  title: '',
  description: '',
  category: 'personal',
  is_all_day: false,
  reminder_minutes: 30,
  location: '',
})

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editEvent, setEditEvent] = useState<Partial<CalendarEvent>>(emptyEvent())
  const [listening, setListening] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    loadEvents()
  }, [currentMonth])

  async function loadEvents() {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentMonth), "yyyy-MM-dd'T'23:59:59")
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time')
    if (error) console.error('Error cargando eventos:', error.message)
    if (data) setEvents(data)
  }

  async function saveEvent() {
    if (!editEvent.title?.trim()) return
    setSaveError(null)
    const { id, created_at, ...rest } = editEvent as CalendarEvent
    const payload = {
      ...rest,
      ...(editEvent.id ? { id } : {}),
      start_time: editEvent.start_time || format(selectedDate, "yyyy-MM-dd'T'HH:mm:ss"),
    }
    const { error } = editEvent.id
      ? await supabase.from('events').update(payload).eq('id', editEvent.id)
      : await supabase.from('events').insert(payload)
    if (error) {
      setSaveError(error.message)
      return
    }
    setShowModal(false)
    setEditEvent(emptyEvent())
    loadEvents()
  }

  async function deleteEvent(id: string) {
    await supabase.from('events').delete().eq('id', id)
    loadEvents()
  }

  function openNewEvent(date: Date) {
    setSelectedDate(date)
    setEditEvent({
      ...emptyEvent(),
      start_time: format(date, "yyyy-MM-dd'T'09:00:00"),
      end_time: format(date, "yyyy-MM-dd'T'10:00:00"),
    })
    setShowModal(true)
  }

  function startVoice() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript
      setEditEvent(prev => ({ ...prev, title: text }))
      setListening(false)
    }
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  function stopVoice() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const dayEvents = (date: Date) => {
    const d = startOfDay(date)
    return events.filter(e => {
      const start = startOfDay(parseISO(e.start_time))
      const end = e.end_time ? startOfDay(parseISO(e.end_time)) : start
      return d >= start && d <= end
    })
  }

  const selectedDayEvents = dayEvents(selectedDate)

  return (
    <div className="animate-fadeIn max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-display text-3xl font-bold text-gold-gradient capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </h2>
          <p className="text-[#666] text-sm mt-1">Agenda personal</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="btn-ghost p-2 rounded-lg"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            Hoy
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="btn-ghost p-2 rounded-lg"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendario */}
        <div className="lg:col-span-2 card">
          {/* Días de la semana */}
          <div className="grid grid-cols-7 mb-2">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
              <div key={d} className="text-center text-xs text-[#555] font-medium py-2">
                {d}
              </div>
            ))}
          </div>
          {/* Días */}
          <div className="grid grid-cols-7 gap-1">
            {days.map(day => {
              const evs = dayEvents(day)
              const isSelected = isSameDay(day, selectedDate)
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const todayDay = isToday(day)
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  onDoubleClick={() => openNewEvent(day)}
                  className={`
                    relative flex flex-col items-center py-2 px-1 rounded-lg transition-all duration-150 min-h-[52px]
                    ${isSelected ? 'bg-[#2a2a2a] border border-[#c9a96e]' : 'hover:bg-[#1a1a1a]'}
                    ${!isCurrentMonth ? 'opacity-30' : ''}
                  `}
                >
                  <span
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1
                      ${todayDay ? 'bg-[#c9a96e] text-[#0a0a0a] font-bold' : 'text-[#ccc]'}
                    `}
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="flex flex-wrap justify-center gap-0.5">
                    {evs.slice(0, 3).map(e => (
                      CATEGORY_CONFIG[e.category].heart
                        ? <Heart key={e.id} size={9} fill="#e8304a" style={{ color: '#e8304a' }} />
                        : <div key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CATEGORY_CONFIG[e.category].color }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Leyenda */}
          <div className="divider-gold my-4" />
          <div className="flex flex-wrap gap-3">
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs text-[#888]">
                {cfg.heart
                  ? <Heart size={10} fill="#e8304a" style={{ color: '#e8304a' }} />
                  : <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                }
                {cfg.label}
              </span>
            ))}
          </div>
        </div>

        {/* Panel día seleccionado */}
        <div className="flex flex-col gap-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold capitalize text-[#e0e0e0]">
                {format(selectedDate, "EEEE d", { locale: es })}
              </h3>
              <button
                onClick={() => openNewEvent(selectedDate)}
                className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
              >
                <Plus size={14} /> Nuevo
              </button>
            </div>

            {selectedDayEvents.length === 0 ? (
              <p className="text-[#555] text-sm text-center py-6">
                Sin eventos. Doble clic en el calendario o pulsa "Nuevo".
              </p>
            ) : (
              <div className="space-y-2">
                {selectedDayEvents.map(ev => {
                  const cfg = CATEGORY_CONFIG[ev.category]
                  return (
                    <div
                      key={ev.id}
                      className="rounded-lg p-3 border cursor-pointer hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: cfg.bg, borderColor: cfg.color + '40' }}
                      onClick={() => { setEditEvent(ev); setShowModal(true) }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#e0e0e0] truncate flex items-center gap-1.5">
                            {cfg.heart && <Heart size={12} fill="#e8304a" style={{ color: '#e8304a', flexShrink: 0 }} />}
                            {ev.title}
                          </p>
                          {ev.location && (
                            <p className="text-xs text-[#888] flex items-center gap-1 mt-0.5">
                              <MapPin size={10} /> {ev.location}
                            </p>
                          )}
                          {!ev.is_all_day && (
                            <p className="text-xs mt-1" style={{ color: cfg.color }}>
                              {format(parseISO(ev.start_time), 'HH:mm')}
                              {ev.end_time && ` — ${format(parseISO(ev.end_time), 'HH:mm')}`}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteEvent(ev.id) }}
                          className="text-[#555] hover:text-[#e05252] transition-colors flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal nuevo/editar evento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-md animate-fadeIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">
                {editEvent.id ? 'Editar evento' : 'Nuevo evento'}
              </h3>
              <button onClick={() => { setShowModal(false); setEditEvent(emptyEvent()); setSaveError(null) }} className="text-[#555] hover:text-[#888]">
                <X size={20} />
              </button>
            </div>

            {saveError && (
              <div className="mx-6 mt-4 px-4 py-3 rounded-lg bg-[#e0525215] border border-[#e05252]/40 text-sm text-[#e05252]">
                Error al guardar: {saveError}
              </div>
            )}

            <div className="px-6 py-5 space-y-4">
              {/* Título + voz */}
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Título</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editEvent.title ?? ''}
                    onChange={e => setEditEvent(p => ({ ...p, title: e.target.value }))}
                    placeholder="¿Qué tienes?"
                    className="flex-1 bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none transition-colors"
                  />
                  <button
                    onClick={listening ? stopVoice : startVoice}
                    className={`px-3 py-2.5 rounded-lg border transition-colors ${listening ? 'border-[#e05252] text-[#e05252] bg-[#e0525210]' : 'border-[#3a3a3a] text-[#888] hover:border-[#c9a96e] hover:text-[#c9a96e]'}`}
                    title="Entrada por voz"
                  >
                    {listening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                </div>
              </div>

              {/* Categoría */}
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Categoría</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setEditEvent(p => ({ ...p, category: key as EventCategory }))}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${
                        editEvent.category === key
                          ? 'text-[#0a0a0a] border-transparent'
                          : 'border-[#2a2a2a] text-[#888] hover:border-[#3a3a3a]'
                      }`}
                      style={editEvent.category === key ? { backgroundColor: cfg.color } : {}}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fecha y hora */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Inicio</label>
                  <input
                    type="datetime-local"
                    value={editEvent.start_time?.slice(0, 16) ?? ''}
                    onChange={e => setEditEvent(p => ({ ...p, start_time: e.target.value + ':00' }))}
                    className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#c9a96e] focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Fin</label>
                  <input
                    type="datetime-local"
                    value={editEvent.end_time?.slice(0, 16) ?? ''}
                    onChange={e => setEditEvent(p => ({ ...p, end_time: e.target.value + ':00' }))}
                    className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#c9a96e] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Ubicación */}
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Ubicación</label>
                <input
                  type="text"
                  value={editEvent.location ?? ''}
                  onChange={e => setEditEvent(p => ({ ...p, location: e.target.value }))}
                  placeholder="¿Dónde?"
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none transition-colors"
                />
              </div>

              {/* Recordatorio */}
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <Bell size={12} /> Recordatorio
                </label>
                <select
                  value={editEvent.reminder_minutes ?? 30}
                  onChange={e => setEditEvent(p => ({ ...p, reminder_minutes: Number(e.target.value) }))}
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#c9a96e] focus:outline-none transition-colors"
                >
                  <option value={0}>Sin recordatorio</option>
                  <option value={10}>10 minutos antes</option>
                  <option value={30}>30 minutos antes</option>
                  <option value={60}>1 hora antes</option>
                  <option value={120}>2 horas antes</option>
                  <option value={1440}>1 día antes</option>
                </select>
              </div>

              {/* Notas */}
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Notas</label>
                <textarea
                  value={editEvent.description ?? ''}
                  onChange={e => setEditEvent(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Detalles adicionales..."
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none transition-colors resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-2">
              <button onClick={() => { setShowModal(false); setEditEvent(emptyEvent()); setSaveError(null) }} className="btn-ghost">
                Cancelar
              </button>
              <button onClick={saveEvent} className="btn-primary">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

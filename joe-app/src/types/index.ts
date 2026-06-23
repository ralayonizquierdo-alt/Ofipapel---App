export type EventCategory =
  | 'hospital'
  | 'empresa'
  | 'zumba'
  | 'meditacion'
  | 'enologia'
  | 'astrologia'
  | 'personal'
  | 'limon'
  | 'pareja'

export interface CalendarEvent {
  id: string
  title: string
  description?: string
  start_time: string
  end_time?: string
  category: EventCategory
  location?: string
  reminder_minutes?: number
  is_all_day: boolean
  recurrence?: string
  created_at: string
}

export interface HospitalShift {
  id: string
  date: string
  shift_type: 'morning' | 'afternoon' | 'night' | 'free'
  location: string
  notes?: string
  created_at: string
}

export interface LimonRecord {
  id: string
  type: 'vet' | 'food' | 'medication' | 'note' | 'weight'
  title: string
  description?: string
  date: string
  next_date?: string
  value?: string
  created_at: string
}

export interface SpotifyPlaylist {
  id: string
  name: string
  spotify_uri: string
  embed_url: string
  created_at: string
}

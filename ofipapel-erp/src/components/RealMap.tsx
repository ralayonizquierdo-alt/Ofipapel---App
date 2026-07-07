import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Vehicle } from '../types'

function vehicleIcon(color: string, pulse: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:20px;height:20px;">
      ${pulse ? `<div style="position:absolute;inset:-6px;border-radius:9999px;background:${color};opacity:0.25;"></div>` : ''}
      <div style="width:20px;height:20px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.5);"></div>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

interface RealMapProps {
  vehicles: Vehicle[]
  heightClass?: string
  /** Si se indica, el mapa se centra y hace zoom de calle sobre este vehículo en vez de encuadrar toda la flota. */
  focusVehicleId?: string
}

const TENERIFE_CENTER: [number, number] = [28.29, -16.5]

/** Mapa real (OpenStreetMap vía Leaflet) con calles y carreteras reales — requiere conexión a internet para cargar los tiles. */
export default function RealMap({ vehicles, heightClass = 'h-80', focusVehicleId }: RealMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const positionsRef = useRef<Map<string, { lat: number; lon: number }>>(new Map())

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const foco = focusVehicleId ? vehicles.find((v) => v.id === focusVehicleId) : null
    const map = L.map(containerRef.current).setView(foco ? [foco.ubicacion.lat, foco.ubicacion.lon] : TENERIFE_CENTER, foco ? 14 : 10)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
    }
    // Solo se inicializa una vez por montaje del componente (cada apertura de modal/pestaña crea una instancia nueva).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    vehicles.forEach((v) => {
      if (!positionsRef.current.has(v.id)) positionsRef.current.set(v.id, { lat: v.ubicacion.lat, lon: v.ubicacion.lon })
      const color = v.tipo === 'Furgón de reparto' ? '#0284c7' : '#9333ea'
      const icon = vehicleIcon(v.estado === 'En ruta' ? color : '#94a3b8', v.estado === 'En ruta')
      const popupHtml = `<strong>${v.matricula}</strong><br/>${v.marca} ${v.modelo}<br/>${v.ubicacion.zona} · ${v.estado}`
      const existente = markersRef.current.get(v.id)
      if (existente) {
        existente.setIcon(icon)
        existente.setPopupContent(popupHtml)
      } else {
        const pos = positionsRef.current.get(v.id)!
        const marker = L.marker([pos.lat, pos.lon], { icon }).addTo(map).bindPopup(popupHtml)
        markersRef.current.set(v.id, marker)
      }
    })
    ;[...markersRef.current.keys()].forEach((id) => {
      if (!vehicles.some((v) => v.id === id)) {
        markersRef.current.get(id)?.remove()
        markersRef.current.delete(id)
      }
    })
  }, [vehicles])

  useEffect(() => {
    const interval = setInterval(() => {
      vehicles.forEach((v) => {
        if (v.estado !== 'En ruta') return
        const marker = markersRef.current.get(v.id)
        const pos = positionsRef.current.get(v.id)
        if (!marker || !pos) return
        const next = { lat: pos.lat + (Math.random() - 0.5) * 0.0015, lon: pos.lon + (Math.random() - 0.5) * 0.0015 }
        positionsRef.current.set(v.id, next)
        marker.setLatLng([next.lat, next.lon])
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [vehicles])

  return <div ref={containerRef} className={`${heightClass} w-full rounded-xl border border-slate-200`} />
}

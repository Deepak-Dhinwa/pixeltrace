'use client'

import dynamic from 'next/dynamic'
import { MapPin, Users, Package, Layers, Camera, Calendar } from 'lucide-react'

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <div className="h-44 bg-slate-800 animate-pulse rounded-xl" />,
})

export interface Entity {
  label: string
  type: string
  confidence: number
  source: string
}

export interface AnalysisResult {
  location: {
    latitude?: number
    longitude?: number
    locationName?: string
    country?: string
    city?: string
    state?: string
    landmark?: string
    source?: string
  }
  entities: Entity[]
  caption: string | null
  sceneLabels: string[]
  exif: {
    Make?: string
    Model?: string
    DateTimeOriginal?: string
    ExposureTime?: number | string
    FNumber?: number
    ISO?: number
    FocalLength?: number | string
  }
}

function confidence(n: number) {
  return `${Math.round(n * 100)}%`
}

// Build human-readable insight from people count
function peopleInsight(people: Entity[]): string {
  const count = people.length
  if (count === 0) return 'No people detected'
  if (count === 1) return 'Just one person (solo)'
  if (count === 2) return 'Two people (a pair)'
  if (count <= 4) return `Small group (${count} people)`
  return `Crowd / group (${count}+ people)`
}

export function ResultsView({ result, preview, filename }: {
  result: AnalysisResult
  preview: string
  filename: string
}) {
  const { location, entities, caption, sceneLabels, exif } = result

  const people = entities.filter(e => e.type === 'person')
  const animals = entities.filter(e => e.type === 'animal')
  const vehicles = entities.filter(e => e.type === 'vehicle')
  const objects = entities.filter(e => !['person', 'animal', 'vehicle'].includes(e.type))

  // Deduplicate by label, keep highest confidence
  function dedup(list: Entity[]) {
    const map = new Map<string, Entity>()
    for (const e of list) {
      const existing = map.get(e.label)
      if (!existing || e.confidence > existing.confidence) map.set(e.label, e)
    }
    return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence)
  }

  const hasLocation = location?.latitude && location?.longitude

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* BLIP caption — natural-language scene description */}
      {caption && (
        <div className="bg-white/5 border border-white/10 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-slate-500 text-xs uppercase tracking-widest mt-0.5 shrink-0">Scene</span>
          <p className="text-slate-200 italic">&ldquo;{caption}&rdquo;</p>
        </div>
      )}

      {/* Top row: image + location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Photo */}
        <div className="rounded-2xl overflow-hidden bg-slate-900 border border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={filename} className="w-full object-cover max-h-72" />
          <div className="px-4 py-2 flex items-center gap-2 text-slate-500 text-xs">
            <Camera className="w-3.5 h-3.5" />
            {exif.Make && exif.Model ? `${exif.Make} ${exif.Model}` : filename}
            {exif.DateTimeOriginal && (
              <>
                <span className="mx-1">·</span>
                <Calendar className="w-3.5 h-3.5" />
                {String(exif.DateTimeOriginal).slice(0, 10).replace(/:/g, '-')}
              </>
            )}
          </div>
        </div>

        {/* Location */}
        <div className="rounded-2xl bg-slate-900 border border-white/5 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="font-semibold text-sm">Location</span>
          </div>

          {hasLocation ? (
            <>
              <div className="flex-1 min-h-[160px]">
                <MapView lat={location.latitude!} lng={location.longitude!} label={location.locationName || ''} />
              </div>
              <div className="px-4 py-3 space-y-1">
                {location.landmark && (
                  <p className="text-white font-medium">{location.landmark}</p>
                )}
                <p className="text-slate-300 text-sm">
                  {[location.city, location.state, location.country].filter(Boolean).join(', ')}
                </p>
                <p className="text-slate-600 text-xs capitalize">
                  Source: {location.source?.replace('_', ' ')}
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center gap-2">
              <MapPin className="w-8 h-8 text-slate-700" />
              <p className="text-slate-400 text-sm">No location data found</p>
              <p className="text-slate-600 text-xs">Photo has no GPS tag and no recognizable landmark</p>
            </div>
          )}
        </div>
      </div>

      {/* People */}
      <Card icon={<Users className="w-4 h-4 text-violet-400" />} title="People">
        <div className="space-y-3">
          <p className={`font-medium ${people.length > 0 ? 'text-white' : 'text-slate-500'}`}>
            {peopleInsight(people)}
          </p>
          {people.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {dedup(people).map((p, i) => (
                <Chip key={i} label="person" confidence={p.confidence} color="violet" />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Objects + Animals + Vehicles */}
      <Card icon={<Package className="w-4 h-4 text-amber-400" />} title="Detected Objects">
        {[
          { list: dedup(objects), color: 'amber' as const },
          { list: dedup(animals), color: 'green' as const },
          { list: dedup(vehicles), color: 'sky' as const },
        ].every(g => g.list.length === 0) ? (
          <p className="text-slate-500 text-sm">No objects detected</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dedup(objects).map((e, i) => <Chip key={`o${i}`} label={e.label} confidence={e.confidence} color="amber" />)}
            {dedup(animals).map((e, i) => <Chip key={`a${i}`} label={e.label} confidence={e.confidence} color="green" />)}
            {dedup(vehicles).map((e, i) => <Chip key={`v${i}`} label={e.label} confidence={e.confidence} color="sky" />)}
          </div>
        )}
      </Card>

      {/* Scene */}
      {sceneLabels.length > 0 && (
        <Card icon={<Layers className="w-4 h-4 text-teal-400" />} title="Scene Type">
          <div className="flex flex-wrap gap-2">
            {sceneLabels.map((label, i) => (
              <span key={i} className={`
                text-sm rounded-full px-3 py-1 border font-medium
                ${i === 0
                  ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                  : 'bg-white/5 text-slate-400 border-white/10'}
              `}>
                {label}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-white/5 p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <span className="font-semibold text-sm">{title}</span>
      </div>
      {children}
    </div>
  )
}

const CHIP_COLORS = {
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  green: 'bg-green-500/15 text-green-300 border-green-500/25',
  sky: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
}

function Chip({ label, confidence: conf, color }: { label: string; confidence: number; color: keyof typeof CHIP_COLORS }) {
  return (
    <span className={`text-sm rounded-full px-3 py-1 border flex items-center gap-1.5 ${CHIP_COLORS[color]}`}>
      <span className="capitalize">{label}</span>
      <span className="opacity-50 text-xs">{confidence(conf)}</span>
    </span>
  )
}

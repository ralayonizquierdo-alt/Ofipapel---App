import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  sublabel?: string
  tone?: 'default' | 'warn' | 'good'
}

const TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-slate-100 text-slate-700',
  warn: 'bg-orange-100 text-orange-700',
  good: 'bg-emerald-100 text-emerald-700',
}

export default function StatCard({ icon: Icon, label, value, sublabel, tone = 'default' }: StatCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 overflow-hidden">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONE_CLASSES[tone]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-lg font-semibold text-slate-900 break-words">{value}</div>
        {sublabel && <div className="text-xs text-slate-400 mt-0.5">{sublabel}</div>}
      </div>
    </div>
  )
}

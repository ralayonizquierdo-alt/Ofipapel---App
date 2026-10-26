import { useState, type ReactNode } from 'react'

export interface TabDef {
  key: string
  label: string
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[]
  active: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`-mb-px rounded-t-lg border border-b-0 px-3 py-2 text-xs font-semibold transition-colors ${
            active === tab.key
              ? 'border-slate-200 bg-white text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function useTabs(tabs: TabDef[], initial?: string) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key ?? '')
  return { active, setActive }
}

export function TabPanel({ children }: { children: ReactNode }) {
  return <div className="rounded-b-xl rounded-tr-xl border border-slate-200 bg-white p-5">{children}</div>
}

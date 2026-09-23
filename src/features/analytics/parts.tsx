import type { ReactNode } from 'react'
import type { Line } from './words'

export const SECTION = 'text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground'

/** Заголовок блока разбора. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className={SECTION}>{title}</h3>
      {children}
    </section>
  )
}

const ICON = { good: '↑', bad: '↓', neutral: '·' } as const
const ICON_CLASS = { good: 'text-good', bad: 'text-destructive', neutral: 'text-muted-foreground' } as const

/** Фразы со стрелкой: ↑ к лучшему, ↓ к худшему, · просто было. Справа — необязательное «было → стало». */
export function Lines({ lines }: { lines: (Line & { fromTo?: [number, number] })[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((l, i) => (
        <li key={i} className="grid grid-cols-[1.4em_1fr_auto] items-baseline gap-2 text-[15px]">
          <span className={`text-center font-bold ${ICON_CLASS[l.tone]}`} aria-hidden>
            {ICON[l.tone]}
          </span>
          <span>{l.text}</span>
          {l.fromTo ? (
            <span className="font-mono text-[13px] whitespace-nowrap">
              <span className="text-muted-foreground">{l.fromTo[0]}</span> → <b className="font-semibold">{l.fromTo[1]}</b>
            </span>
          ) : (
            <span />
          )}
        </li>
      ))}
    </ul>
  )
}

/** Чип сдвига: зелёный вверх, красный вниз, серый — почти без разницы. */
export function Chip({ text, tone }: { text: string; tone: 'up' | 'down' | 'flat' }) {
  const cls =
    tone === 'up'
      ? 'text-good bg-good/12'
      : tone === 'down'
        ? 'text-destructive bg-destructive/12'
        : 'text-muted-foreground bg-secondary'
  return <span className={`rounded-md px-2 py-0.5 font-mono text-[12px] ${cls}`}>{text}</span>
}

/** Точка замера: не ниже обычного — зелёная, ниже — красная, нет замера — пунктирный круг. */
export function Dot({ value, norm, label }: { value: number | null; norm: number | null; label: string }) {
  if (value === null) {
    return (
      <span role="img" aria-label={`${label}: нет записи`} className="inline-block size-2.5 rounded-full border-[1.5px] border-dashed border-axis" />
    )
  }
  const hi = norm !== null && value >= norm
  return (
    <span
      role="img"
      aria-label={`${label}: ${hi ? 'не ниже обычного' : 'ниже обычного'}`}
      className={`inline-block size-2.5 rounded-full ${hi ? 'bg-good' : 'bg-destructive'}`}
    />
  )
}

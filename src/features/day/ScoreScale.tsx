import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Slider } from '@/components/ui/slider'
import { SCORE_MAX, SCORE_MIN, snapScore } from '@/domain/score'
import { cn } from '@/lib/utils'

/** Шкала без якорей — это просто число: 7 у одного и 7 у другого означали бы разное. */
export type Scale = { label: string; low: string; high: string }

/** Сколько бегунок доезжает до засечки после отпускания. */
const SNAP_MS = 150

/** Доля дорожки, на которой стоит значение. На шкале 0–10 пятёрка — ровно половина. */
const anchorAt = (value: number) => `${((value - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100}%`

/** Стрелки и Page Up/Down двигают на целое: мелкий шаг нужен только пальцу. */
const STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowUp: 1,
  PageUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageDown: -1,
}

type ScoreScaleProps = {
  scale: Scale
  /** null — оценка ещё не выставлена: бегунок серый, подпись «не выбрано». */
  value: number | null
  onChange: (value: number) => void
}

/**
 * Оценка 0–10 ползунком — общая для утра и вечера. Пока ползунок ведут, он идёт за пальцем
 * с мелким шагом — иначе бегунок скачет по десяти позициям и отстаёт от руки. Отпустили —
 * оценка округляется до целого, и бегунок доезжает до засечки: за это отвечает data-snapping.
 */
export function ScoreScale({ scale, value, onChange }: ScoreScaleProps) {
  const [live, setLive] = useState<number | undefined>(undefined)
  const [snapping, setSnapping] = useState(false)

  const commit = (raw: number) => {
    onChange(snapScore(raw))
    setLive(undefined)
    setSnapping(true)
    window.setTimeout(() => setSnapping(false), SNAP_MS)
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const step = STEPS[e.key]
    const jump = e.key === 'Home' ? SCORE_MIN : e.key === 'End' ? SCORE_MAX : null
    if (step === undefined && jump === null) return

    e.preventDefault()
    onChange(jump ?? snapScore((value ?? 5) + step!))
  }

  /* Под пальцем цифра показывает, во что округлится оценка при отпускании. */
  const shown = live !== undefined ? snapScore(live) : value

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[13.5px] font-semibold">{scale.label}</b>
        <em className="font-mono text-xs not-italic text-muted-foreground tabular-nums">
          {shown === null ? 'не выбрано' : `${shown} из ${SCORE_MAX}`}
        </em>
      </div>

      <Slider
        min={SCORE_MIN}
        max={SCORE_MAX}
        step={0.01}
        value={[live ?? value ?? 5]}
        thumbLabel={`${scale.label} от ${SCORE_MIN} до ${SCORE_MAX}`}
        data-snapping={snapping ? '' : undefined}
        onValueChange={([next]) => setLive(next ?? 5)}
        onValueCommit={([next]) => commit(next ?? 5)}
        onKeyDown={onKeyDown}
        className={cn(
          shown === null &&
            '[&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-thumb]]:border-input [&_[data-slot=slider-thumb]]:bg-input',
        )}
      />

      {/*
        Якоря стоят на позициях своих значений, а не по краям и середине:
        середина дорожки — это 5,5, и подпись «5» с бегунком расходилась.
      */}
      <div className="relative h-4 font-mono text-[10.5px] text-muted-foreground">
        <span className="absolute whitespace-nowrap" style={{ left: anchorAt(SCORE_MIN) }}>
          {SCORE_MIN} — {scale.low}
        </span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: anchorAt(5) }}>
          5 — как обычно
        </span>
        <span className="absolute -translate-x-full whitespace-nowrap" style={{ left: anchorAt(SCORE_MAX) }}>
          {SCORE_MAX} — {scale.high}
        </span>
      </div>
    </div>
  )
}

import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { DOW_FULL, formatHuman, isoDow, parseDay } from '@/domain/date'
import { DAY_TAGS } from '@/domain/tags'
import type { DayLog, ScoreField } from '@/domain/types'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/plural'
import { SCORE_MAX, SCORE_MIN, snapScore } from '@/domain/score'

type Scale = { field: ScoreField; label: string; low: string; high: string }

/** Шкала без якорей — это просто число: 7 у одного и 7 у другого означали бы разное. */
const SCALES: Scale[] = [
  { field: 'mood', label: 'Настроение', low: 'дно', high: 'отличное' },
  { field: 'wellbeing', label: 'Самочувствие', low: 'разбит', high: 'полон сил' },
  { field: 'productivity', label: 'Продуктивность', low: 'ничего', high: 'максимум' },
]

export type DayCloseDialogProps = {
  open: boolean
  /** Ключ дня `YYYY-MM-DD`. */
  day: string
  /** Уже закрытый день — тогда это правка, а не закрытие. */
  existing?: DayLog | null
  /** Сколько задач останется невыполненными, если закрыть день сейчас. */
  pendingCount?: number
  onSave: (log: DayLog) => void
  /** Передаётся только там, где отказаться можно: при правке уже закрытого дня. */
  onCancel?: () => void
}

/** Сколько бегунок доезжает до засечки после отпускания. */
const SNAP_MS = 150

/** Доля дорожки, на которой стоит значение. На шкале 0–10 пятёрка — ровно половина. */
const anchorAt = (value: number) =>
  `${((value - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100}%`

type Draft = Record<ScoreField, number | null>

const emptyDraft: Draft = { mood: null, wellbeing: null, productivity: null }

const draftFrom = (log: DayLog | null | undefined): Draft =>
  log ? { mood: log.mood, wellbeing: log.wellbeing, productivity: log.productivity } : emptyDraft

export function DayCloseDialog({
  open,
  day,
  existing,
  pendingCount = 0,
  onSave,
  onCancel,
}: DayCloseDialogProps) {
  /* Черновик начинается заново для каждого дня: вызывающий передаёт key={day}. */
  const [scores, setScores] = useState<Draft>(() => draftFrom(existing))
  const [tags, setTags] = useState<string[]>(() => [...(existing?.tags ?? [])])
  const [note, setNote] = useState(() => existing?.note ?? '')

  /*
   * Пока ползунок ведут, он идёт за пальцем с мелким шагом — иначе бегунок скачет
   * по десяти позициям и отстаёт от руки. Отпустили — оценка округляется до целого,
   * и бегунок доезжает до засечки: за это отвечает data-snapping.
   */
  const [dragging, setDragging] = useState<Partial<Record<ScoreField, number>>>({})
  const [snapping, setSnapping] = useState<ScoreField | null>(null)

  const commit = (field: ScoreField, raw: number) => {
    setScores((prev) => ({ ...prev, [field]: snapScore(raw) }))
    setDragging((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    setSnapping(field)
    window.setTimeout(() => setSnapping((f) => (f === field ? null : f)), SNAP_MS)
  }

  /** Стрелки и Home/End двигают на целое: мелкий шаг нужен только пальцу. */
  const onScaleKeyDown = (field: ScoreField, e: ReactKeyboardEvent) => {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      PageUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageDown: -1,
    }
    const step = steps[e.key]
    const jump = e.key === 'Home' ? SCORE_MIN : e.key === 'End' ? SCORE_MAX : null
    if (step === undefined && jump === null) return

    e.preventDefault()
    const base = scores[field] ?? 5
    setScores((prev) => ({ ...prev, [field]: jump ?? snapScore(base + step!) }))
  }

  const date = parseDay(day)
  const ready = SCALES.every((s) => scores[s.field] !== null)
  const editing = Boolean(existing)
  const canCancel = Boolean(onCancel)

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))

  const save = () => {
    if (!ready) return
    onSave({
      day,
      mood: scores.mood!,
      wellbeing: scores.wellbeing!,
      productivity: scores.productivity!,
      tags,
      note: note.trim(),
      closedAt: existing?.closedAt ?? new Date().toISOString(),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && canCancel) onCancel?.()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-[560px]"
        /* Решение Georgy: окно не закрывается, пока день не оценён. */
        onEscapeKeyDown={(e) => {
          if (!canCancel) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (!canCancel) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">
            {editing ? 'Оценка дня' : 'Как прошёл день'}
          </DialogTitle>
          <DialogDescription>
            {DOW_FULL[isoDow(date)]}, {formatHuman(date)}
            {editing ? '' : ' · день закрывается один раз'}
          </DialogDescription>
        </DialogHeader>

        {SCALES.map((scale) => {
          const value = scores[scale.field]
          const live = dragging[scale.field]
          /* Под пальцем цифра показывает, во что округлится оценка при отпускании. */
          const shown = live !== undefined ? snapScore(live) : value
          return (
            <div key={scale.field} className="flex flex-col gap-2">
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
                data-snapping={snapping === scale.field ? '' : undefined}
                onValueChange={([next]) =>
                  setDragging((prev) => ({ ...prev, [scale.field]: next ?? 5 }))
                }
                onValueCommit={([next]) => commit(scale.field, next ?? 5)}
                onKeyDown={(e) => onScaleKeyDown(scale.field, e)}
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
                <span
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: anchorAt(5) }}
                >
                  5 — как обычно
                </span>
                <span
                  className="absolute -translate-x-full whitespace-nowrap"
                  style={{ left: anchorAt(SCORE_MAX) }}
                >
                  {SCORE_MAX} — {scale.high}
                </span>
              </div>
            </div>
          )
        })}

        <div className="flex flex-col gap-2">
          <b className="text-[13.5px] font-semibold">Что было в этом дне</b>
          <div className="flex flex-wrap gap-1.5">
            {DAY_TAGS.map((tag) => {
              const active = tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                    active
                      ? 'border-foreground bg-foreground font-medium text-background'
                      : 'border-input bg-secondary text-secondary-foreground hover:bg-muted',
                  )}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <b className="text-[13.5px] font-semibold">Мысли за день</b>
            <em className="font-mono text-xs not-italic text-muted-foreground">необязательно</em>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Что запомнилось, что мешало, что получилось"
            className="min-h-20"
          />
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="max-w-[290px] text-[11.5px] text-muted-foreground">
            {pendingCount > 0 && !editing ? (
              <>
                <b>
                  {pendingCount}{' '}
                  {plural(pendingCount, 'задача останется', 'задачи останутся', 'задач останутся')}{' '}
                  невыполненными
                </b>{' '}
                — день закроется как есть.
              </>
            ) : (
              'Оценки нужны все три: без них день не закрывается.'
            )}
          </span>

          <span className="flex gap-2">
            {canCancel && (
              <Button variant="outline" onClick={() => onCancel?.()}>
                Отмена
              </Button>
            )}
            <Button size="lg" disabled={!ready} onClick={save}>
              {editing ? 'Сохранить' : 'Закрыть день'}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

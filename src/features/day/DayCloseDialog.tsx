import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { DOW_FULL, formatHuman, isoDow, parseDay } from '@/domain/date'
import { DAY_TAGS } from '@/domain/tags'
import type { DayLog, ScoreField } from '@/domain/types'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/plural'
import { ScoreScale, type Scale } from './ScoreScale'

const SCALES: (Scale & { field: ScoreField })[] = [
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

        {SCALES.map((scale) => (
          <ScoreScale
            key={scale.field}
            scale={scale}
            value={scores[scale.field]}
            onChange={(value) => setScores((prev) => ({ ...prev, [scale.field]: value }))}
          />
        ))}

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

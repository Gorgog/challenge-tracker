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
import { DOW_FULL, formatHuman, isoDow, parseDay } from '@/domain/date'
import type { Morning } from '@/domain/types'
import { ScoreScale, type Scale } from './ScoreScale'

type MorningField = Exclude<keyof Morning, 'night'>

/**
 * Утро — сон и те же шкалы самочувствия и настроения, что вечером, с теми же якорями:
 * утро и вечер сравниваются напрямую.
 */
const SCALES: (Scale & { field: MorningField })[] = [
  { field: 'sleep', label: 'Сон', low: 'не спал', high: 'отлично' },
  { field: 'wellbeing', label: 'Самочувствие', low: 'разбит', high: 'полон сил' },
  { field: 'mood', label: 'Настроение', low: 'дно', high: 'отличное' },
]

type Draft = Record<MorningField, number | null>

export type DayStartDialogProps = {
  open: boolean
  /** Ключ дня `YYYY-MM-DD`. */
  day: string
  onStart: (morning: Morning) => void
  /** Пропустить утро: день начнётся без оценок. */
  onSkip: () => void
  /** Окно закрыто — день остаётся не начатым. */
  onCancel: () => void
}

/**
 * Начало дня: сон, самочувствие и настроение до дел дня — база, с которой сравнится вечер.
 * Утро записывается один раз: поправить его нельзя (решение Georgy от 21.09).
 */
export function DayStartDialog({ open, day, onStart, onSkip, onCancel }: DayStartDialogProps) {
  const [scores, setScores] = useState<Draft>({ sleep: null, wellbeing: null, mood: null })
  const ready = SCALES.every((s) => scores[s.field] !== null)
  const date = parseDay(day)

  const start = () => {
    if (!ready) return
    onStart({ sleep: scores.sleep!, wellbeing: scores.wellbeing!, mood: scores.mood! })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">Начало дня</DialogTitle>
          <DialogDescription>
            {DOW_FULL[isoDow(date)]}, {formatHuman(date)} · утро записывается один раз
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

        <DialogFooter className="items-center sm:justify-between">
          <span className="max-w-[250px] text-[11.5px] text-muted-foreground">
            Оценки нужны все три — или пропусти утро: день начнётся без них.
          </span>

          <span className="flex gap-2">
            <Button variant="outline" onClick={onSkip}>
              Пропустить утро
            </Button>
            <Button size="lg" disabled={!ready} onClick={start}>
              Начать день
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import { clockText, minutesOf, nightProblem, type UsualNight } from '@/domain/night'
import { MORNING_NOTE_MAX, type Morning } from '@/domain/types'
import { NightTime, type NightAnswer } from './NightTime'
import { ScoreScale, type Scale } from './ScoreScale'

type MorningField = Exclude<keyof Morning, 'night' | 'note'>

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

const NONE: NightAnswer = { value: null, how: null }

export type DayStartDialogProps = {
  open: boolean
  /** Ключ дня `YYYY-MM-DD`. */
  day: string
  /** Обычный отбой и подъём (`usualNight`); null — ответов пока мало, только точное время. */
  usual: UsualNight
  /**
   * Который час — спрашивается при каждом вводе: часы страницы отстают до минуты, и подъём в текущую минуту
   * выглядел бы «ещё не наступившим». Подъём позже этого времени не записать.
   */
  now: () => Date
  onStart: (morning: Morning) => void
  /** Пропустить утро: день начнётся без оценок. */
  onSkip: () => void
  /** Окно закрыто — день остаётся не начатым. */
  onCancel: () => void
}

/**
 * Начало дня: ночь (лёг, встал), сон, самочувствие и настроение до дел дня — база, с которой сравнится
 * вечер. Ночь — над оценками, по порядку событий. Утро записывается один раз: поправить его нельзя
 * (решение Georgy от 21.09).
 */
export function DayStartDialog({ open, day, usual, now, onStart, onSkip, onCancel }: DayStartDialogProps) {
  const [scores, setScores] = useState<Draft>({ sleep: null, wellbeing: null, mood: null })
  const [bed, setBed] = useState<NightAnswer>(NONE)
  const [wake, setWake] = useState<NightAnswer>(NONE)
  /* заметка утра — необязательна и спрятана за «+ заметка»: утро не становится длиннее (решение Georgy 25.09) */
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const nowMin = minutesOf(now())
  const problem = nightProblem({ bed: bed.value, wake: wake.value }, nowMin)
  const ready = SCALES.every((s) => scores[s.field] !== null) && bed.how !== null && wake.how !== null && problem === null
  const date = parseDay(day)

  const start = () => {
    if (!ready) return
    onStart({
      sleep: scores.sleep!,
      wellbeing: scores.wellbeing!,
      mood: scores.mood!,
      night: { bed: bed.value!, wake: wake.value!, bedHow: bed.how!, wakeHow: wake.how! },
      ...(note.trim() ? { note: note.trim() } : {}),
    })
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

        <NightTime label="Лёг" kind="bed" answer={bed} usual={usual.bed} nowMin={nowMin} onChange={setBed} />
        <NightTime label="Встал" kind="wake" answer={wake} usual={usual.wake} nowMin={nowMin} onChange={setWake} />
        {usual.bed === null && usual.wake === null && (
          <span className="-mt-2 text-[11.5px] text-muted-foreground">
            Кнопка «как обычно» появится после трёх утр с этими ответами.
          </span>
        )}
        {problem && (
          <p role="alert" className="-mt-2 text-[12.5px] text-worse">
            {problem === 'future'
              ? `Встал в ${clockText(wake.value!)} — это время ещё не наступило.`
              : 'Лёг позже, чем встал, — проверь время.'}
          </p>
        )}

        <hr className="border-border" />

        {SCALES.map((scale) => (
          <ScoreScale
            key={scale.field}
            scale={scale}
            value={scores[scale.field]}
            onChange={(value) => setScores((prev) => ({ ...prev, [scale.field]: value }))}
          />
        ))}

        {noteOpen ? (
          <Textarea
            aria-label="Заметка утра"
            autoFocus
            value={note}
            maxLength={MORNING_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Как спал, что на уме с утра"
            className="min-h-16"
          />
        ) : (
          <button type="button" onClick={() => setNoteOpen(true)} className="self-start text-[13px] text-primary">
            + заметка
          </button>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <span className="max-w-[250px] text-[11.5px] text-muted-foreground">
            Нужны все пять ответов — или пропусти утро: день начнётся без них.
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

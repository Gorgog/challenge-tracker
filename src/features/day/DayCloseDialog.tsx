import { useState, type CSSProperties } from 'react'
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
import { DAY_TAGS, levelLabel, LEVELS } from '@/domain/tags'
import type { Challenge, DayLog, ScoreField } from '@/domain/types'
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
  /**
   * Отказы, которые в этот день в челлендже, и их отметка за день (срез 5а): 0 — срыв отмечен днём, 1 — «Да, без».
   * Закрыть день можно, только ответив по каждому.
   */
  quits?: QuitQuestion[]
  /**
   * `answers` — ответы отказов для записи. При правке закрытого дня прежние ответы заморожены и не уходят; ответить
   * можно только на неотвеченный (отказ завели после закрытия) — ревью 5а, решение Georgy.
   */
  onSave: (log: DayLog, answers: Record<string, 0 | 1>) => void
  /** Передаётся только там, где отказаться можно: при правке уже закрытого дня или после отказа базы. */
  onCancel?: () => void
  /** База ещё отвечает: кнопка выключена, выйти нельзя — иначе оценки потеряются на полпути. */
  saving?: boolean
  /** Нет сети: запись ждёт связь и уйдёт сама — сказать об этом и отпустить. */
  offline?: boolean
}

type Draft = Record<ScoreField, number | null>

export type QuitQuestion = { challenge: Challenge; value?: number }

const NO_QUITS: QuitQuestion[] = []

/** Ответ из отметки дня: только 0 и 1 — ответы, остальное (нет записи) — не отвечено. */
const answerOf = (value: number | undefined): 0 | 1 | null => (value === 0 || value === 1 ? value : null)

const emptyDraft: Draft = { mood: null, wellbeing: null, productivity: null }

const draftFrom = (log: DayLog | null | undefined): Draft =>
  log ? { mood: log.mood, wellbeing: log.wellbeing, productivity: log.productivity } : emptyDraft

type Levels = Record<string, number>

/**
 * Ступени правки — только отмеченных тегов и только годные: ступень снятого тега иначе всплыла бы нажатой, когда
 * тег отметят заново.
 */
const levelsFrom = (log: DayLog | null | undefined): Levels =>
  log
    ? Object.fromEntries(
        Object.entries(log.levels ?? {}).filter(([tag, level]) => log.tags.includes(tag) && levelLabel(tag, level) !== null),
      )
    : {}

const omit = (levels: Levels, tag: string): Levels => Object.fromEntries(Object.entries(levels).filter(([t]) => t !== tag))

/**
 * «Сколько?» у отмеченного тега со ступенями (срез 5б, макет одобрен Georgy). Заранее ничего не нажато: тег без
 * ступени — «было, сколько — не указано», значение по умолчанию выдало бы догадку за запись.
 */
function LevelPicker({ tag, value, onPick }: { tag: string; value: number | undefined; onPick: (level: number) => void }) {
  const { question, short, note } = LEVELS[tag]!
  return (
    <div role="group" aria-label={question} className="flex flex-col gap-2 rounded-[10px] border px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-medium">{question}</span>
        <em className="font-mono text-xs not-italic text-muted-foreground">можно не выбирать</em>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {short.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-pressed={value === i + 1}
            onClick={() => onPick(i + 1)}
            className={cn(
              'min-w-14 rounded-lg border px-3 py-1.5 text-[13px] transition-colors',
              value === i + 1
                ? 'border-primary bg-primary font-semibold text-primary-foreground'
                : 'border-input bg-secondary text-secondary-foreground hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {note && <p className="text-[11.5px] text-muted-foreground">{note}</p>}
    </div>
  )
}

export function DayCloseDialog({
  open,
  day,
  existing,
  pendingCount = 0,
  quits = NO_QUITS,
  onSave,
  onCancel,
  saving = false,
  offline = false,
}: DayCloseDialogProps) {
  /* Черновик начинается заново для каждого дня: вызывающий передаёт key={day}. */
  const [scores, setScores] = useState<Draft>(() => draftFrom(existing))
  const [tags, setTags] = useState<string[]>(() => [...(existing?.tags ?? [])])
  const [levels, setLevels] = useState<Levels>(() => levelsFrom(existing))
  const [note, setNote] = useState(() => existing?.note ?? '')
  const [answers, setAnswers] = useState<Record<string, 0 | 1 | null>>(() =>
    Object.fromEntries(quits.map((q) => [q.challenge.id, answerOf(q.value)])),
  )

  const date = parseDay(day)
  const editing = Boolean(existing)
  /* закрытый день отметки замораживает: при правке прежние ответы видны и заперты, неотвеченный — по желанию */
  const locked = (q: QuitQuestion) => editing && answerOf(q.value) !== null
  const unanswered = editing ? 0 : quits.filter((q) => answers[q.challenge.id] == null).length
  const ready = SCALES.every((s) => scores[s.field] !== null) && unanswered === 0
  const canCancel = Boolean(onCancel) && !saving

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
    /* снял тег — ступень пропадает вместе с ним; у только что отмеченного её ещё нет */
    setLevels((prev) => omit(prev, tag))
  }
  /* ступень необязательна (решение Georgy 25.09): повторное нажатие её снимает, тег остаётся «было» */
  const pickLevel = (tag: string, level: number) =>
    setLevels((prev) => (prev[tag] === level ? omit(prev, tag) : { ...prev, [tag]: level }))

  const save = () => {
    if (!ready || saving) return
    onSave({
      day,
      mood: scores.mood!,
      wellbeing: scores.wellbeing!,
      productivity: scores.productivity!,
      tags,
      levels,
      note: note.trim(),
      closedAt: existing?.closedAt ?? new Date().toISOString(),
    }, Object.fromEntries(
      quits.flatMap((q) => {
        const answer = answers[q.challenge.id]
        return locked(q) || answer == null ? [] : [[q.challenge.id, answer]]
      }),
    ))
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

        {quits.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <b className="text-[13.5px] font-semibold">Отказы</b>
              {!editing && <em className="font-mono text-xs not-italic text-muted-foreground">ответ обязателен</em>}
            </div>
            {quits.map((q) => {
              const c = q.challenge
              const answer = answers[c.id] ?? null
              return (
                <div
                  key={c.id}
                  role="group"
                  aria-label={c.name}
                  style={{ '--c': c.color } as CSSProperties}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border px-2.5 py-2"
                >
                  <span aria-hidden className="size-2.5 rounded-full bg-[var(--c)]" />
                  <span className="min-w-0 text-[14px] font-medium">{c.name}</span>
                  <span className="flex gap-1">
                    {([1, 0] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={answer === v}
                        disabled={locked(q)}
                        onClick={() => setAnswers((prev) => ({ ...prev, [c.id]: v }))}
                        className={cn(
                          'rounded-full border px-3 py-1 text-[12.5px] transition-colors disabled:cursor-default',
                          answer !== v && 'border-input bg-secondary text-secondary-foreground enabled:hover:bg-muted',
                          answer === v && v === 1 && 'border-foreground bg-foreground font-medium text-background',
                          answer === v && v === 0 && 'border-destructive bg-destructive font-medium text-white',
                        )}
                      >
                        {v === 1 ? 'Да, без' : 'Сорвался'}
                      </button>
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <b className="text-[13.5px] font-semibold">Что было в этом дне</b>
          <div className="flex flex-wrap gap-1.5">
            {DAY_TAGS.map((tag) => {
              const active = tags.includes(tag)
              /* ступени есть только у отмеченных тегов — чип подписан ступенью: «алкоголь · 3–5» */
              const level = levelLabel(tag, levels[tag])
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
                  {level ? `${tag} · ${level}` : tag}
                </button>
              )
            })}
          </div>
          {DAY_TAGS.filter((tag) => tags.includes(tag) && LEVELS[tag]).map((tag) => (
            <LevelPicker key={tag} tag={tag} value={levels[tag]} onPick={(level) => pickLevel(tag, level)} />
          ))}
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
            {unanswered > 0 ? (
              <b>
                Осталось ответить: {unanswered} {plural(unanswered, 'отказ', 'отказа', 'отказов')}
              </b>
            ) : pendingCount > 0 && !editing ? (
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

          {offline && (
            <p role="status" className="basis-full text-[12.5px] text-muted-foreground">
              Нет связи: итог сохранён на этом устройстве и уйдёт в базу, когда появится сеть. Окно можно закрыть.
            </p>
          )}
          <span className="flex gap-2">
            {canCancel && (
              <Button variant="outline" onClick={() => onCancel?.()}>
                Отмена
              </Button>
            )}
            <Button size="lg" disabled={!ready || saving} onClick={save}>
              {saving ? 'Сохраняю…' : editing ? 'Сохранить' : 'Закрыть день'}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

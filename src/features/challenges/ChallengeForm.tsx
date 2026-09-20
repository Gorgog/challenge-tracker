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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { todayKey } from '@/domain/date'
import { buildChallenge, suggestCode } from '@/domain/newChallenge'
import type { Challenge, ChallengeKind, ChallengeMeasure } from '@/domain/types'
import { cn } from '@/lib/utils'

export type ChallengeFormProps = {
  open: boolean
  /** Уже заведённые челленджи: из них берутся свободный цвет и порядок. */
  existing: Challenge[]
  onCreate: (challenge: Omit<Challenge, 'id'>) => void
  onCancel: () => void
}

export function ChallengeForm({ open, existing, onCreate, onCancel }: ChallengeFormProps) {
  const [name, setName] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [kind, setKind] = useState<ChallengeKind>('do')
  const [measure, setMeasure] = useState<ChallengeMeasure>('binary')
  const [goalText, setGoalText] = useState('1')
  const [unit, setUnit] = useState('')
  const [tag, setTag] = useState('')
  const [limited, setLimited] = useState(false)
  const [lengthText, setLengthText] = useState('30')

  /* Код следует за названием, пока его не тронули руками. */
  const code = codeTouched ? codeInput : suggestCode(name)
  const counted = kind === 'do' && measure === 'count'
  const ready = name.trim().length > 0

  const submit = () => {
    if (!ready) return
    onCreate(
      buildChallenge(
        {
          name,
          code,
          kind,
          measure,
          goal: Number(goalText) || 1,
          unit,
          tag,
          lengthDays: limited ? Number(lengthText) || 1 : null,
        },
        existing,
        todayKey(),
      ),
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">Новый челлендж</DialogTitle>
          <DialogDescription>
            Привычку нужно выполнять, отказ — держать. Считаются они по-разному.
          </DialogDescription>
        </DialogHeader>

        <Field id="ch-name" label="Название">
          <Input
            id="ch-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: читать 20 страниц"
            autoFocus
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Тип</span>
          <div className="flex gap-2">
            <Choice active={kind === 'do'} onClick={() => setKind('do')}>
              Привычка
            </Choice>
            <Choice active={kind === 'quit'} onClick={() => setKind('quit')}>
              Отказ
            </Choice>
          </div>
          <p className="text-xs text-muted-foreground">
            {kind === 'do'
              ? 'День пустой, отметка означает выполнено.'
              : 'День засчитывается сам, отмечается только срыв.'}
          </p>
        </div>

        {kind === 'do' && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium">Чем измеряем</span>
            <div className="flex gap-2">
              <Choice active={measure === 'binary'} onClick={() => setMeasure('binary')}>
                Галочка
              </Choice>
              <Choice active={measure === 'count'} onClick={() => setMeasure('count')}>
                Число
              </Choice>
            </div>
          </div>
        )}

        {counted && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="ch-goal" label="Цель в день">
              <Input
                id="ch-goal"
                inputMode="numeric"
                value={goalText}
                onChange={(e) => setGoalText(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field id="ch-unit" label="Единица">
              <Input
                id="ch-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="раз, шагов, страниц"
              />
            </Field>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Срок</span>
          <div className="flex gap-2">
            <Choice active={!limited} onClick={() => setLimited(false)}>
              Бессрочно
            </Choice>
            <Choice active={limited} onClick={() => setLimited(true)}>
              Задать срок
            </Choice>
          </div>
          {limited && (
            <Field id="ch-length" label="Дней">
              <Input
                id="ch-length"
                inputMode="numeric"
                value={lengthText}
                onChange={(e) => setLengthText(e.target.value.replace(/\D/g, ''))}
                className="w-28"
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field id="ch-tag" label="Тег">
            <Input
              id="ch-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="тело, ум, еда"
            />
          </Field>
          <Field id="ch-code" label="Код">
            <Input
              id="ch-code"
              value={code}
              maxLength={4}
              onChange={(e) => {
                setCodeTouched(true)
                setCodeInput(e.target.value.toUpperCase())
              }}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button disabled={!ready} onClick={submit}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </Label>
      {children}
    </div>
  )
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-[13px] transition-colors',
        active
          ? 'border-foreground bg-foreground font-medium text-background'
          : 'border-input bg-secondary text-secondary-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

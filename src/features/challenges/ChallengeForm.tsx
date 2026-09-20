import { useState } from 'react'
import { LockIcon } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import type { ChallengePatch } from '@/domain/challenges'
import { todayKey } from '@/domain/date'
import { buildChallenge, suggestCode } from '@/domain/newChallenge'
import type { Challenge, ChallengeKind, ChallengeMeasure, Tag } from '@/domain/types'
import { cn } from '@/lib/utils'
import { TagPicker } from './TagPicker'

export type ChallengeFormProps = {
  open: boolean
  /** Уже заведённые челленджи: из них берутся свободный цвет и порядок. */
  existing: Challenge[]
  /** Все теги челленджей — из них выбираются теги этого. */
  tags: Tag[]
  /** Передан — форма правит его, не передан — заводит новый. */
  challenge?: Challenge
  onCreate?: (challenge: Omit<Challenge, 'id'>) => void
  onSave?: (patch: ChallengePatch) => void
  onCancel: () => void
}

export function ChallengeForm({
  open,
  existing,
  tags,
  challenge,
  onCreate,
  onSave,
  onCancel,
}: ChallengeFormProps) {
  const editing = Boolean(challenge)
  /* Замок, который стоял ещё до открытия формы. Здесь его не снять. */
  const rulesFrozen = Boolean(challenge?.rulesLocked)

  const [name, setName] = useState(challenge?.name ?? '')
  const [codeInput, setCodeInput] = useState(challenge?.code ?? '')
  const [codeTouched, setCodeTouched] = useState(editing)
  const [kind, setKind] = useState<ChallengeKind>(challenge?.kind ?? 'do')
  const [measure, setMeasure] = useState<ChallengeMeasure>(challenge?.measure ?? 'binary')
  const [goalText, setGoalText] = useState(String(challenge?.goal ?? 1))
  const [unit, setUnit] = useState(challenge?.unit ?? '')
  const [limited, setLimited] = useState(challenge ? challenge.lengthDays !== null : false)
  const [lengthText, setLengthText] = useState(String(challenge?.lengthDays ?? 30))
  const [tagIds, setTagIds] = useState<string[]>(challenge?.tagIds ?? [])
  const [rulesLocked, setRulesLocked] = useState(challenge?.rulesLocked ?? false)

  /* Код следует за названием, пока его не тронули руками. */
  const code = codeTouched ? codeInput : suggestCode(name)
  const counted = kind === 'do' && measure === 'count'
  const ready = name.trim().length > 0

  const submit = () => {
    if (!ready) return
    const goal = counted ? Number(goalText) || 1 : 1
    const lengthDays = limited ? Number(lengthText) || 1 : null

    if (challenge) {
      onSave?.({
        name,
        code,
        tagIds,
        rulesLocked,
        /* У запертого правила не отправляем вовсе: applyPatch их всё равно отбросит. */
        ...(rulesFrozen
          ? {}
          : {
              kind,
              measure: counted ? 'count' : 'binary',
              goal,
              unit: counted ? unit.trim() || null : null,
              lengthDays,
            }),
      })
      return
    }

    onCreate?.(
      buildChallenge(
        { name, code, kind, measure, goal, unit, tagIds, rulesLocked, lengthDays },
        existing,
        todayKey(),
      ),
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">
            {editing ? 'Изменить челлендж' : 'Новый челлендж'}
          </DialogTitle>
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

        {rulesFrozen && (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <LockIcon className="size-3.5 shrink-0" />
            Правила заперты — тип, измерение, цель и срок не меняются.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Тип</span>
          <div className="flex gap-2">
            <Choice active={kind === 'do'} disabled={rulesFrozen} onClick={() => setKind('do')}>
              Привычка
            </Choice>
            <Choice active={kind === 'quit'} disabled={rulesFrozen} onClick={() => setKind('quit')}>
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
              <Choice
                active={measure === 'binary'}
                disabled={rulesFrozen}
                onClick={() => setMeasure('binary')}
              >
                Галочка
              </Choice>
              <Choice
                active={measure === 'count'}
                disabled={rulesFrozen}
                onClick={() => setMeasure('count')}
              >
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
                disabled={rulesFrozen}
                onChange={(e) => setGoalText(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field id="ch-unit" label="Единица">
              <Input
                id="ch-unit"
                value={unit}
                disabled={rulesFrozen}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="раз, шагов, страниц"
              />
            </Field>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Срок</span>
          <div className="flex gap-2">
            <Choice active={!limited} disabled={rulesFrozen} onClick={() => setLimited(false)}>
              Бессрочно
            </Choice>
            <Choice active={limited} disabled={rulesFrozen} onClick={() => setLimited(true)}>
              Задать срок
            </Choice>
          </div>
          {limited && (
            <Field id="ch-length" label="Дней">
              <Input
                id="ch-length"
                inputMode="numeric"
                value={lengthText}
                disabled={rulesFrozen}
                onChange={(e) => setLengthText(e.target.value.replace(/\D/g, ''))}
                className="w-28"
              />
            </Field>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Теги</span>
          <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />
        </div>

        <div className="grid grid-cols-2 gap-3">
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

        <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
          <Switch
            id="ch-lock"
            checked={rulesLocked}
            disabled={rulesFrozen}
            onCheckedChange={setRulesLocked}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="ch-lock" className="text-[13px] font-medium">
              Запереть правила
            </Label>
            <p className="text-xs text-muted-foreground">
              Тип, измерение, цель и срок потом не поменять — статистику не подправить задним
              числом. Название и теги менять можно. Запереть можно и позже, отпереть — нет.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button disabled={!ready} onClick={submit}>
            {editing ? 'Сохранить' : 'Создать'}
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
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'border-foreground bg-foreground font-medium text-background'
          : 'border-input bg-secondary text-secondary-foreground enabled:hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { bedFromInput, clockText, inputOf, wakeFromInput } from '@/domain/night'
import type { NightHow } from '@/domain/types'

export type NightAnswer = { value: number | null; how: NightHow | null }

type NightTimeProps = {
  label: 'Лёг' | 'Встал'
  kind: 'bed' | 'wake'
  answer: NightAnswer
  /** Обычное время; null — ответов пока мало, кнопки нет. */
  usual: number | null
  /** Минуты часов сейчас: время, которое ещё не наступило, кнопкой не выбрать. */
  nowMin: number
  onChange: (answer: NightAnswer) => void
}

/**
 * Лёг или встал — две вещи сразу (решение Georgy 24.09): «как обычно» подставляет обычное время в поле,
 * поле — точное время. Поправил поле — ответ «точно», даже если совпало с обычным: ответ дан полем.
 */
export function NightTime({ label, kind, answer, usual, nowMin, onChange }: NightTimeProps) {
  const future = usual !== null && usual > nowMin
  const fromInput = kind === 'bed' ? bedFromInput : wakeFromInput

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[13.5px] font-semibold">{label}</b>
        <em className="font-mono text-xs not-italic text-muted-foreground tabular-nums">
          {answer.value === null ? 'не выбрано' : clockText(answer.value)}
        </em>
      </div>

      <div className="flex flex-wrap gap-2">
        {usual !== null && (
          <Button
            type="button"
            variant="outline"
            aria-pressed={answer.how === 'usual'}
            aria-label={`${label} как обычно, ${clockText(usual)}`}
            disabled={future}
            onClick={() => onChange({ value: usual, how: 'usual' })}
            className="flex-1 justify-start aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:font-semibold aria-pressed:text-primary"
          >
            как обычно · <span className="font-mono">{clockText(usual)}</span>
          </Button>
        )}
        <Input
          type="time"
          step={300}
          aria-label={`${label}, точное время`}
          value={answer.value === null ? '' : inputOf(answer.value)}
          onChange={(e) => {
            const value = fromInput(e.target.value)
            onChange({ value, how: value === null ? null : 'exact' })
          }}
          className="w-[7.5rem] font-mono tabular-nums"
        />
      </div>

      {future && (
        <span className="text-[11.5px] text-muted-foreground">{clockText(usual)} ещё не наступило — укажи точное время</span>
      )}
    </div>
  )
}

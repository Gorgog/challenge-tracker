import { CheckIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { demoScenario, type DemoScenario } from '@/data/demoRepo'
import { cn } from '@/lib/utils'
import { resetDemoData } from './resetDemo'

const SCENARIOS: { id: DemoScenario; title: string; hint: string }[] = [
  {
    id: 'burnout',
    title: 'Выход из выгорания — 30 дней',
    hint: 'Прогулки учащаются, пиво в будни, недосып уходит.',
  },
  {
    id: 'full',
    title: 'Полное демо — 120 дней',
    hint: 'Шесть челленджей; на нём проверяется аналитика.',
  },
]

function resetTo(scenario: DemoScenario) {
  try {
    resetDemoData(localStorage, scenario)
  } catch {
    /* приватное окно или запрет хранилища — сбрасывать нечего */
  }
  location.reload()
}

type DemoResetButtonProps = {
  /** Какая история сейчас; по умолчанию — из хранилища. */
  current?: DemoScenario
  onReset?: (scenario: DemoScenario) => void
}

/**
 * Временная кнопка на время переноса интерфейса: возвращает демо-данные к исходному сиду
 * выбранной истории, чтобы смотреть экраны с чистого листа. Уедет вместе с demoRepo, когда
 * подключим Supabase.
 */
export function DemoResetButton({ current = demoScenario(), onReset = resetTo }: DemoResetButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed right-4 bottom-4 z-50 gap-1.5 bg-card/90 shadow-lg backdrop-blur"
        >
          <RotateCcwIcon className="size-3.5" />
          Сбросить демо
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-0.5 p-1">
        <p className="px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground">
          С какой истории начать? Из аккаунта не выкинет.
        </p>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onReset(s.id)}
            aria-current={s.id === current ? 'true' : undefined}
            className="flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <CheckIcon
              aria-hidden="true"
              className={cn('mt-0.5 size-3.5 shrink-0', s.id === current ? 'opacity-100' : 'opacity-0')}
            />
            <span>
              <span className="block text-[13px] font-medium">{s.title}</span>
              <span className="block text-[11px] text-muted-foreground">{s.hint}</span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

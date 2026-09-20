import { RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resetDemoData } from './resetDemo'

/**
 * Временная кнопка на время переноса интерфейса: возвращает демо-данные
 * к исходному сиду, чтобы каждый раз смотреть экраны с чистого листа.
 * Уедет вместе с demoRepo, когда подключим Supabase.
 */
export function DemoResetButton() {
  const reset = () => {
    try {
      resetDemoData(localStorage)
    } catch {
      /* приватное окно или запрет хранилища — сбрасывать нечего */
    }
    location.reload()
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={reset}
      title="Вернуть демо-данные к исходному состоянию. Из аккаунта не выкинет."
      className="fixed right-4 bottom-4 z-50 gap-1.5 bg-card/90 shadow-lg backdrop-blur"
    >
      <RotateCcwIcon className="size-3.5" />
      Сбросить демо
    </Button>
  )
}

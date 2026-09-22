import type { Comparison } from '@/domain/timeline'
import { plural } from '@/lib/plural'
import { num1 } from './words'

/** Разница меньше балла — «почти такое же». */
const SAME = 1

/**
 * «Почему это важно» так, чтобы понял и школьник: вывод словами, две полоски из 10 и мелко — на чём
 * это держится. Это совпадение по дням, а не доказательство, и так и подписано.
 */
export function CompareBlock({ comparison, scope }: { comparison: Comparison; scope: string }) {
  const { subject, with: a, without: b, withDays, withoutDays, sleep } = comparison
  const d = a - b
  const worse = d < 0 ? 'хуже' : 'лучше'
  const tag = subject.kind === 'tag' ? subject.tag : null

  const title = tag
    ? Math.abs(d) < SAME
      ? `После вечера с тегом «${tag}» утро почти такое же, как обычно`
      : `После вечера с тегом «${tag}» ты обычно просыпаешься ${worse}`
    : Math.abs(d) < SAME
      ? 'После плохой ночи день почти такой же, как обычно'
      : `После плохой ночи день у тебя обычно ${worse}`
  const what = tag
    ? `Полоски — какое утро (самочувствие и настроение), ${scope}.`
    : `Полоски — какой вечер (самочувствие и настроение), ${scope}.`
  const sleepText =
    sleep && Math.abs(sleep.with - sleep.without) >= SAME
      ? ` И спишь ${sleep.with < sleep.without ? 'хуже' : 'лучше'}: сон ${num1(sleep.with)} против ${num1(sleep.without)}.`
      : ''
  const unit = (n: number) => (tag ? plural(n, 'утро', 'утра', 'утр') : plural(n, 'день', 'дня', 'дней'))
  const rows = [
    { label: tag ? `после «${tag}»` : 'после плохой ночи', value: a, low: a < b },
    { label: tag ? 'без него' : 'после обычной', value: b, low: b < a },
  ]

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary px-4 py-3">
      <p className="text-[15px] font-semibold text-balance">{title}</p>
      <div className="grid grid-cols-[max-content_1fr_max-content] items-center gap-x-2.5 gap-y-1.5 text-[13px]">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-card">
              <span
                className={`block h-full rounded-full ${r.low ? 'bg-destructive' : 'bg-good'}`}
                style={{ width: `${Math.max(3, r.value * 10)}%` }}
              />
            </span>
            <span className="font-mono text-[13px] whitespace-nowrap">
              {num1(r.value)}
              <span className="text-muted-foreground"> из 10</span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-[13px]">
        {what}
        {sleepText}
      </p>
      <p className="text-[11.5px] text-muted-foreground">
        Так было в твоих записях: {withDays} {unit(withDays)} «с» и {withoutDays} «без». Это совпадение по дням, а
        не доказательство.
      </p>
    </div>
  )
}

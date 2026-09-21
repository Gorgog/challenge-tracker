import { useMemo } from 'react'
import { useChallenges, useDayLogs, useEntries } from '@/data/queries'
import { parseDay, todayKey } from '@/domain/date'
import { challengeEffects, tagEffects } from '@/domain/effects'
import { averages, coverage, scoreSeries } from '@/domain/trend'
import { plural } from '@/lib/plural'
import { EffectCard } from './EffectCard'
import { cardsOf, tagsOf } from './order'
import { ScoreTiles } from './ScoreTiles'
import { ScoreTrend } from './ScoreTrend'
import { TagEffects } from './TagEffects'

const SECTION_TITLE = 'text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground'
/** Меньше двух недель оценок — выводов почти нет, а те, что есть, ранние: об этом стоит сказать сразу. */
const FEW_RATED = 14

export function AnalyticsPage() {
  const challenges = useChallenges()
  const entries = useEntries()
  const logs = useDayLogs()
  const todayK = todayKey()

  const all = challenges.data
  const entriesById = entries.data
  const dayLogs = logs.data

  /* Расчёт — по всем челленджам, с удалёнными: они участвуют как соседи. Скрываются на экране. */
  const cards = useMemo(
    () => (all && entriesById && dayLogs ? cardsOf(challengeEffects(all, entriesById, dayLogs, parseDay(todayK))) : []),
    [all, entriesById, dayLogs, todayK],
  )
  const tags = useMemo(() => (dayLogs ? tagsOf(tagEffects(dayLogs)) : []), [dayLogs])
  const days = useMemo(
    () =>
      dayLogs
        ? { series: scoreSeries(dayLogs, parseDay(todayK)), month: averages(dayLogs, parseDay(todayK)) }
        : null,
    [dayLogs, todayK],
  )

  const { rated, span, sick } = coverage(dayLogs ?? [], parseDay(todayK))
  const loading = challenges.isPending || entries.isPending || logs.isPending

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-7">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Аналитика</h1>
        {!loading && (
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Оценено {rated} из {span} {plural(span, 'дня', 'дней', 'дней')}
            {sick > 0 && ` · дни болезни (${sick}) и следующие за ними в выводы не идут`}
          </p>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Загружаю…</p>
      ) : (
        <>
          {rated < FEW_RATED && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Оценено {rated} {plural(rated, 'день', 'дня', 'дней')} — данных пока мало: первые выводы обычно
                появляются на второй неделе и поначалу часто меняются.
              </p>
            </div>
          )}

          <section aria-labelledby="helps-title" className="flex flex-col gap-2">
            <h2 id="helps-title" className={SECTION_TITLE}>
              Что помогает
            </h2>
            {cards.length ? (
              <div className="grid items-start gap-3 lg:grid-cols-2">
                {cards.map((e) => (
                  <EffectCard key={e.challenge.id} effect={e} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">Челленджей пока нет — сравнивать нечего.</p>
              </div>
            )}
          </section>

          <section aria-labelledby="tags-title" className="flex flex-col gap-2">
            <h2 id="tags-title" className={SECTION_TITLE}>
              Теги дня
            </h2>
            <TagEffects tags={tags} />
          </section>

          {days && (
            <section aria-labelledby="days-title" className="flex flex-col gap-2">
              <h2 id="days-title" className={SECTION_TITLE}>
                Как идут дни
              </h2>
              <ScoreTiles averages={days.month} />
              <p className="text-[11px] text-muted-foreground">
                Средние за последние 30 дней, рядом — сдвиг к предыдущим 30.
              </p>
              <div className="rounded-xl border border-border bg-card p-4">
                <ScoreTrend series={days.series} />
              </div>
            </section>
          )}

          <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            Это связи в твоих данных, а не доказанные причины. «Уверенно», «похоже» и «возможно» ставятся
            только по следующему дню: в тот же день хороший день сам тянет выполнение, и разница там может
            быть совпадением. «Возможно» — ранний вывод, пока дней мало: в первые недели он ошибается
            примерно через раз, а когда дней набирается, его сменяют «похоже», «уверенно» или «неясно».
            Разницы «с» и «без» посчитаны с поправкой на выходные, на полосы хороших и плохих дней и на
            общий подъём или спад оценок; день старта, вчерашний день и дни болезни в расчёт не идут.
          </p>
        </>
      )}
    </div>
  )
}

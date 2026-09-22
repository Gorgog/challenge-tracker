export type Series = 'wellbeing' | 'mood' | 'sleep'

/** Шкалы графика и их цвета — одни и те же на графике, в чипах и в таблицах цифр. */
export const SERIES: { id: Series; label: string; color: string }[] = [
  { id: 'wellbeing', label: 'Самочувствие', color: 'var(--chart-1)' },
  { id: 'mood', label: 'Настроение', color: 'var(--chart-2)' },
  { id: 'sleep', label: 'Сон', color: 'var(--chart-4)' },
]

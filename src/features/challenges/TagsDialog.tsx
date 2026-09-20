import { useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Tag } from '@/domain/types'
import { plural } from '@/lib/plural'

export type TagsDialogProps = {
  open: boolean
  tags: Tag[]
  /** Сколько живых челленджей носят каждый тег: id тега → количество. */
  usage: Record<string, number>
  /** Может отклонить (дубль, пустое имя) — ошибка показывается под полем. */
  onCreate: (name: string) => Promise<unknown>
  onDelete: (id: string) => void
  onClose: () => void
}

const norm = (s: string) => s.trim().toLocaleLowerCase('ru')

/**
 * Одно поле и ищет, и заводит: вписал — список сузился; такого нет — «Добавить».
 * Поле стоит на месте, прокручивается только список: на сотне тегов поле
 * не должно уезжать вверх.
 */
export function TagsDialog({ open, tags, usage, onCreate, onDelete, onClose }: TagsDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const clean = name.trim()
  /* Дубль ловим сразу, до запроса: иначе человек узнаёт об ошибке только после нажатия. */
  const duplicate = clean.length > 0 && tags.some((t) => norm(t.name) === norm(clean))
  const canAdd = clean.length > 0 && !duplicate
  const shown = tags.filter((t) => norm(t.name).includes(norm(name)))

  const add = async () => {
    if (!canAdd) return
    try {
      await onCreate(clean)
      setName('')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось добавить тег')
    }
  }

  const remove = (tag: Tag) => {
    if ((usage[tag.id] ?? 0) > 0) setConfirming(tag.id)
    else onDelete(tag.id)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">Теги челленджей</DialogTitle>
          <DialogDescription>
            Группируют челленджи. С тегами дня («мало спал», «дедлайн») не пересекаются.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Input
              aria-label="Найти или добавить новый тег"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void add()
                }
              }}
              placeholder="Найти или добавить тег"
              aria-invalid={duplicate || Boolean(error)}
            />
            <Button onClick={() => void add()} disabled={!canAdd}>
              Добавить
            </Button>
          </div>
          {duplicate && <p className="text-xs text-destructive">Такой тег уже есть</p>}
          {!duplicate && error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {tags.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">Тегов пока нет.</p>
          ) : shown.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Такого тега нет — добавь его кнопкой справа.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {shown.map((t) => {
                const count = usage[t.id] ?? 0
                return (
                  <li key={t.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium">{t.name}</div>
                        <div className="font-mono text-[10.5px] text-muted-foreground">
                          {count > 0
                            ? `${count} ${plural(count, 'челлендж', 'челленджа', 'челленджей')}`
                            : 'не используется'}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Удалить тег «${t.name}»`}
                        onClick={() => remove(t)}
                        className="hover:text-destructive"
                      >
                        <Trash2Icon />
                      </Button>
                    </div>

                    {confirming === t.id && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-destructive/5 px-2.5 py-2 text-xs">
                        <span>
                          Снимется с {count} {plural(count, 'челленджа', 'челленджей', 'челленджей')}.
                        </span>
                        <span className="flex gap-1.5">
                          <Button variant="outline" size="xs" onClick={() => setConfirming(null)}>
                            Отмена
                          </Button>
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() => {
                              onDelete(t.id)
                              setConfirming(null)
                            }}
                          >
                            Да, удалить
                          </Button>
                        </span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

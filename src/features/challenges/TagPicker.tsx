import { useState } from 'react'
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Tag } from '@/domain/types'
import { cn } from '@/lib/utils'

export type TagPickerProps = {
  tags: Tag[]
  /** Выбранные id — в том порядке, в котором их отмечали. */
  value: string[]
  onChange: (ids: string[]) => void
}

const norm = (s: string) => s.trim().toLocaleLowerCase('ru')

/**
 * Мультиселект тегов с поиском. Выбранные видны чипами прямо в форме,
 * а список с поиском открывается поверх — на сотне тегов форма не раздувается.
 */
export function TagPicker({ tags, value, onChange }: TagPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = value.flatMap((id) => tags.find((t) => t.id === id) ?? [])
  const shown = tags.filter((t) => norm(t.name).includes(norm(query)))

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <span
              key={t.id}
              className="flex items-center gap-1 rounded-full border border-input bg-secondary py-0.5 pr-1 pl-2.5 text-[12px] text-secondary-foreground"
            >
              {t.name}
              <button
                type="button"
                aria-label={`Убрать тег «${t.name}»`}
                onClick={() => toggle(t.id)}
                className="grid size-4 place-items-center rounded-full hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery('')
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Выбрать теги"
            className="flex h-9 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-[13px] text-muted-foreground hover:bg-muted/50"
          >
            {selected.length > 0 ? 'Изменить теги' : 'Выбрать теги'}
            <ChevronDownIcon className="size-4 opacity-60" />
          </button>
        </PopoverTrigger>

        <PopoverContent className="flex flex-col gap-1.5">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти тег"
            className="h-8 rounded-md border border-input bg-transparent px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />

          {tags.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              Тегов пока нет — заведи их кнопкой «Теги» над списком.
            </p>
          ) : shown.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">Ничего не нашлось</p>
          ) : (
            <div role="listbox" aria-multiselectable="true" className="flex max-h-56 flex-col overflow-y-auto">
              {shown.map((t) => {
                const on = value.includes(t.id)
                return (
                  <div
                    key={t.id}
                    role="option"
                    aria-selected={on}
                    tabIndex={0}
                    onClick={() => toggle(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggle(t.id)
                      }
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-4 place-items-center rounded border',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {on && <CheckIcon className="size-3" strokeWidth={3} />}
                    </span>
                    {t.name}
                  </div>
                )
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

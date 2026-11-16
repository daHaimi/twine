import { useEffect, useId, useRef, useState } from 'react'

import { colourToCss, readableTextColour } from '@/domain/gtt/colour'
import type { Palette } from '@/domain/model/pattern'

import styles from './PaletteSelect.module.css'

export interface PaletteSelectProps {
  palette: Palette
  /** Currently assigned palette index (1–16), or undefined for unset. */
  value: number | undefined
  onChange: (index: number | undefined) => void
  /** Accessible name for the trigger button, e.g. "Card 1 hole A colour". */
  label: string
}

/**
 * Palette picker for a single hole in the Cards configuration.
 *
 * Unlike the old click-to-cycle interaction, this shows the whole palette at
 * once as colour swatches so the user chooses explicitly. The trigger field
 * itself is filled with the selected colour. Palette slots that are unset
 * cannot be assigned and are shown disabled.
 */
export function PaletteSelect({ palette, value, onChange, label }: PaletteSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const packed = value === undefined ? undefined : palette.colours[value]
  const css = packed === undefined ? undefined : colourToCss(packed)
  const triggerStyle = packed === undefined
    ? undefined
    : { backgroundColor: colourToCss(packed), color: readableTextColour(packed) }

  const choose = (index: number | undefined) => {
    onChange(index)
    setOpen(false)
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${css === undefined ? styles.unset : ''}`}
        style={triggerStyle}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={value === undefined ? 'Unset' : `Palette ${value} (${css})`}
      >
        {value ?? '–'}
      </button>

      {open && (
        <div className={styles.popover} id={listId} role="listbox" aria-label={`${label} palette`}>
          <button
            type="button"
            role="option"
            aria-selected={value === undefined}
            className={`${styles.option} ${styles.unset}`}
            onClick={() => choose(undefined)}
          >
            Unset
          </button>
          <div className={styles.swatches}>
            {palette.colours.slice(1).map((optionPacked, i) => {
              const index = i + 1
              const available = optionPacked !== undefined
              const optionCss = available ? colourToCss(optionPacked) : undefined
              const optionStyle = optionPacked === undefined
                ? undefined
                : { backgroundColor: colourToCss(optionPacked), color: readableTextColour(optionPacked) }
              return (
                <button
                  key={index}
                  type="button"
                  role="option"
                  aria-selected={value === index}
                  aria-label={`Select palette colour ${index}`}
                  title={optionCss ? `Palette ${index} (${optionCss})` : `Palette ${index} (unset)`}
                  disabled={!available}
                  className={`${styles.option} ${optionCss === undefined ? styles.unset : ''}`}
                  style={optionStyle}
                  onClick={() => choose(index)}
                >
                  {index}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

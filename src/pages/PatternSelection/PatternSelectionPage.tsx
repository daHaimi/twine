import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { downloadPattern, GttFileReadError, readGttFile } from '@/domain/gtt/io'
import type { Pattern } from '@/domain/model/pattern'
import { usePatternListStore } from '@/state/patternListStore'

import styles from './PatternSelectionPage.module.css'

/**
 * "Pattern selection" state (see PROJECT-PROMPT.md "Frontend" / "Pattern
 * selection"): shown when no current file is selected. Lists all locally
 * stored patterns with edit/delete/rename/clone/draft actions, and supports
 * creating new patterns or uploading GTT files via file picker or
 * drag & drop.
 */
export function PatternSelectionPage() {
  const navigate = useNavigate()
  const { patterns, loading, error, refresh, createNew, clone, rename, remove, save } = usePatternListStore()

  const [isDragOver, setIsDragOver] = useState(false)
  const [renamingId, setRenamingId] = useState<string | undefined>(undefined)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Pattern | undefined>(undefined)
  const [newPatternName, setNewPatternName] = useState('')
  const [uploadError, setUploadError] = useState<string | undefined>(undefined)
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploadError(undefined)
      for (const file of Array.from(files)) {
        try {
          const id = crypto.randomUUID()
          const pattern = await readGttFile(file, id)
          await save(pattern)
        } catch (err) {
          const message =
            err instanceof GttFileReadError || err instanceof Error ? err.message : `Failed to import "${file.name}".`
          setUploadError(message)
        }
      }
    },
    [save],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOver(false)
      if (event.dataTransfer.files.length > 0) {
        void importFiles(event.dataTransfer.files)
      }
    },
    [importFiles],
  )

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        void importFiles(event.target.files)
      }
      event.target.value = ''
    },
    [importFiles],
  )

  const handleCreateNew = useCallback(async () => {
    const name = newPatternName.trim() || 'Untitled Pattern'
    const created = await createNew(name)
    setNewPatternName('')
    navigate(`/pattern/${created.id}`)
  }, [createNew, navigate, newPatternName])

  const startRename = useCallback((pattern: Pattern) => {
    setRenamingId(pattern.id)
    setRenameValue(pattern.name)
  }, [])

  const commitRename = useCallback(async () => {
    if (renamingId && renameValue.trim()) {
      await rename(renamingId, renameValue.trim())
    }
    setRenamingId(undefined)
  }, [rename, renamingId, renameValue])

  const confirmDelete = useCallback(async () => {
    if (deleteTarget) {
      await remove(deleteTarget.id)
    }
    setDeleteTarget(undefined)
  }, [deleteTarget, remove])

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>TWINE</h1>
        <p className={styles.subtitle}>Tablet Weaving INteractive Editor</p>
      </header>

      <section
        className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        data-testid="dropzone"
      >
        <p>Drag &amp; drop a .gtt file here, or</p>
        <label htmlFor={fileInputId} className={styles.fileLabel}>
          Choose file
        </label>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept=".gtt,application/xml,text/xml"
          multiple
          onChange={handleFileInputChange}
          className={styles.fileInput}
        />
        {uploadError && <p className={styles.errorText}>{uploadError}</p>}
      </section>

      <section className={styles.createNew}>
        <input
          type="text"
          placeholder="New pattern name"
          value={newPatternName}
          onChange={(e) => setNewPatternName(e.target.value)}
          className={styles.textInput}
          aria-label="New pattern name"
        />
        <button type="button" onClick={() => void handleCreateNew()} className={styles.primaryButton}>
          Create new pattern
        </button>
      </section>

      {error && <p className={styles.errorText}>{error}</p>}
      {loading && <p>Loading…</p>}

      <ul className={styles.list} aria-label="Stored patterns">
        {patterns.map((pattern) => (
          <li key={pattern.id} className={styles.listItem}>
            {renamingId === pattern.id ? (
              <input
                type="text"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRename()
                  if (e.key === 'Escape') setRenamingId(undefined)
                }}
                className={styles.textInput}
                aria-label={`Rename ${pattern.name}`}
              />
            ) : (
              <span className={styles.patternName}>{pattern.name}</span>
            )}

            <div className={styles.actions}>
              <button type="button" onClick={() => navigate(`/pattern/${pattern.id}`)}>
                Edit
              </button>
              <button type="button" onClick={() => navigate(`/draft/${pattern.id}`)}>
                Weaving draft
              </button>
              <button type="button" onClick={() => startRename(pattern)}>
                Rename
              </button>
              <button type="button" onClick={() => void clone(pattern.id)}>
                Clone
              </button>
              <button type="button" onClick={() => downloadPattern(pattern)}>
                Download
              </button>
              <button type="button" className={styles.dangerButton} onClick={() => setDeleteTarget(pattern)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {patterns.length === 0 && !loading && <li className={styles.empty}>No patterns yet. Create or upload one above.</li>}
      </ul>

      {deleteTarget && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Confirm deletion">
          <div className={styles.modal}>
            <p>
              Delete pattern <strong>{deleteTarget.name}</strong>? This cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setDeleteTarget(undefined)}>
                Cancel
              </button>
              <button type="button" className={styles.dangerButton} onClick={() => void confirmDelete()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

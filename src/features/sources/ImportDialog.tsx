import { useState } from 'react'
import { pickImporter } from '../../import/registry'
import { commitImport, previewImport, type ImportPreview } from '../../import/merge'
import type { ImportResult } from '../../import/SourceImporter'

interface Staged {
  fileName: string
  text: string
  buffer: ArrayBuffer
  kind: string
  label: string
  result: ImportResult
  preview: ImportPreview
  error?: string
}

async function readFile(file: File): Promise<{ text: string; buffer: ArrayBuffer }> {
  const buf = await file.arrayBuffer()
  // Decode as UTF-8 and strip BOM.
  const text = new TextDecoder('utf-8').decode(buf)
  return { text: text.replace(/^﻿/, ''), buffer: buf }
}

export default function ImportDialog({ onClose }: { onClose: () => void }) {
  const [staged, setStaged] = useState<Staged[]>([])
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    const next: Staged[] = []
    for (const file of list) {
      const { text, buffer } = await readFile(file)
      const importer = pickImporter(file.name, text)
      if (!importer) {
        next.push({
          fileName: file.name,
          text,
          buffer,
          kind: '',
          label: '',
          result: { events: [], teamNames: [], peopleNames: [] },
          preview: {} as ImportPreview,
          error: 'Kein passender Import-Typ für diese Datei gefunden.',
        })
        continue
      }
      const result = await importer.parse(text, buffer)
      const preview = await previewImport(result, importer.kind, file.name)
      next.push({
        fileName: file.name,
        text,
        buffer,
        kind: importer.kind,
        label: file.name,
        result,
        preview,
      })
    }
    setStaged((prev) => [...prev.filter((s) => !next.some((n) => n.fileName === s.fileName)), ...next])
  }

  async function commitAll() {
    setBusy(true)
    try {
      for (const s of staged) {
        if (s.error) continue
        await commitImport(s.result, s.kind, s.label, s.fileName)
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const importable = staged.filter((s) => !s.error)

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Importieren</h2>
        <p className="muted">XLS- oder XLSX-Dateien auswählen oder hierher ziehen.</p>

        <div
          className={'dropzone' + (over ? ' over' : '')}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
          }}
        >
          <p>Dateien hierher ziehen</p>
          <label className="btn">
            Dateien wählen
            <input
              type="file"
              multiple
              accept=".xls,.xlsx,.html,.htm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </label>
        </div>

        {staged.map((s) => (
          <div className="preview-box" key={s.fileName}>
            <strong>{s.fileName}</strong>
            {s.error ? (
              <p className="muted" style={{ color: 'var(--danger)' }}>{s.error}</p>
            ) : (
              <>
                <p className="muted" style={{ margin: '4px 0 10px' }}>
                  {s.preview.reusingSource
                    ? 'Aktualisiert bestehende Quelle (Merge).'
                    : 'Neue Quelle.'}
                </p>
                <div className="row wrap">
                  <span className="kpi"><b>{s.preview.total}</b><span>Events</span></span>
                  <span className="kpi"><b>{s.preview.newEvents}</b><span>neu</span></span>
                  <span className="kpi"><b>{s.preview.updatedEvents}</b><span>aktualisiert</span></span>
                  <span className="kpi"><b>{s.preview.cancelledEvents}</b><span>entfällt</span></span>
                  <span className="kpi"><b>{s.preview.newPeople.length}</b><span>neue Personen</span></span>
                  <span className="kpi"><b>{s.preview.newTeams.length}</b><span>neue Teams</span></span>
                </div>
                {s.preview.newTeams.length > 0 && (
                  <p className="muted" style={{ marginTop: 8 }}>
                    Neue Teams: {s.preview.newTeams.join(', ')}
                  </p>
                )}
              </>
            )}
          </div>
        ))}

        <div className="row" style={{ marginTop: 18 }}>
          <button
            className="btn primary"
            disabled={busy || importable.length === 0}
            onClick={commitAll}
          >
            {busy ? 'Importiere…' : `Importieren (${importable.length})`}
          </button>
          <button className="btn" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}

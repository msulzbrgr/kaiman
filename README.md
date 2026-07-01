# MIH Spielplan / Trainingsplan

Lokale Web-App (Browser-only, kein Server) für den Trainings- und Spielplan eines
Eishockey-Clubs. Die Daten werden aus den `.xls`-Exporten (HTML-Tabellen) importiert und
liegen vollständig lokal im Browser (IndexedDB).

## Starten

```bash
cd mih
npm install            # einmalig
npm run dev            # → http://localhost:5173
```

Statisches Build (kann von jedem statischen Server / lokal geöffnet werden):

```bash
npm run build          # erzeugt dist/
npm run preview
```

## Funktionen

- **Quellen / Import** (`Quellen`-Tab): `.xls`-Dateien per Drag & Drop importieren. Vor dem
  Import zeigt eine Vorschau, wie viele Events neu / aktualisiert / entfallen sind und wie
  viele neue Personen/Teams entstehen. Beim erneuten Import einer **gleichnamigen** Datei
  werden Events anhand von `Datum + Team + Start (+ Ort/Bemerkung)` zusammengeführt (Merge);
  manuell hinzugefügte Personen, Rollen und Spieler bleiben erhalten. Events, die in der
  neuen Datei fehlen, werden als „entfällt" markiert (nicht gelöscht).
- **Spielplan** (`Spielplan`-Tab): Kalender mit Ansichten Tag / Arbeitswoche / Woche /
  2 Wochen / Monat / Agenda. Filter nach **Teams** und/oder **Personen** (ODER- bzw.
  UND-Verknüpfung). Klick auf ein Event öffnet die Detail-/Bearbeitungsansicht.
- **Inline-Bearbeitung** je Event: Typ, Team, Zeiten, Ort, Gegner, Bemerkungen direkt
  editierbar. **Beteiligte** sind nach Rolle gruppiert (Coach / Assistant Coach /
  Off-Ice Coach / Spieler / Helfer); Personen lassen sich per Typeahead aus dem Team-Kader
  hinzufügen, in der Rolle ändern oder entfernen. Alles wird sofort gespeichert.
- **Teams** (`Teams`-Tab): anlegen, umbenennen, Farbe, **zusammenführen** und **Kader**
  verwalten (Spieler/Staff je Team mit Standard-Rolle).
- **Personen** (`Personen`-Tab): global verwalten, zusammenführen (Duplikate), Übersicht
  über Teams und Einsätze.
- **Einstellungen** (`Einstellungen`-Tab): **Rollen** konfigurieren (hinzufügen, umbenennen,
  Reihenfolge, löschen — Standardrollen sind geschützt) und **JSON-Sicherung** exportieren/
  importieren (Backup / Umzug auf anderen Rechner).

## Architektur

- **Stack:** React + Vite + TypeScript, Dexie.js (IndexedDB), FullCalendar, date-fns.
- **Pluggable Quellen:** `src/import/SourceImporter.ts` definiert die Schnittstelle,
  `registry.ts` registriert Importer. Aktuell implementiert: `xlsHtmlImporter.ts`
  (HTML-Tabelle). Weitere Formate (CSV/ICS/API) lassen sich als weitere Importer ergänzen.
- **Merge-Logik:** `src/import/merge.ts` (`previewImport` / `commitImport`).
- **Datenmodell:** `src/db/types.ts`, Schema in `src/db/db.ts`, Helfer in `src/db/repo.ts`.

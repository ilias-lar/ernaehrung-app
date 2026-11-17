# Ernährungs-App

Eigenes Ernährungs-Dashboard für zwei Personen – mit Logins, Web-Dashboard (Admin am PC) und iPhone-App mit Widgets und Dynamic Island.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `server/` | Backend (Node ≥ 20, keine Abhängigkeiten): Konten, Sitzungen, Daten-API |
| `shared/` | Rechenlogik + Lebensmittel/Rezepte (wird von Server **und** Web genutzt) |
| `web/` | Web-Dashboard (Admin sieht beide Personen, sonst nur sich selbst) |
| `ios/` | iPhone-App (SwiftUI), Widgets, Live-Aktivität. Xcode-Projekt entsteht per XcodeGen aus `ios/project.yml` |

## Konten

- **Erstes Konto** (über `/login.html`) wird automatisch **Admin** = Ilias.
- Freundin bekommt einen **Einladungscode** (Web → Einstellungen → Konten → „Einladen“) und registriert sich in der App damit.
- Passwörter werden nur als scrypt-Hash gespeichert. Sitzungen laufen 1 Jahr.
- Im Handy gibt es **keinen** Personen-Umschalter. Den hat nur der Admin im Web-Dashboard.

## Lokal starten

```bash
npm start          # http://localhost:8080
npm test           # Server-Tests
```

Daten liegen in `data/db.json` (bzw. `DATA_DIR`).

## Deployment (Railway)

- Start: `npm start`, Port kommt aus `PORT`.
- Volume einhängen und `DATA_DIR=/data` setzen, sonst sind Daten nach einem Deploy weg.
- Optional `TZ_LOCAL` (Standard `Europe/Prague`).

## iPhone-App bauen

GitHub Actions baut bei jedem Push nach `ios/` die App für den Simulator (prüft, ob alles kompiliert).
Für TestFlight braucht es später den Apple-Developer-Account (99 $/Jahr) – dann kommt ein zweiter Workflow mit Signatur dazu.

## Sicherheit

- Keine Passwörter, Tokens oder Ernährungsdaten im Repo – die liegen nur auf dem Server (Railway-Volume).
- Einrichtung (`/api/setup`) geht nur, solange es noch kein Konto gibt.
- Login & Registrierung: max. 10 Versuche je IP und 200 insgesamt pro 15 Minuten, Passwörter als scrypt-Hash, gleiche Antwortzeit bei unbekannter E-Mail.
- Freundin-Konto sieht nur eigene Einträge und kann den Plan nicht ändern; Admin-Endpunkte sind serverseitig geschützt.

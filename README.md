# MacMen

Ein Pacman-Klon im Neon-Retro-Look mit den Charakteren **Marc, Emil, Simon, Leo, Frank, Milo und Bela**.

Reines Vanilla-JS, keine Build-Tools, läuft direkt im Browser.

## Spielen

Einfach `index.html` im Browser öffnen.

## Features

- 7 wählbare Charaktere — der gewählte ist der Spieler, vier zufällige der übrigen werden zu Geistern
- Eigene KI-Persönlichkeit pro Geist (chaser, ambusher, patrol, flanker, scared, mirror, random)
- Power-Pellets, Geister-Verfolgung, mehrere Level mit steigender Schwierigkeit
- WebAudio-generierte Sounds (chomp, power, ghost-eaten, death, sirene, etc.) — keine externen Audio-Dateien
- Highscore-Tabelle (Top 10) via `localStorage`
- Steuerung: Pfeiltasten / WASD / Touch-Buttons / Wisch-Gesten
- Responsives Design für Desktop und Mobile

## GitHub Pages Deployment

1. Repository auf GitHub pushen
2. **Settings → Pages**
3. Source: `Deploy from a branch` → Branch: `main` → Folder: `/ (root)`
4. Speichern — die Seite ist nach kurzer Wartezeit unter `https://<user>.github.io/macmen/` erreichbar.

## Struktur

```
macmen/
├── index.html
├── css/style.css
├── js/
│   ├── maze.js        Maze-Layout (20×22 Tiles)
│   ├── sounds.js      WebAudio Sound-Engine
│   ├── highscore.js   localStorage-Highscores
│   └── game.js        Game-Engine (Loop, Entitäten, Rendering, Input)
└── README.md
```

## Steuerung

| Aktion | Tasten |
|---|---|
| Bewegen | Pfeiltasten oder W/A/S/D |
| Pause | P |
| Mute | 🔊-Button oben rechts |
| Mobile | Wischen oder Touchpad unten |

# Valheim Seed-Karte

Zeigt die komplette Valheim-Welt zu einem Seed – ohne Nebel des Krieges – und blendet Orte (POIs) ein.
Die Karte wird direkt im Browser aus dem Seed berechnet (Portierung des Weltgenerators von Valheim 1.0.x).

## Starten

```
python -m http.server 8137
```

Dann <http://localhost:8137> öffnen. (Ein lokaler Webserver ist nötig, weil die Seite ES-Module und Web Worker nutzt;
ein Doppelklick auf `index.html` funktioniert nicht.)

## Bedienung

- **Seed eingeben** → „Laden“: Karte für einen beliebigen Seed.
- **BjoernoutV1**: mitgelieferte Welt inklusive aller 12.345 Orte.
- **Spielstand importieren…**: `*.fwl2` (Seed) und `*.db2` (Orte) einer Welt auswählen. Die Dateien liegen unter
  `%USERPROFILE%\AppData\LocalLow\IronGate\Valheim\worlds_local\<Welt>\` bzw. bei Steam-Cloud-Welten unter
  `<Steam>\userdata\<ID>\892970\remote\worlds\<Welt>\`. Die Dateien bleiben im Browser, es wird nichts hochgeladen.
- Ziehen verschiebt, Mausrad zoomt (bis 0,5 m pro Pixel). Unten stehen Koordinaten, Biom und Höhe unter dem Mauszeiger.
- Klick auf einen Typnamen in der Liste springt zum nächstgelegenen Ort dieses Typs, erneuter Klick zum übernächsten.
- Die Adresse (`#seed=…&x=…&z=…&s=…`) lässt sich als Lesezeichen/Link weitergeben.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `js/worldgen.js` | Weltgenerator (Biome, Höhen, Flüsse, Wald-/Nebel-/Lava-Masken) |
| `js/worker.js` | rendert Kartenkacheln in Web Workern |
| `js/app.js` | Kartenansicht, POI-Ebene, Seitenleiste |
| `js/locations.js` | Katalog: Prefab-Name → Kategorie und Bezeichnung |
| `js/save.js` | liest `*.fwl2` / `*.db2` |
| `data/BjoernoutV1.json` | Orte der mitgelieferten Welt |

## Grenzen

Orte gibt es bisher nur für Welten, deren Spielstand importiert wurde. Für einen reinen Seed wird die Karte
berechnet, aber noch keine Orte – dafür müsste zusätzlich die Ortsplatzierung des Spiels nachgebaut werden.

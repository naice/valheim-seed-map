# Valheim Seed-Karte

Zeigt die komplette Valheim-Welt zu einem Seed – ohne Nebel des Krieges – und blendet Orte (POIs) ein.
Karte und Orte werden direkt im Browser aus dem Seed berechnet (Portierung des Weltgenerators und der
Ortsplatzierung von Valheim 1.0.21).

## Starten

```
python -m http.server 8137
```

Dann <http://localhost:8137> öffnen. (Ein lokaler Webserver ist nötig, weil die Seite ES-Module und Web Worker nutzt;
ein Doppelklick auf `index.html` funktioniert nicht.)

## Bedienung

- **Seed eingeben** → „Laden“: Karte und alle Orte für einen beliebigen Seed (die Orte erscheinen nach ca. 10 s).
- **Speichern**: merkt sich den Seed (optional mit Namen) im `localStorage` dieses Browsers; gespeicherte Seeds
  stehen in der Auswahlliste darunter und lassen sich dort mit × wieder entfernen.
- **Beispielwelt**: lädt den Seed `Xldpp3L2LG`.
- Ziehen verschiebt, Mausrad zoomt (bis 0,5 m pro Pixel). Unten stehen Koordinaten, Biom und Höhe unter dem Mauszeiger.
- Klick auf einen Typnamen in der Liste springt zum nächstgelegenen Ort dieses Typs, erneuter Klick zum übernächsten.
- Die Adresse (`#seed=…&x=…&z=…&s=…`) lässt sich als Lesezeichen/Link weitergeben.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `js/worldgen.js` | Weltgenerator (Biome, Höhen, Flüsse, Wald-/Nebel-/Lava-Masken) |
| `js/locgen.js` | Ortsplatzierung: Biom-Sektoren, Alt-Biome, `GenerateLocations` |
| `js/locworker.js` | berechnet die Orte einer Welt im Hintergrund |
| `data/locations-config.json` | Ortsdefinitionen und Alt-Biome aus den Spieldaten (Version 1.0.21) |
| `js/worker.js` | rendert Kartenkacheln in Web Workern |
| `js/app.js` | Kartenansicht, POI-Ebene, Seitenleiste |
| `js/locations.js` | Katalog: Prefab-Name → Kategorie und Bezeichnung |

## Genauigkeit und Grenzen

Die Ortsberechnung wurde gegen einen echten Spielstand (Seed `Xldpp3L2LG`, Version 1.0.21) geprüft: alle 12.345 Orte
(179 Typen) werden aus dem Seed positionsgenau reproduziert.

- Die Orte einer Welt werden vom Spiel beim Erstellen festgelegt. Welten, die mit einer älteren Spielversion erstellt
  wurden, können deshalb abweichen; sie werden derzeit nicht unterstützt.
- Nach einem Spiel-Update, das Orte oder Weltgenerator ändert, muss `data/locations-config.json` neu aus den
  Spieldaten erzeugt werden.

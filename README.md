# Valheim-Map

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
- **Sprache**: Deutsch, Englisch, Französisch, Italienisch, Portugiesisch, Spanisch, Norwegisch, Schwedisch und
  Niederländisch. Beim ersten Aufruf entscheidet die Browsersprache; über den Knopf oben rechts in der Kopfzeile lässt
  sie sich umstellen (wird im `localStorage` gemerkt).
- **Orte-Cache**: Die berechneten Orte eines Seeds landen in der IndexedDB des Browsers (`valheim-map`, die letzten
  12 Welten). Beim erneuten Öffnen desselben Seeds entfällt die Berechnung. Der Schlüssel enthält Spielversion und
  `LOC_REV` aus `js/app.js` – `LOC_REV` erhöhen, wenn sich die Ortsberechnung ohne Versionswechsel ändert.
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
| `lang/<code>.json` | Übersetzungen: Oberfläche, Kategorien, Biome, Ortsnamen (Schlüssel = deutsche Bezeichnung) |
| `tools/build.mjs` | erzeugt alle HTML-Seiten und die `sitemap.xml` (siehe unten) |
| `tools/templates/` | Vorlagen für die Kartenseite und die Ratgeberseiten |
| `tools/content/<code>.json` | Texte je Sprache: Erklärtext und FAQ, Seeds, Bosse, Händler |
| `tools/data/` | Spieldaten: Händlerwaren und Preise, Bosse, Seed-Liste, Namen aus den Spieltexten |
| `css/content.css` | Gestaltung der Textbereiche und Ratgeberseiten |

## Seiten erzeugen

Alle HTML-Seiten sind erzeugte Dateien und werden mit eingecheckt; beim Ausliefern läuft kein Build. Nach Änderungen
an Vorlagen, Texten oder Daten:

```
node tools/build.mjs
```

| Adresse | Inhalt |
| --- | --- |
| `/` | Karte auf Englisch (`x-default`); leitet beim ersten Besuch auf die Browsersprache weiter |
| `/de/`, `/fr/`, `/it/`, `/pt/`, `/es/`, `/no/`, `/sv/`, `/nl/` | Karte je Sprache |
| `faq/` | Erklärtext, „So findest du deinen Seed“ und häufige Fragen |
| `seeds/` | Liste der besten Seeds, jeder Eintrag öffnet die Karte |
| `bosses/`, `bosses/<boss>/` | Übersicht und eine Seite je Boss |
| `traders/`, `traders/<händler>/` | Übersicht und eine Seite je Händler mit Waren und Preisen |

Die Ratgeberseiten gibt es in jeder Sprache (`/de/seeds/` usw.), untereinander per `hreflang` verknüpft. Links auf
die Karte können mit `#seed=…&show=Prefab1,Prefab2` nur bestimmte Ortstypen einblenden.

Die `index.html`-Dateien nicht von Hand ändern, sondern `tools/templates/` bzw. `tools/content/` anpassen.

## Genauigkeit und Grenzen

Die Ortsberechnung wurde gegen einen echten Spielstand (Seed `Xldpp3L2LG`, Version 1.0.21) geprüft: alle 12.345 Orte
(179 Typen) werden aus dem Seed positionsgenau reproduziert.

- Die Orte einer Welt werden vom Spiel beim Erstellen festgelegt. Welten, die mit einer älteren Spielversion erstellt
  wurden, können deshalb abweichen; sie werden derzeit nicht unterstützt.
- Nach einem Spiel-Update, das Orte oder Weltgenerator ändert, muss `data/locations-config.json` neu aus den
  Spieldaten erzeugt werden.

## Veröffentlichung

Bei jedem Push auf `main` baut die Pipeline (`.github/workflows/deploy.yml`) die GitHub-Seite, legt ein Release an und
schiebt den Stand anschließend ins Plesk-Git von valheim-map.de. Die Zugangsdaten dafür stehen lokal in `.env`
(nicht im Repository) und müssen einmalig als Secrets hinterlegt werden:

```
gh secret set -f .env
```

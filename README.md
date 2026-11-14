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
| `tools/data/` | Spieldaten: Händlerwaren und Preise, Bosse, Seed-Liste, Namen aus den Spieltexten, Gegenstände (`items.json`, `item-names.json`) |
| `tools/extract/` | Python-Skripte, die die Gegenstandsdaten und -Icons aus den Spieldateien lesen (siehe unten) |
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
| `items/`, `items/<kategorie>/` | Gegenstandsliste: Suche über alle Gegenstände (nach Name oder Quelle, z. B. „Birke“, „Troll“) und eine Seite je Kategorie (Materialien, Nahrung, Waffen, Rüstungen, Trophäen, Sonstiges); jeder Gegenstand ist ein Abschnitt mit Anker (`items/materials/#Wood`) und nennt Herkunft (Biom, Objekt, Werkzeug, Kreatur, Ort, Rezept, Händler) und Verwendung. `js/items.js` öffnet auf der Übersicht einen Gegenstand per Klick als Dialog (`items/#Wood`) und verwaltet „Meine Listen“: Sammellisten zum Abhaken mit Mengen, gespeichert im Browser (`localStorage`); „Liste aus Rezept“ legt aus den Zutaten eines Rezepts (`data-recipe` an der Rezeptzeile) direkt eine Liste an. Texte dazu: `items.lists` in `tools/content/<sprache>.json` |

Die Ratgeberseiten gibt es in jeder Sprache (`/de/seeds/` usw.), untereinander per `hreflang` verknüpft. Links auf
die Karte können mit `#seed=…&show=Prefab1,Prefab2` nur bestimmte Ortstypen einblenden.

Die `index.html`-Dateien nicht von Hand ändern, sondern `tools/templates/` bzw. `tools/content/` anpassen.

## Gegenstandsdaten aus dem Spiel lesen

`tools/data/items.json` (Gegenstände mit Herkunft und Verwendung), `tools/data/item-names.json` (Spieltexte dazu) und
die Icons in `poi-icons/items/` stammen direkt aus den Asset-Bundles des Spiels. Nach einem Spiel-Update lassen sie
sich mit Python (Pakete `UnityPy` und `Pillow`) neu erzeugen:

```
set VALHEIM_BUNDLES=E:\Steam\steamapps\common\Valheim\valheim_Data\StreamingAssets\SoftRef\Bundles
set VALHEIM_WORK=C:\Temp\valheim-extract        (Zwischenergebnisse, außerhalb des Repos)
python tools/extract/dumpall.py                 alle spielrelevanten Komponenten als Rohdaten ablegen (dauert einige Minuten)
python tools/extract/hover.py                   Anzeigenamen von Welt-Objekten
python tools/extract/export.py                  Gegenstände mit Quellen und Verwendung verknüpfen → items_raw.json
python tools/extract/compact.py <localization.json>   auf das kürzen, was die Website zeigt → tools/data/
python tools/extract/icons.py                   fehlende Icons nach poi-icons/items/ schreiben
node tools/build.mjs
```

`localization.json` ist die Sprachtabelle des Spiels als JSON (`Token → { en, de, fr, … }`); sie muss vorher aus den
Lokalisierungsdateien des Spiels erzeugt werden – dafür liegt noch kein Skript im Repo. Nach einem Update außerdem
`rm <VALHEIM_WORK>/all.pkl` (Cache der Rohdaten).

Ausgewertet werden u. a. Bäume, Erzvorkommen und aufsammelbare Objekte der Weltgenerierung (mit Biom, Werkzeugart und
Mindeststufe), Truhen und Objekte in Orten und Dungeons, Beute der Kreaturen, Rezepte, Schmelzöfen/Kochstellen/Gärbottiche,
Pflanzen, Händlerwaren und Fische (auch in Höhlenseen), außerdem Sonderfälle wie Harzextraktor (nur auf Yggdrasil-Wurzeln),
Irrlichter-Brunnen, per Spawner gesetzte Objekte (Verkohlte Balliste), Opferschalen, die Gruppen rufen, und spätere
Bossphasen (`<Boss>_p2`, `_p3`). Angezeigt werden nur Gegenstände mit Namen und Icon, die eine Quelle haben oder für
einen angezeigten Gegenstand gebraucht werden.

Zur Kontrolle nach einem Update: `compact.py` nennt am Ende unter `no src` alle angezeigten Gegenstände ohne Quelle
(Stand 1.0.21: keine). `python tools/extract/audit.py` listet Komponententypen des Haupt-Bundles, die auf Gegenstände
verweisen, aber von `dumpall.py` noch nicht erfasst werden – so fallen neue Spielmechaniken auf; sie werden in
`RULES` (`dumpall.py`) ergänzt und in `export.py` verknüpft.

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

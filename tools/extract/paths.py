"""Pfade für die Auswertung der Spieldateien (per Umgebungsvariable anpassbar)."""
import os

# Ordner mit den Asset-Bundles des Spiels
BUNDLES = os.environ.get("VALHEIM_BUNDLES", "E:/Steam/steamapps/common/Valheim/valheim_Data/StreamingAssets/SoftRef/Bundles")
# Arbeitsordner für Zwischenergebnisse (Rohdaten, Cache) – liegt außerhalb des Repos
WORK = os.environ.get("VALHEIM_WORK") or os.path.join(os.path.expanduser("~"), "valheim-extract")
# Wurzel des Repos
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")).replace("\\", "/")

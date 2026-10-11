# Homelab Status Card

Eine Lovelace-Karte für Home Assistant, die deine Container und VMs als Kacheln zeigt: Läuft der Container, und ist die zugehörige Domain erreichbar?

**Ab v2 kommen die Daten aus der Integration [Proxmox Homelab Monitor](https://github.com/FluxLP/proxmox-homelab-monitor).** Sie prüft die Domains serverseitig rund um die Uhr und liefert pro Container/VM eine Dienst-Entität (`binary_sensor.<gast>_service`). Die Karte selbst prüft nichts mehr; der `shell_command` aus v1 wird nicht mehr gebraucht.

- **Großer Punkt:** Container läuft (grün) / aus (rot) / nicht verfügbar (grau)
- **Kleiner Punkt mit Weltkugel:** Domain erreichbar (grün) / nicht erreichbar (rot); ein Klick öffnet die Domain. Nur bei Diensten mit Domain.
- **Zweite Zeile:** „In Betrieb“, „Offline“ oder z. B. „Domain nicht erreichbar (HTTP 502)“ / „(Zeitüberschreitung)“
- **Klick auf die Kachel:** More-Info-Dialog der Dienst-Entität
- **Visueller Editor:** Dienste anhaken, Anzeigename und Icon, Reihenfolge, Suche, Node-Filter, Größe (normal/klein/sehr klein)

Die platzsparende Variante mit Banner ist [Homelab Status Compact](https://github.com/FluxLP/homelab-status-compact).

## Installation

1. Integration [Proxmox Homelab Monitor](https://github.com/FluxLP/proxmox-homelab-monitor) einrichten und unter *Konfigurieren → Domains der Dienste* die Domains eintragen
2. HACS → ⋮ → *Benutzerdefinierte Repositories* → URL dieses Repositorys, Typ **Dashboard** → „Homelab Status Card“ installieren
3. Browser bzw. App neu laden

## Konfiguration

```yaml
type: custom:homelab-status-card
title: Homelab
columns: 2
size: small
services:
  - entity: binary_sensor.lxc_jellyfin_100_service
    name: Jellyfin
  - entity: binary_sensor.qemu_win10_1000_service
    name: Windows-VM
    icon: mdi:microsoft-windows
```

| Option | Standard | Beschreibung |
|---|---|---|
| `services` | – | Liste der Dienste (Pflicht) |
| `title` | – | Überschrift über der Karte |
| `columns` | `2` | Spalten (1–6) |
| `size` | `normal` | `normal`, `small` oder `tiny`. In den kleinen Stufen werden lange Namen umgebrochen statt abgeschnitten |

Pro Dienst: `entity` (Pflicht), `name`, `icon`.

## Umstieg von v1

v1-Konfigurationen laufen weiter: Steht dort `binary_sensor.lxc_jellyfin_100_status`, nimmt die Karte automatisch `binary_sensor.lxc_jellyfin_100_service`. `domain_check`, `domain`, `interval` und `base_domain` werden ignoriert und beim nächsten Speichern im Editor entfernt. Den `shell_command: homelab_status_check` in der `configuration.yaml` kannst du löschen.

## Lizenz

MIT

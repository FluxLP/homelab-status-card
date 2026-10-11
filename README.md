# Homelab Status Card

Eine Lovelace-Karte für Home Assistant, die den Status deiner Container/VMs anzeigt (z. B. aus der Proxmox-VE-Integration). Optional prüft sie auch, ob die zugehörige Domain erreichbar ist.

- **Großer Punkt:** Container läuft (grün) / aus (rot) / nicht verfügbar (grau)
- **Kleiner Punkt mit Weltkugel:** Domain erreichbar (grün) / nicht erreichbar (rot). Ein Klick darauf öffnet die Domain.
- **Klick auf die Kachel:** öffnet den More-Info-Dialog der Entität
- **Visueller Editor:** Dienste anklicken, pro Dienst „Domain überwachen“ aktivieren und Domain eintragen

## Installation

### HACS (benutzerdefiniertes Repository)
1. HACS → ⋮ → *Benutzerdefinierte Repositories*
2. URL dieses Repositorys eintragen, Typ **Dashboard**
3. „Homelab Status Card“ installieren und den Browser neu laden

### Manuell
1. `homelab-status-card.js` nach `/config/www/` kopieren
2. *Einstellungen → Dashboards → ⋮ → Ressourcen* → `/local/homelab-status-card.js` als **JavaScript-Modul** hinzufügen

## Serverseitige Domain-Prüfung (empfohlen)

Füge diesen Eintrag in die `configuration.yaml` ein und starte Home Assistant neu:

```yaml
shell_command:
  homelab_status_check: >-
    sh -c 'curl -s -o /dev/null -w "%{http_code}" --max-time 10 --url "$0" || true' {{ url }}
```

Damit ruft Home Assistant die Domain selbst auf und wertet den HTTP-Statuscode aus:

| Ergebnis | Anzeige |
|---|---|
| HTTP 1xx–4xx | erreichbar (auch 401/403, z. B. bei Login-Seiten) |
| HTTP 5xx (z. B. 502 vom Reverse Proxy) | nicht erreichbar |
| Timeout, DNS- oder Zertifikatsfehler | nicht erreichbar |

**Ohne diesen Eintrag** prüft der Browser des Betrachters die Domain. Das funktioniert auch, sieht aber nur „erreichbar ja/nein“. Ein 502 vom Reverse Proxy gilt dann als erreichbar.

> Geprüft wird jeweils aus deinem Netz. Löst ein lokaler DNS (z. B. Pi-hole) die Domains intern auf, wird der interne Weg getestet und nicht der Zugriff von außen.

## Konfiguration

```yaml
type: custom:homelab-status-card
title: Homelab
columns: 2
interval: 60
base_domain: example.org
services:
  - entity: binary_sensor.lxc_audiobookshelf_101_status
    name: Audiobookshelf
    domain_check: true
    domain: audiobookshelf.example.org
  - entity: binary_sensor.qemu_win10_1000_status
    name: Windows-VM
```

| Option | Standard | Beschreibung |
|---|---|---|
| `title` | – | Überschrift über der Karte |
| `columns` | `2` | Anzahl Spalten (1–6) |
| `interval` | `60` | Prüfintervall der Domains in Sekunden (min. 15) |
| `base_domain` | – | Nur für den Editor: Domain-Vorschlag `<dienst>.<base_domain>` |
| `services[].entity` | – | **Pflicht.** Binärsensor (`on` = läuft) |
| `services[].name` | Friendly Name | Anzeigename |
| `services[].icon` | `mdi:circle` | Icon |
| `services[].domain_check` | `false` | Domain überwachen |
| `services[].domain` | – | Domain oder vollständige URL (ohne Schema wird `https://` verwendet) |

Die Domains werden nur geprüft, solange das Dashboard geöffnet ist.

## Lizenz
MIT

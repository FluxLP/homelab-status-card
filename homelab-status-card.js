/*
 * Homelab Status Card
 * Zeigt den Status von Containern/VMs (z. B. aus der Proxmox-VE-Integration)
 * und optional die Erreichbarkeit der zugehörigen Domain.
 */
const VERSION = "1.1.0";
const CHECK_SERVICE = "homelab_status_check";

const I18N = {
  de: {
    running: "In Betrieb",
    offline: "Offline",
    unavailable: "Nicht verfügbar",
    domain_down: "Domain nicht erreichbar",
    domain_ok: "Domain erreichbar",
    domain_unknown: "Domain wird geprüft…",
    general: "Allgemein",
    title: "Titel (optional)",
    columns: "Spalten",
    interval: "Prüfintervall (Sekunden)",
    base_domain: "Basis-Domain (z. B. example.org)",
    services: "Dienste",
    show_all: "Alle Binärsensoren anzeigen (nicht nur *_status)",
    name: "Anzeigename",
    icon: "Icon",
    domain_check: "Domain überwachen",
    domain: "Domain oder URL",
    no_entities: "Keine passenden Entitäten gefunden.",
    search: "Dienste durchsuchen …",
    search_count: "{shown} von {total}",
    search_none: "Keine Treffer für diese Suche.",
    up: "Nach oben",
    down: "Nach unten",
    browser_mode:
      "Hinweis: Der Dienst shell_command.homelab_status_check fehlt. Die Domain wird daher vom Browser geprüft (nur „erreichbar ja/nein“, keine HTTP-Fehler wie 502). Für die serverseitige Prüfung siehe README.",
  },
  en: {
    running: "Running",
    offline: "Offline",
    unavailable: "Unavailable",
    domain_down: "Domain unreachable",
    domain_ok: "Domain reachable",
    domain_unknown: "Checking domain…",
    general: "General",
    title: "Title (optional)",
    columns: "Columns",
    interval: "Check interval (seconds)",
    base_domain: "Base domain (e.g. example.org)",
    services: "Services",
    show_all: "Show all binary sensors (not only *_status)",
    name: "Display name",
    icon: "Icon",
    domain_check: "Monitor domain",
    domain: "Domain or URL",
    no_entities: "No matching entities found.",
    search: "Search services …",
    search_count: "{shown} of {total}",
    search_none: "No services match this search.",
    up: "Move up",
    down: "Move down",
    browser_mode:
      "Note: the service shell_command.homelab_status_check is missing, so the domain is checked by the browser (reachable yes/no only, no HTTP errors like 502). See the README for server-side checks.",
  },
};

const t = (hass, key) => {
  const lang = String(hass?.language || "en").split("-")[0];
  return (I18N[lang] || I18N.en)[key] ?? I18N.en[key] ?? key;
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const normalizeUrl = (d) => {
  d = String(d || "").trim();
  if (!d) return "";
  return /^https?:\/\//i.test(d) ? d : `https://${d}`;
};

const COLORS = {
  ok: "76, 175, 80",
  down: "244, 67, 54",
  warn: "255, 152, 0",
  unknown: "158, 158, 158",
};

// ---------------------------------------------------------------------------
// Domain-Prüfung (geteilt zwischen allen Karten-Instanzen)
// ---------------------------------------------------------------------------
const checks = new Map(); // url -> { ok: true|false|null, code, ts, method, promise }

const hasServerCheck = (hass) => !!hass?.services?.shell_command?.[CHECK_SERVICE];

async function runCheck(hass, url) {
  if (hasServerCheck(hass)) {
    try {
      const res = await hass.callWS({
        type: "call_service",
        domain: "shell_command",
        service: CHECK_SERVICE,
        service_data: { url },
        return_response: true,
      });
      const code = parseInt(String(res?.response?.stdout ?? "").trim(), 10) || 0;
      return { ok: code > 0 && code < 500, code, method: "server" };
    } catch (err) {
      console.warn("homelab-status-card: Prüfung fehlgeschlagen", url, err);
      return { ok: null, code: null, method: "server" };
    }
  }
  // Fallback: Prüfung aus dem Browser. Wegen CORS ist nur „erreichbar ja/nein“ sichtbar.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    return { ok: true, code: null, method: "browser" };
  } catch (_err) {
    return { ok: false, code: 0, method: "browser" };
  } finally {
    clearTimeout(timer);
  }
}

function requestCheck(hass, url, maxAgeMs) {
  const entry = checks.get(url) || { ok: undefined, ts: 0, promise: null };
  if (entry.promise || Date.now() - entry.ts < maxAgeMs) return entry;
  entry.promise = runCheck(hass, url).then((res) => {
    Object.assign(entry, res, { ts: Date.now(), promise: null });
    return entry;
  });
  checks.set(url, entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Karte
// ---------------------------------------------------------------------------
const CARD_STYLE = `
  :host { display: block; }
  .header {
    font-size: var(--ha-card-header-font-size, 24px);
    color: var(--ha-card-header-color, var(--primary-text-color));
    padding: 4px 4px 12px;
  }
  .grid { display: grid; gap: var(--grid-card-gap, 8px); }
  ha-card.tile {
    display: flex; align-items: center; gap: 12px;
    padding: 12px; box-sizing: border-box; height: 100%;
    cursor: pointer;
  }
  .shape {
    position: relative; flex: none;
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(var(--c), 0.2);
  }
  .shape > ha-icon { --mdc-icon-size: 20px; color: rgb(var(--c)); display: flex; }
  .badge {
    position: absolute; top: -3px; right: -3px;
    width: 16px; height: 16px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: rgb(var(--b));
    box-shadow: 0 0 0 2px var(--ha-card-background, var(--card-background-color, #fff));
  }
  .badge ha-icon { --mdc-icon-size: 11px; color: #fff; display: flex; }
  .text { min-width: 0; flex: 1; }
  .primary, .secondary { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .primary { font-weight: 600; font-size: 14px; line-height: 20px; color: var(--primary-text-color); }
  .secondary { font-size: 12px; line-height: 16px; color: var(--secondary-text-color); }
  .secondary.warn { color: rgb(${COLORS.down}); }
`;

class HomelabStatusCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("homelab-status-card-editor");
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states)
      .filter((id) => id.startsWith("binary_sensor.") && id.endsWith("_status"))
      .slice(0, 4);
    return { columns: 2, services: entities.map((entity) => ({ entity })) };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.services)) {
      throw new Error("'services' muss eine Liste sein");
    }
    for (const s of config.services) {
      if (!s || !s.entity) throw new Error("Jeder Dienst braucht eine 'entity'");
    }
    this._config = { columns: 2, interval: 60, ...config };
    this._stopTimer();
    if (this.isConnected) this._startTimer();
    this._render();
  }

  set hass(hass) {
    const old = this._hass;
    this._hass = hass;
    if (!this._config) return;
    if (!old) {
      this._runChecks();
      this._render();
      return;
    }
    if (this._config.services.some((s) => old.states[s.entity] !== hass.states[s.entity])) {
      this._render();
    }
  }

  connectedCallback() {
    this._startTimer();
  }

  disconnectedCallback() {
    this._stopTimer();
  }

  getCardSize() {
    const cols = Number(this._config?.columns) || 2;
    return Math.ceil((this._config?.services.length || 1) / cols) + (this._config?.title ? 1 : 0);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  get _intervalMs() {
    return Math.max(15, Number(this._config?.interval) || 60) * 1000;
  }

  _startTimer() {
    if (this._timer || !this._config) return;
    this._timer = setInterval(() => this._runChecks(), this._intervalMs);
    this._runChecks();
  }

  _stopTimer() {
    clearInterval(this._timer);
    this._timer = null;
  }

  _runChecks() {
    if (!this._hass || !this._config) return;
    for (const s of this._config.services) {
      if (!s.domain_check || !s.domain) continue;
      const entry = requestCheck(this._hass, normalizeUrl(s.domain), this._intervalMs - 2000);
      if (entry.promise) entry.promise.then(() => this._render());
    }
  }

  _onClick(ev) {
    const badge = ev.target.closest(".badge[data-url]");
    if (badge) {
      ev.stopPropagation();
      window.open(badge.dataset.url, "_blank", "noopener");
      return;
    }
    const tile = ev.target.closest(".tile[data-entity]");
    if (tile) {
      this.dispatchEvent(
        new CustomEvent("hass-more-info", {
          detail: { entityId: tile.dataset.entity },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  _tile(s) {
    const hass = this._hass;
    const st = hass.states[s.entity];
    const name = s.name || st?.attributes?.friendly_name || s.entity;

    const main = !st || ["unavailable", "unknown"].includes(st.state) ? "unknown" : st.state === "on" ? "ok" : "down";

    let badge = "";
    let domState = null;
    let domCode = null;
    if (s.domain_check && s.domain) {
      const url = normalizeUrl(s.domain);
      const entry = checks.get(url);
      domState = entry?.ok === true ? "ok" : entry?.ok === false ? "down" : "unknown";
      domCode = entry?.code;
      const label =
        domState === "ok" ? t(hass, "domain_ok") : domState === "down" ? t(hass, "domain_down") : t(hass, "domain_unknown");
      const tip = `${url} – ${label}${domCode ? ` (HTTP ${domCode})` : ""}`;
      badge = `<div class="badge" data-url="${esc(url)}" title="${esc(tip)}" style="--b: ${COLORS[domState]}">
          <ha-icon icon="mdi:web"></ha-icon></div>`;
    }

    let secondary;
    let warn = false;
    if (main === "unknown") secondary = t(hass, "unavailable");
    else if (main === "down") secondary = t(hass, "offline");
    else if (domState === "down") {
      secondary = t(hass, "domain_down") + (domCode ? ` (HTTP ${domCode})` : "");
      warn = true;
    } else secondary = t(hass, "running");

    return `
      <ha-card class="tile" data-entity="${esc(s.entity)}">
        <div class="shape" style="--c: ${COLORS[main]}">
          <ha-icon icon="${esc(s.icon || "mdi:circle")}"></ha-icon>
          ${badge}
        </div>
        <div class="text">
          <div class="primary">${esc(name)}</div>
          <div class="secondary${warn ? " warn" : ""}">${esc(secondary)}</div>
        </div>
      </ha-card>`;
  }

  _render() {
    if (!this._config || !this._hass) return;
    const cols = Math.min(6, Math.max(1, Number(this._config.columns) || 2));
    this.shadowRoot.innerHTML = `
      <style>${CARD_STYLE}</style>
      ${this._config.title ? `<div class="header">${esc(this._config.title)}</div>` : ""}
      <div class="grid" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr))">
        ${this._config.services.map((s) => this._tile(s)).join("")}
      </div>`;
  }
}

// ---------------------------------------------------------------------------
// Visueller Editor
// ---------------------------------------------------------------------------
const EDITOR_STYLE = `
  :host { display: block; }
  h3 { margin: 16px 0 8px; font-size: 16px; font-weight: 500; }
  label.field { display: block; margin-bottom: 10px; font-size: 12px; color: var(--secondary-text-color); }
  input[type=text], input[type=number], input[type=search] {
    display: block; width: 100%; box-sizing: border-box; margin-top: 4px;
    padding: 8px 10px; font-size: 14px; border-radius: 6px;
    border: 1px solid var(--divider-color, #ccc);
    background: var(--card-background-color, #fff); color: var(--primary-text-color);
  }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
  .check input { width: 18px; height: 18px; margin: 0; accent-color: var(--primary-color); }
  .svc { border: 1px solid var(--divider-color, #ddd); border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; }
  .svc.on { border-color: var(--primary-color); }
  .svc.hidden { display: none; }
  .search { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .search input { flex: 1; margin-top: 0; }
  .search .count { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; }
  .search-none { display: none; font-size: 13px; color: var(--secondary-text-color); margin-bottom: 8px; }
  .search-none.show { display: block; }
  .svc-head { display: flex; align-items: center; gap: 8px; }
  .svc-head .check { flex: 1; min-width: 0; }
  .svc-head .eid { font-size: 11px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .svc-body { margin: 10px 0 2px 26px; }
  button.mv {
    border: none; background: none; cursor: pointer; padding: 4px;
    color: var(--secondary-text-color); font-size: 16px; line-height: 1;
  }
  button.mv:disabled { opacity: 0.3; cursor: default; }
  .note {
    font-size: 12px; padding: 8px 10px; border-radius: 6px; margin-bottom: 12px;
    background: rgba(${COLORS.warn}, 0.15); color: var(--primary-text-color);
  }
`;

const slugFor = (svc, hass) => {
  if (svc.name) return svc.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return svc.entity
    .replace(/^binary_sensor\./, "")
    .replace(/^(lxc|qemu|vm|ct)_/, "")
    .replace(/(_\d+)?_status$/, "")
    .replace(/_/g, "-");
};

class HomelabStatusCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._showAll = false;
    this._query = "";
    this.shadowRoot.addEventListener("input", (ev) => this._onInput(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
  }

  setConfig(config) {
    const json = JSON.stringify(config);
    if (json === this._lastJson) return; // eigenes Echo: nicht neu rendern (Fokus bleibt erhalten)
    this._lastJson = json;
    this._config = JSON.parse(json);
    if (!Array.isArray(this._config.services)) this._config.services = [];
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._render();
  }

  _fire() {
    const config = JSON.parse(JSON.stringify(this._config));
    this._lastJson = JSON.stringify(config);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  _svc(entity) {
    return this._config.services.find((s) => s.entity === entity);
  }

  _setTop(key, value) {
    if (value === "" || value === null || Number.isNaN(value)) delete this._config[key];
    else this._config[key] = value;
  }

  _onInput(ev) {
    const el = ev.target;
    if (el.dataset.act === "search") {
      this._query = el.value;
      this._applySearch();
      return;
    }
    const field = el.dataset.field;
    if (!field) return;
    if (el.dataset.entity) {
      const s = this._svc(el.dataset.entity);
      if (!s) return;
      if (el.value.trim() === "") delete s[field];
      else s[field] = el.value.trim();
    } else {
      this._setTop(field, el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value);
    }
    this._fire();
  }

  _onChange(ev) {
    const el = ev.target;
    const act = el.dataset.act;
    if (!act || act === "search") return;
    if (act === "show_all") {
      this._showAll = el.checked;
      this._render();
      return;
    }
    const entity = el.dataset.entity;
    if (act === "toggle") {
      if (el.checked) {
        if (!this._svc(entity)) this._config.services.push({ entity });
      } else {
        this._config.services = this._config.services.filter((s) => s.entity !== entity);
      }
    } else if (act === "domain_check") {
      const s = this._svc(entity);
      if (!s) return;
      if (el.checked) {
        s.domain_check = true;
        if (!s.domain && this._config.base_domain) {
          s.domain = `${slugFor(s, this._hass)}.${String(this._config.base_domain).replace(/^\./, "")}`;
        }
      } else {
        delete s.domain_check;
      }
    }
    this._render();
    this._fire();
  }

  _onClick(ev) {
    const btn = ev.target.closest("button.mv");
    if (!btn) return;
    const list = this._config.services;
    const i = list.findIndex((s) => s.entity === btn.dataset.entity);
    const j = i + (btn.dataset.dir === "up" ? -1 : 1);
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this._render();
    this._fire();
  }

  _matches(hay) {
    const words = this._query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return words.every((w) => hay.includes(w));
  }

  // Filtert ohne Neu-Rendern, damit der Fokus im Suchfeld bleibt
  _applySearch() {
    const root = this.shadowRoot;
    const rows = [...root.querySelectorAll(".svc")];
    let shown = 0;
    for (const row of rows) {
      const hit = this._matches(row.dataset.search || "");
      row.classList.toggle("hidden", !hit);
      if (hit) shown++;
    }
    const count = root.querySelector(".search .count");
    if (count) {
      count.textContent = this._query.trim()
        ? t(this._hass, "search_count").replace("{shown}", shown).replace("{total}", rows.length)
        : "";
    }
    root.querySelector(".search-none")?.classList.toggle("show", rows.length > 0 && shown === 0);
  }

  _candidates() {
    const hass = this._hass;
    const selected = this._config.services.map((s) => s.entity);
    const others = Object.keys(hass.states)
      .filter((id) => id.startsWith("binary_sensor.") && (this._showAll || id.endsWith("_status")))
      .filter((id) => !selected.includes(id))
      .sort((a, b) =>
        String(hass.states[a].attributes.friendly_name || a).localeCompare(String(hass.states[b].attributes.friendly_name || b))
      );
    return [...selected, ...others];
  }

  _render() {
    if (!this._config || !this._hass) return;
    const hass = this._hass;
    const c = this._config;
    const n = c.services.length;

    const rows = this._candidates()
      .map((id) => {
        const s = this._svc(id);
        const idx = c.services.indexOf(s);
        const fname = hass.states[id]?.attributes?.friendly_name || id;
        const body = s
          ? `<div class="svc-body">
              <div class="row2">
                <label class="field">${t(hass, "name")}
                  <input type="text" data-entity="${esc(id)}" data-field="name" value="${esc(s.name || "")}" placeholder="${esc(fname)}">
                </label>
                <label class="field">${t(hass, "icon")}
                  <input type="text" data-entity="${esc(id)}" data-field="icon" value="${esc(s.icon || "")}" placeholder="mdi:circle">
                </label>
              </div>
              <label class="check">
                <input type="checkbox" data-act="domain_check" data-entity="${esc(id)}" ${s.domain_check ? "checked" : ""}>
                ${t(hass, "domain_check")}
              </label>
              ${
                s.domain_check
                  ? `<label class="field" style="margin-top:8px">${t(hass, "domain")}
                      <input type="text" data-entity="${esc(id)}" data-field="domain" value="${esc(s.domain || "")}" placeholder="dienst.example.org">
                    </label>`
                  : ""
              }
            </div>`
          : "";
        const hay = [fname, id, s?.name, s?.domain].filter(Boolean).join(" ").toLowerCase();
        const hidden = this._query.trim() && !this._matches(hay) ? " hidden" : "";
        return `<div class="svc${s ? " on" : ""}${hidden}" data-search="${esc(hay)}">
            <div class="svc-head">
              <label class="check">
                <input type="checkbox" data-act="toggle" data-entity="${esc(id)}" ${s ? "checked" : ""}>
                <span style="min-width:0">
                  <div>${esc(fname)}</div>
                  <div class="eid">${esc(id)}</div>
                </span>
              </label>
              ${
                s
                  ? `<button class="mv" title="${t(hass, "up")}" data-entity="${esc(id)}" data-dir="up" ${idx === 0 ? "disabled" : ""}>▲</button>
                     <button class="mv" title="${t(hass, "down")}" data-entity="${esc(id)}" data-dir="down" ${idx === n - 1 ? "disabled" : ""}>▼</button>`
                  : ""
              }
            </div>
            ${body}
          </div>`;
      })
      .join("");

    const needsNote = c.services.some((s) => s.domain_check) && !hasServerCheck(hass);

    this.shadowRoot.innerHTML = `
      <style>${EDITOR_STYLE}</style>
      <h3>${t(hass, "general")}</h3>
      <label class="field">${t(hass, "title")}
        <input type="text" data-field="title" value="${esc(c.title || "")}">
      </label>
      <div class="row2">
        <label class="field">${t(hass, "columns")}
          <input type="number" min="1" max="6" data-field="columns" value="${esc(c.columns ?? 2)}">
        </label>
        <label class="field">${t(hass, "interval")}
          <input type="number" min="15" step="5" data-field="interval" value="${esc(c.interval ?? 60)}">
        </label>
      </div>
      <label class="field">${t(hass, "base_domain")}
        <input type="text" data-field="base_domain" value="${esc(c.base_domain || "")}" placeholder="example.org">
      </label>

      <h3>${t(hass, "services")}</h3>
      ${needsNote ? `<div class="note">${t(hass, "browser_mode")}</div>` : ""}
      <label class="check" style="margin-bottom:10px">
        <input type="checkbox" data-act="show_all" ${this._showAll ? "checked" : ""}>
        ${t(hass, "show_all")}
      </label>
      <div class="search">
        <input type="search" data-act="search" value="${esc(this._query)}" placeholder="${esc(t(hass, "search"))}" autocomplete="off">
        <span class="count"></span>
      </div>
      <div class="search-none">${t(hass, "search_none")}</div>
      ${rows || `<div class="eid">${t(hass, "no_entities")}</div>`}
    `;
    this._applySearch();
  }
}

if (!customElements.get("homelab-status-card")) {
  customElements.define("homelab-status-card", HomelabStatusCard);
}
if (!customElements.get("homelab-status-card-editor")) {
  customElements.define("homelab-status-card-editor", HomelabStatusCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "homelab-status-card")) {
  window.customCards.push({
    type: "homelab-status-card",
    name: "Homelab Status Card",
    description: "Status von Containern/VMs plus Erreichbarkeit der zugehörigen Domains.",
    preview: true,
  });
}

console.info(`%c HOMELAB-STATUS-CARD %c v${VERSION} `, "color:#fff;background:#4caf50;font-weight:700", "color:#4caf50");

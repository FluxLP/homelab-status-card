/*
 * Homelab Status Card v2
 * Zeigt Container/VMs mit Status und Domain-Erreichbarkeit. Die Daten kommen
 * aus den Dienst-Entitäten der Integration „Proxmox Homelab Monitor“
 * (binary_sensor.<gast>_service); die Karte prüft selbst nichts mehr.
 */
// Eigener Gültigkeitsbereich: kollidiert nicht mit anderen Karten, auch wenn
// die Datei als klassisches Skript statt als Modul geladen wird.
(() => {
  const VERSION = "2.0.0";
  const PLATFORM = "proxmox_homelab_monitor";

  const I18N = {
    de: {
      running: "In Betrieb",
      offline: "Offline",
      unavailable: "Nicht verfügbar",
      domain_down: "Domain nicht erreichbar",
      domain_ok: "Domain erreichbar",
      domain_unknown: "Domain wird geprüft…",
      err_timeout: "Zeitüberschreitung",
      err_ssl: "Zertifikatsfehler",
      err_dns: "DNS-Fehler",
      err_connection: "keine Verbindung",
      general: "Allgemein",
      title: "Titel (optional)",
      columns: "Spalten",
      size: "Größe",
      size_normal: "Normal",
      size_small: "Klein",
      size_tiny: "Sehr klein",
      services: "Dienste",
      services_hint: "Domains trägst du in der Integration ein: Einstellungen → Geräte & Dienste → Proxmox Homelab Monitor → Konfigurieren → Domains der Dienste.",
      name: "Anzeigename",
      icon: "Icon",
      domain_none: "keine Domain",
      no_entities: "Keine Dienste gefunden. Ist die Integration „Proxmox Homelab Monitor“ eingerichtet?",
      search: "Dienste durchsuchen …",
      search_count: "{shown} von {total}",
      search_none: "Keine Treffer für diese Suche.",
      nodes: "Nodes:",
      node_other: "Andere",
      up: "Nach oben",
      down: "Nach unten",
      missing: "Integration „Proxmox Homelab Monitor“ nicht gefunden. Ohne sie zeigt die Karte nur den Container-Status.",
    },
    en: {
      running: "Running",
      offline: "Offline",
      unavailable: "Unavailable",
      domain_down: "Domain unreachable",
      domain_ok: "Domain reachable",
      domain_unknown: "Checking domain…",
      err_timeout: "timeout",
      err_ssl: "certificate error",
      err_dns: "DNS error",
      err_connection: "no connection",
      general: "General",
      title: "Title (optional)",
      columns: "Columns",
      size: "Size",
      size_normal: "Normal",
      size_small: "Small",
      size_tiny: "Extra small",
      services: "Services",
      services_hint: "Domains are set in the integration: Settings → Devices & services → Proxmox Homelab Monitor → Configure → Service domains.",
      name: "Display name",
      icon: "Icon",
      domain_none: "no domain",
      no_entities: "No services found. Is the “Proxmox Homelab Monitor” integration set up?",
      search: "Search services …",
      search_count: "{shown} of {total}",
      search_none: "No services match this search.",
      nodes: "Nodes:",
      node_other: "Other",
      up: "Move up",
      down: "Move down",
      missing: "“Proxmox Homelab Monitor” integration not found. Without it the card only shows the container state.",
    },
  };

  const t = (hass, key) => {
    const lang = String(hass?.language || "en").split("-")[0];
    return (I18N[lang] || I18N.en)[key] ?? I18N.en[key] ?? key;
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const COLORS = {
    ok: "76, 175, 80",
    down: "244, 67, 54",
    warn: "255, 152, 0",
    unknown: "158, 158, 158",
  };

  // ---------------------------------------------------------------------------
  // Dienst-Entitäten der Integration lesen
  // ---------------------------------------------------------------------------
  const isServiceState = (st) => !!st && st.attributes && "problem" in st.attributes && "guest_status" in st.attributes;

  // v1-Konfigurationen nennen den Status-Sensor (…_status); dazu gehört …_service.
  function serviceEntityId(hass, id) {
    if (isServiceState(hass.states[id])) return id;
    if (/_status$/.test(id)) {
      const candidate = id.replace(/_status$/, "_service");
      if (isServiceState(hass.states[candidate])) return candidate;
    }
    return id;
  }

  function serviceState(hass, svc) {
    const id = serviceEntityId(hass, svc.entity);
    const st = hass.states[id];
    const a = st?.attributes || {};
    const out = { id, url: "", dom: null, code: null, err: null, problem: null, node: a.node || "" };
    out.name = svc.name || a.service_name || a.friendly_name || svc.entity;
    if (!st || ["unavailable", "unknown"].includes(st.state)) {
      out.main = "unknown";
      out.problem = "unavailable";
    } else if (isServiceState(st)) {
      out.main = a.guest_status === "running" ? "ok" : a.guest_status ? "down" : "unknown";
      out.url = a.url || "";
      if (out.url) out.dom = a.domain_ok === true ? "ok" : a.domain_ok === false ? "down" : "unknown";
      out.code = a.http_status ?? null;
      out.err = a.error ?? null;
      out.problem = a.problem ?? null;
    } else {
      // Ohne Integration: einfacher Status-Sensor (an = läuft)
      out.main = st.state === "on" ? "ok" : "down";
      out.problem = out.main === "down" ? "offline" : null;
    }
    return out;
  }

  function reasonText(hass, x) {
    if (x.problem === "unavailable") return t(hass, "unavailable");
    if (x.problem === "offline") return t(hass, "offline");
    if (x.problem === "domain") {
      const detail = x.code ? `HTTP ${x.code}` : x.err ? t(hass, `err_${x.err}`) : "";
      return t(hass, "domain_down") + (detail ? ` (${detail})` : "");
    }
    return t(hass, "running");
  }

  function domainTip(hass, x) {
    const label = x.dom === "ok" ? t(hass, "domain_ok") : x.dom === "down" ? t(hass, "domain_down") : t(hass, "domain_unknown");
    return `${x.url} – ${label}${x.code ? ` (HTTP ${x.code})` : ""}`;
  }

  // ---------------------------------------------------------------------------
  // Karte
  // ---------------------------------------------------------------------------
  const SIZES = {
    normal: "",
    small: "--hsc-fs1:12px;--hsc-fs2:10.5px;--hsc-shape:28px;--hsc-icon:16px;--hsc-badge:14px;--hsc-pad:8px;--hsc-gap:8px;",
    tiny: "--hsc-fs1:11px;--hsc-fs2:9.5px;--hsc-shape:22px;--hsc-icon:13px;--hsc-badge:12px;--hsc-pad:6px;--hsc-gap:6px;",
  };

  const CARD_STYLE = `
    :host { display: block; }
    .header {
      font-size: var(--ha-card-header-font-size, 24px);
      color: var(--ha-card-header-color, var(--primary-text-color));
      padding: 4px 4px 12px;
    }
    .grid { display: grid; gap: var(--grid-card-gap, 8px); }
    ha-card.tile {
      display: flex; align-items: center; gap: var(--hsc-gap, 12px);
      padding: var(--hsc-pad, 12px); box-sizing: border-box; height: 100%;
      cursor: pointer;
    }
    .shape {
      position: relative; flex: none;
      width: var(--hsc-shape, 36px); height: var(--hsc-shape, 36px); border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: rgba(var(--c), 0.2);
    }
    .shape > ha-icon { --mdc-icon-size: var(--hsc-icon, 20px); color: rgb(var(--c)); display: flex; }
    .badge {
      position: absolute; top: -3px; right: -3px;
      width: var(--hsc-badge, 16px); height: var(--hsc-badge, 16px); border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: rgb(var(--b));
      box-shadow: 0 0 0 2px var(--ha-card-background, var(--card-background-color, #fff));
    }
    .badge ha-icon { --mdc-icon-size: calc(var(--hsc-badge, 16px) - 5px); color: #fff; display: flex; }
    .text { min-width: 0; flex: 1; }
    .primary, .secondary { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .primary { font-weight: 600; font-size: var(--hsc-fs1, 14px); line-height: 1.4; color: var(--primary-text-color); }
    .secondary { font-size: var(--hsc-fs2, 12px); line-height: 1.35; color: var(--secondary-text-color); }
    /* Kleine Stufen: Namen auf zwei Zeilen umbrechen statt abschneiden */
    .grid.compact .primary {
      white-space: normal; overflow-wrap: anywhere; line-height: 1.25;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    .secondary.warn { color: rgb(${COLORS.down}); }
  `;

  class HomelabStatusCard extends HTMLElement {
    static getConfigElement() {
      return document.createElement("homelab-status-card-editor");
    }

    static getStubConfig(hass) {
      const entities = Object.keys(hass.states)
        .filter((id) => isServiceState(hass.states[id]))
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
      this._config = { columns: 2, ...config };
      this._render();
    }

    set hass(hass) {
      const old = this._hass;
      this._hass = hass;
      if (!this._config) return;
      if (!old || this._config.services.some((s) => {
        const id = serviceEntityId(hass, s.entity);
        return old.states[id] !== hass.states[id];
      })) {
        this._render();
      }
    }

    getCardSize() {
      const cols = Number(this._config?.columns) || 2;
      return Math.ceil((this._config?.services.length || 1) / cols) + (this._config?.title ? 1 : 0);
    }

    getGridOptions() {
      return { columns: 12, min_columns: 6 };
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
          new CustomEvent("hass-more-info", { detail: { entityId: tile.dataset.entity }, bubbles: true, composed: true })
        );
      }
    }

    _tile(s) {
      const hass = this._hass;
      const x = serviceState(hass, s);
      const badge = x.url
        ? `<div class="badge" data-url="${esc(x.url)}" title="${esc(domainTip(hass, x))}" style="--b: ${COLORS[x.dom || "unknown"]}">
            <ha-icon icon="mdi:web"></ha-icon></div>`
        : "";
      const warn = x.problem === "domain";
      return `
        <ha-card class="tile" data-entity="${esc(x.id)}">
          <div class="shape" style="--c: ${COLORS[x.main]}">
            <ha-icon icon="${esc(s.icon || "mdi:circle")}"></ha-icon>
            ${badge}
          </div>
          <div class="text">
            <div class="primary" title="${esc(x.name)}">${esc(x.name)}</div>
            <div class="secondary${warn ? " warn" : ""}">${esc(reasonText(hass, x))}</div>
          </div>
        </ha-card>`;
    }

    _render() {
      if (!this._config || !this._hass) return;
      const cols = Math.min(6, Math.max(1, Number(this._config.columns) || 2));
      const size = SIZES[this._config.size] !== undefined ? this._config.size : "normal";
      this.shadowRoot.innerHTML = `
        <style>${CARD_STYLE}</style>
        ${this._config.title ? `<div class="header">${esc(this._config.title)}</div>` : ""}
        <div class="grid${size === "normal" ? "" : " compact"}" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr));${SIZES[size]}">
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
    .hint { font-size: 12px; color: var(--secondary-text-color); margin: -4px 0 10px; }
    label.field { display: block; margin-bottom: 10px; font-size: 12px; color: var(--secondary-text-color); }
    input[type=text], input[type=number], input[type=search], select {
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
    .nodes { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: -2px 0 10px; font-size: 12px; color: var(--secondary-text-color); }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px 3px 6px; border-radius: 14px; cursor: pointer; border: 1px solid var(--divider-color, #ccc); color: var(--primary-text-color); font-size: 13px; }
    .chip.on { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.12); }
    .chip input { margin: 0; }
    .search-none { display: none; font-size: 13px; color: var(--secondary-text-color); margin-bottom: 8px; }
    .search-none.show { display: block; }
    .svc-head { display: flex; align-items: center; gap: 8px; }
    .svc-head .check { flex: 1; min-width: 0; }
    .eid { font-size: 11px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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

  class HomelabStatusCardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._query = "";
      this._hiddenNodes = new Set();
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
      this._migrated = false;
      this._render();
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (first) this._render();
    }

    // v1 -> v2: Status-Sensor durch Dienst-Entität ersetzen, Domain-Felder und
    // Prüf-Optionen entfallen (das macht jetzt die Integration).
    _migrate() {
      if (this._migrated || !this._hass) return;
      this._migrated = true;
      const c = this._config;
      for (const s of c.services) {
        s.entity = serviceEntityId(this._hass, s.entity);
        delete s.domain_check;
        delete s.domain;
      }
      delete c.interval;
      delete c.base_domain;
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
      if (value === "" || value === null || Number.isNaN(value) || (key === "size" && value === "normal")) delete this._config[key];
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
      if (act === "node") {
        if (el.checked) this._hiddenNodes.delete(el.dataset.node);
        else this._hiddenNodes.add(el.dataset.node);
        el.closest(".chip")?.classList.toggle("on", el.checked);
        this._applySearch();
        return;
      }
      const entity = el.dataset.entity;
      if (act === "toggle") {
        if (el.checked) {
          if (!this._svc(entity)) this._config.services.push({ entity });
        } else {
          this._config.services = this._config.services.filter((s) => s.entity !== entity);
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

    _nodeOf(id) {
      return String(this._hass.states[id]?.attributes?.node || "");
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
        const hit = this._matches(row.dataset.search || "") && !this._hiddenNodes.has(row.dataset.node || "");
        row.classList.toggle("hidden", !hit);
        if (hit) shown++;
      }
      const count = root.querySelector(".search .count");
      if (count) {
        count.textContent =
          this._query.trim() || this._hiddenNodes.size
            ? t(this._hass, "search_count").replace("{shown}", shown).replace("{total}", rows.length)
            : "";
      }
      root.querySelector(".search-none")?.classList.toggle("show", rows.length > 0 && shown === 0);
    }

    _nodesBar() {
      const hass = this._hass;
      const nodes = [...new Set(this._candidates().map((id) => this._nodeOf(id)))].sort((a, b) =>
        a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)
      );
      if (nodes.length < 2 && !this._hiddenNodes.size) return "";
      const chips = nodes
        .map((n) => {
          const on = !this._hiddenNodes.has(n);
          return `<label class="chip${on ? " on" : ""}">
              <input type="checkbox" data-act="node" data-node="${esc(n)}" ${on ? "checked" : ""}>
              ${esc(n || t(hass, "node_other"))}
            </label>`;
        })
        .join("");
      return `<div class="nodes">${t(hass, "nodes")} ${chips}</div>`;
    }

    _candidates() {
      const hass = this._hass;
      const selected = this._config.services.map((s) => s.entity);
      const label = (id) => String(hass.states[id]?.attributes?.service_name || id);
      const others = Object.keys(hass.states)
        .filter((id) => isServiceState(hass.states[id]) && !selected.includes(id))
        .sort((a, b) => label(a).localeCompare(label(b)));
      return [...selected, ...others];
    }

    _render() {
      if (!this._config || !this._hass) return;
      this._migrate();
      const hass = this._hass;
      const c = this._config;
      const n = c.services.length;
      const hasIntegration = Object.keys(hass.states).some((id) => isServiceState(hass.states[id]));

      const rows = this._candidates()
        .map((id) => {
          const s = this._svc(id);
          const idx = c.services.indexOf(s);
          const a = hass.states[id]?.attributes || {};
          const label = a.service_name || a.friendly_name || id;
          const domain = a.url ? String(a.url).replace(/^https?:\/\//, "") : t(hass, "domain_none");
          const body = s
            ? `<div class="svc-body">
                <div class="row2">
                  <label class="field">${t(hass, "name")}
                    <input type="text" data-entity="${esc(id)}" data-field="name" value="${esc(s.name || "")}" placeholder="${esc(label)}">
                  </label>
                  <label class="field">${t(hass, "icon")}
                    <input type="text" data-entity="${esc(id)}" data-field="icon" value="${esc(s.icon || "")}" placeholder="mdi:circle">
                  </label>
                </div>
              </div>`
            : "";
          const node = this._nodeOf(id);
          const hay = [label, id, s?.name, a.url, node].filter(Boolean).join(" ").toLowerCase();
          const hidden = (this._query.trim() && !this._matches(hay)) || this._hiddenNodes.has(node) ? " hidden" : "";
          return `<div class="svc${s ? " on" : ""}${hidden}" data-search="${esc(hay)}" data-node="${esc(node)}">
              <div class="svc-head">
                <label class="check">
                  <input type="checkbox" data-act="toggle" data-entity="${esc(id)}" ${s ? "checked" : ""}>
                  <span style="min-width:0">
                    <div>${esc(s?.name || label)}</div>
                    <div class="eid">${esc(domain)}${node ? ` · ${esc(node)}` : ""}</div>
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

      this.shadowRoot.innerHTML = `
        <style>${EDITOR_STYLE}</style>
        ${hasIntegration ? "" : `<div class="note">${t(hass, "missing")}</div>`}
        <h3>${t(hass, "general")}</h3>
        <label class="field">${t(hass, "title")}
          <input type="text" data-field="title" value="${esc(c.title || "")}">
        </label>
        <div class="row2">
          <label class="field">${t(hass, "columns")}
            <input type="number" min="1" max="6" data-field="columns" value="${esc(c.columns ?? 2)}">
          </label>
          <label class="field">${t(hass, "size")}
            <select data-field="size">
              ${["normal", "small", "tiny"]
                .map((v) => `<option value="${v}" ${(c.size || "normal") === v ? "selected" : ""}>${t(hass, "size_" + v)}</option>`)
                .join("")}
            </select>
          </label>
        </div>

        <h3>${t(hass, "services")}</h3>
        <div class="hint">${t(hass, "services_hint")}</div>
        <div class="search">
          <input type="search" data-act="search" value="${esc(this._query)}" placeholder="${esc(t(hass, "search"))}" autocomplete="off">
          <span class="count"></span>
        </div>
        ${this._nodesBar()}
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
      description: "Container/VMs mit Status und Domain-Erreichbarkeit (benötigt die Integration Proxmox Homelab Monitor).",
      preview: true,
    });
  }

  console.info(`%c HOMELAB-STATUS-CARD %c v${VERSION} `, "color:#fff;background:#4caf50;font-weight:700", "color:#4caf50");
})();

"use strict";

/**
 * Custom insight builder UI.
 *
 * InsightsBuilder.init({ page, prefix, color })
 *
 * Reads window.INSIGHTS_DATASETS[page], manages a localStorage-backed layout
 * (via InsightsStore), and renders a Bootstrap grid of custom widgets.
 * Each widget is built from InsightsWidgets descriptors + InsightsEngine.aggregate.
 *
 * DOM IDs emitted by _includes/insights/custom.html (all prefixed):
 *   #{p}custom-create   — "+ Create insight" button
 *   #{p}custom-grid     — widget grid mount
 *   #{p}custom-builder  — Bootstrap modal element
 *   #{p}custom-title    — title text input inside modal
 *   #{p}custom-type-picker — type segmented control mount
 *   #{p}custom-form-body   — dynamic config controls mount
 *   #{p}custom-preview  — live preview mount
 *   #{p}custom-save     — Save button
 *   #{p}custom-delete   — Delete button
 */
const InsightsBuilder = (() => {
  "use strict";

  function init({ page, prefix = "", color = "#0d6efd" }) {
    const dataset = (window.INSIGHTS_DATASETS || {})[page];
    if (!dataset) return;

    let layout = InsightsStore.load(page);
    if (!layout.rows || !layout.rows.length) layout.rows = [{ cols: [] }];

    // ── Internal layout accessors ─────────────────────────────────────────────

    function _cols() {
      return layout.rows[0]?.cols ?? [];
    }

    function _saveCols(cols) {
      layout.rows = cols.length ? [{ cols }] : [];
      InsightsStore.save(page, layout);
    }

    // ── DOM helpers ───────────────────────────────────────────────────────────

    function byId(id) {
      return document.getElementById(prefix + id);
    }

    function _esc(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    // ── Dataset field helpers ─────────────────────────────────────────────────

    function _fields(ofType) {
      return dataset.fields.filter((f) => !f.hidden && (!ofType || f.type === ofType));
    }

    function _distinctValues(fieldKey) {
      const vals = new Set();
      for (const row of dataset.rows) {
        const v = row[fieldKey];
        if (v !== undefined && v !== null && v !== "") vals.add(v);
      }
      return [...vals].sort((a, b) => String(a).localeCompare(String(b)));
    }

    // ── Grid render ───────────────────────────────────────────────────────────

    function _renderGrid() {
      const mount = byId("custom-grid");
      if (!mount) return;
      const cols = _cols();

      if (!cols.length) {
        mount.innerHTML = "";
        return;
      }

      mount.innerHTML = "";
      const row = document.createElement("div");
      row.className = "row g-3 mb-3";
      const renderCalls = [];

      cols.forEach((widget, idx) => {
        const descriptor = InsightsWidgets.get(widget.type);
        if (!descriptor) return;

        const spec = descriptor.buildSpec(widget.config, dataset);
        const agg = InsightsEngine.aggregate(dataset.rows, spec);

        const col = document.createElement("div");
        col.className = `col-12 col-md-${widget.colWidth || 6}`;

        const card = document.createElement("div");
        card.className = "card h-100";

        // ── Card header ───────────────────────────────────────────────────────
        const header = document.createElement("div");
        header.className = "card-header d-flex align-items-center gap-1 py-1 pe-2";

        const titleEl = document.createElement("span");
        titleEl.className = "fw-semibold me-auto small text-truncate";
        titleEl.textContent = widget.title || descriptor.label;

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-sm btn-outline-secondary py-0 px-1 flex-shrink-0";
        editBtn.title = "Edit";
        editBtn.textContent = "⚙️";
        editBtn.addEventListener("click", () => _openModal(widget.id));

        // Width segmented control
        const widthGroup = document.createElement("div");
        widthGroup.className = "btn-group btn-group-sm flex-shrink-0";
        [
          ["⅓", 4],
          ["½", 6],
          ["▬", 12],
        ].forEach(([lbl, span]) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `btn ${widget.colWidth === span ? "btn-secondary" : "btn-outline-secondary"} py-0 px-1`;
          btn.style.fontSize = "0.65rem";
          btn.textContent = lbl;
          btn.title = span === 4 ? "One-third" : span === 6 ? "Half" : "Full";
          btn.addEventListener("click", () => {
            widget.colWidth = span;
            _saveCols(_cols());
            _renderGrid();
          });
          widthGroup.appendChild(btn);
        });

        // Move buttons
        const moveGroup = document.createElement("div");
        moveGroup.className = "btn-group btn-group-sm flex-shrink-0";

        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "btn btn-outline-secondary py-0 px-1";
        prevBtn.style.fontSize = "0.65rem";
        prevBtn.textContent = "←";
        prevBtn.title = "Move left";
        prevBtn.disabled = idx === 0;
        prevBtn.addEventListener("click", () => {
          const c = _cols();
          [c[idx - 1], c[idx]] = [c[idx], c[idx - 1]];
          _saveCols(c);
          _renderGrid();
        });

        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "btn btn-outline-secondary py-0 px-1";
        nextBtn.style.fontSize = "0.65rem";
        nextBtn.textContent = "→";
        nextBtn.title = "Move right";
        nextBtn.disabled = idx === cols.length - 1;
        nextBtn.addEventListener("click", () => {
          const c = _cols();
          [c[idx], c[idx + 1]] = [c[idx + 1], c[idx]];
          _saveCols(c);
          _renderGrid();
        });

        moveGroup.appendChild(prevBtn);
        moveGroup.appendChild(nextBtn);

        header.append(titleEl, editBtn, widthGroup, moveGroup);

        // ── Card body ─────────────────────────────────────────────────────────
        const body = document.createElement("div");
        body.className = "card-body py-2 px-3";
        body.style.cssText = "overflow:auto;max-height:400px";

        const ctx = { color: dataset.defaultColor || color, idBase: prefix + widget.id };
        renderCalls.push(() => descriptor.render(body, agg, widget.config, ctx));

        card.append(header, body);
        col.appendChild(card);
        row.appendChild(col);
      });

      mount.appendChild(row);
      // Render widget content after the row is in the DOM so roughViz can read offsetWidth.
      renderCalls.forEach((fn) => fn());
    }

    // ── Modal state ───────────────────────────────────────────────────────────

    let _editingId = null;
    let _activeType = InsightsWidgets.types()[0]?.id || "leaderboard";
    let _config = {};

    function _openModal(widgetId) {
      _editingId = widgetId || null;

      const deleteBtn = byId("custom-delete");
      if (deleteBtn) deleteBtn.classList.toggle("d-none", !_editingId);

      if (_editingId) {
        const widget = _cols().find((w) => w.id === _editingId);
        if (!widget) return;
        _activeType = widget.type;
        _config = JSON.parse(JSON.stringify(widget.config));
        const titleInput = byId("custom-title");
        if (titleInput) titleInput.value = widget.title || "";
      } else {
        _activeType = InsightsWidgets.types()[0]?.id || "leaderboard";
        const desc = InsightsWidgets.get(_activeType);
        _config = JSON.parse(JSON.stringify(desc?.defaultConfig || {}));
        const titleInput = byId("custom-title");
        if (titleInput) titleInput.value = "";
      }

      _renderTypePicker();
      _renderForm();
      _renderPreview();

      const modalEl = byId("custom-builder");
      if (modalEl && typeof bootstrap !== "undefined") {
        const existing = bootstrap.Modal.getInstance(modalEl);
        (existing || new bootstrap.Modal(modalEl)).show();
        // Re-render preview once the modal is fully visible so roughViz can
        // read a non-zero offsetWidth for chart widgets.
        modalEl.addEventListener("shown.bs.modal", _renderPreview, { once: true });
      }
    }

    function _closeModal() {
      const modalEl = byId("custom-builder");
      if (!modalEl) return;
      const m = typeof bootstrap !== "undefined" && bootstrap.Modal.getInstance(modalEl);
      if (m) m.hide();
    }

    // ── Type picker ───────────────────────────────────────────────────────────

    function _renderTypePicker() {
      const mount = byId("custom-type-picker");
      if (!mount) return;
      mount.classList.toggle("d-none", !!_editingId);
      if (_editingId) return;

      mount.innerHTML = "";
      const group = document.createElement("div");
      group.className = "btn-group btn-group-sm mb-3";

      InsightsWidgets.types().forEach(({ id, label, icon }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn ${id === _activeType ? "btn-secondary" : "btn-outline-secondary"}`;
        btn.textContent = [icon, label].filter(Boolean).join(" ");
        btn.addEventListener("click", () => {
          if (_activeType === id) return;
          _activeType = id;
          const desc = InsightsWidgets.get(id);
          _config = JSON.parse(JSON.stringify(desc?.defaultConfig || {}));
          _renderTypePicker();
          _renderForm();
          _renderPreview();
        });
        group.appendChild(btn);
      });

      mount.appendChild(group);
    }

    // ── Config form ───────────────────────────────────────────────────────────

    function _onConfigChange(id, value) {
      _config[id] = value;
      _renderForm();
      _renderPreview();
    }

    function _renderForm() {
      const formBody = byId("custom-form-body");
      if (!formBody) return;
      formBody.innerHTML = "";

      const desc = InsightsWidgets.get(_activeType);
      if (!desc) return;

      desc.configSchema.forEach((ctrl) => {
        if (ctrl.showWhen && !ctrl.showWhen(_config)) return;

        const wrapper = document.createElement("div");
        wrapper.className = "mb-3";
        wrapper.dataset.ctrlId = ctrl.id;

        const label = document.createElement("label");
        label.className = "form-label small fw-semibold mb-1 d-block";
        label.textContent = ctrl.label;
        wrapper.appendChild(label);

        const el = _buildCtrl(ctrl);
        if (el) wrapper.appendChild(el);

        formBody.appendChild(wrapper);
      });
    }

    function _buildCtrl(ctrl) {
      switch (ctrl.control) {
        case "select":
          return _buildSelect(ctrl);
        case "segmented":
          return _buildSegmented(ctrl);
        case "toggle":
          return _buildToggle(ctrl);
        case "slider":
          return _buildSlider(ctrl);
        case "facetFilter":
          return _buildFacetFilter(ctrl);
        default:
          return null;
      }
    }

    function _buildSelect(ctrl) {
      let opts = [];
      if (ctrl.source === "dimensions")
        opts = _fields("dimension").map((f) => ({ v: f.key, l: f.label }));
      else if (ctrl.source === "measures")
        opts = _fields("measure").map((f) => ({ v: f.key, l: f.label }));
      else if (ctrl.source === "dates")
        opts = _fields("date").map((f) => ({ v: f.key, l: f.label }));
      else if (ctrl.options) opts = ctrl.options;

      const select = document.createElement("select");
      select.className = "form-select form-select-sm";
      select.id = prefix + "cfg-" + ctrl.id;

      opts.forEach(({ v, l }) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = l;
        opt.selected = _config[ctrl.id] === v;
        select.appendChild(opt);
      });

      // Auto-select first option if current value isn't present
      if (!opts.find((o) => o.v === _config[ctrl.id]) && opts.length) {
        _config[ctrl.id] = opts[0].v;
        select.value = opts[0].v;
      }

      select.addEventListener("change", () => _onConfigChange(ctrl.id, select.value));
      return select;
    }

    function _buildSegmented(ctrl) {
      const group = document.createElement("div");
      group.className = "btn-group btn-group-sm";
      group.id = prefix + "cfg-" + ctrl.id;

      const opts = ctrl.options || [];

      if (!opts.find((o) => o.v === _config[ctrl.id]) && opts.length) {
        _config[ctrl.id] = opts[0].v;
      }

      opts.forEach(({ v, l }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn ${_config[ctrl.id] === v ? "btn-secondary" : "btn-outline-secondary"}`;
        btn.textContent = l;
        btn.addEventListener("click", () => {
          if (_config[ctrl.id] === v) return;
          _onConfigChange(ctrl.id, v);
        });
        group.appendChild(btn);
      });

      return group;
    }

    function _buildToggle(ctrl) {
      const isOn = !!_config[ctrl.id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = prefix + "cfg-" + ctrl.id;
      btn.className = `btn btn-sm ${isOn ? "btn-secondary" : "btn-outline-secondary"}`;
      btn.textContent = isOn ? "On" : "Off";
      btn.addEventListener("click", () => _onConfigChange(ctrl.id, !_config[ctrl.id]));
      return btn;
    }

    function _buildSlider(ctrl) {
      const current = _config[ctrl.id] ?? ctrl.min;
      const wrapper = document.createElement("div");
      wrapper.className = "d-flex align-items-center gap-2";

      const input = document.createElement("input");
      input.type = "range";
      input.id = prefix + "cfg-" + ctrl.id;
      input.className = "form-range flex-grow-1";
      input.min = ctrl.min;
      input.max = ctrl.max;
      input.step = ctrl.step;
      input.value = current;

      const valDisplay = document.createElement("span");
      valDisplay.className = "text-muted small";
      valDisplay.style.minWidth = "2rem";
      valDisplay.textContent = current;

      input.addEventListener("input", () => {
        valDisplay.textContent = input.value;
        _onConfigChange(ctrl.id, parseInt(input.value, 10));
      });

      wrapper.appendChild(input);
      wrapper.appendChild(valDisplay);
      return wrapper;
    }

    function _buildFacetFilter(ctrl) {
      const container = document.createElement("div");
      container.id = prefix + "cfg-" + ctrl.id;

      _fields("dimension").forEach((field) => {
        const vals = _distinctValues(field.key);
        if (!vals.length) return;

        const existing = (_config.filter || []).find((f) => f.field === field.key);
        const selected = new Set(existing?.value || []);

        const section = document.createElement("div");
        section.className = "mb-2";

        const lbl = document.createElement("div");
        lbl.className = "small text-muted mb-1";
        lbl.textContent = field.label;
        section.appendChild(lbl);

        const btnWrap = document.createElement("div");
        btnWrap.className = "d-flex flex-wrap gap-1";

        vals.forEach((val) => {
          const btn = document.createElement("button");
          btn.type = "button";
          const short = String(val).length > 22 ? String(val).slice(0, 20) + "…" : String(val);
          btn.className = `btn btn-sm ${selected.has(val) ? "btn-secondary" : "btn-outline-secondary"} py-0 px-1`;
          btn.style.fontSize = "0.75rem";
          btn.textContent = short;
          btn.title = String(val);

          btn.addEventListener("click", () => {
            if (selected.has(val)) selected.delete(val);
            else selected.add(val);
            const filters = (_config.filter || []).filter((f) => f.field !== field.key);
            if (selected.size) filters.push({ field: field.key, op: "in", value: [...selected] });
            _onConfigChange("filter", filters);
          });

          btnWrap.appendChild(btn);
        });

        section.appendChild(btnWrap);
        container.appendChild(section);
      });

      return container;
    }

    // ── Live preview ──────────────────────────────────────────────────────────

    function _renderPreview() {
      const preview = byId("custom-preview");
      if (!preview) return;
      const desc = InsightsWidgets.get(_activeType);
      if (!desc) return;
      const spec = desc.buildSpec(_config, dataset);
      const agg = InsightsEngine.aggregate(dataset.rows, spec);
      const ctx = { color: dataset.defaultColor || color, idBase: prefix + "preview" };
      desc.render(preview, agg, _config, ctx);
    }

    // ── Save / Delete ─────────────────────────────────────────────────────────

    function _saveWidget() {
      const titleInput = byId("custom-title");
      const title =
        (titleInput?.value || "").trim() || InsightsWidgets.get(_activeType)?.label || "Widget";

      const cols = _cols();

      if (_editingId) {
        const widget = cols.find((w) => w.id === _editingId);
        if (widget) {
          widget.title = title;
          widget.config = JSON.parse(JSON.stringify(_config));
        }
      } else {
        const id = "w_" + Math.random().toString(36).slice(2, 8);
        cols.push({
          id,
          type: _activeType,
          title,
          config: JSON.parse(JSON.stringify(_config)),
          colWidth: 6,
        });
      }

      _saveCols(cols);
      _closeModal();
      _renderGrid();
    }

    function _deleteWidget() {
      if (!_editingId) return;
      _saveCols(_cols().filter((w) => w.id !== _editingId));
      _closeModal();
      _renderGrid();
    }

    // ── Wire up static buttons ────────────────────────────────────────────────

    const createBtn = byId("custom-create");
    if (createBtn) createBtn.addEventListener("click", () => _openModal(null));

    const saveBtn = byId("custom-save");
    if (saveBtn) saveBtn.addEventListener("click", _saveWidget);

    const deleteBtn = byId("custom-delete");
    if (deleteBtn) deleteBtn.addEventListener("click", _deleteWidget);

    // ── Initial render ────────────────────────────────────────────────────────

    _renderGrid();
  }

  return { init };
})();

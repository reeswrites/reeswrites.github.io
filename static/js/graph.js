(function () {
  "use strict";

  /* ── Constants ───────────────────────────────────────────────────────── */
  const NODE_R          = 20;       // base node radius
  const NODE_R_HOVER    = 26;
  const LABEL_MIN_ZOOM  = 0.4;      // below this zoom labels are always hidden
  const LABEL_CURSOR_R  = 150;      // screen-px radius around cursor to reveal labels
  const TRANSITION_MS   = 600;      // layout morph duration
  const FORCE_ALPHA        = 0.5;   // simulation restart alpha
  const MOBILE_W           = 600;
  const UNCONNECTED_X      = -1000; // x target for unconnected cluster (to the left)

  // Edge colours — match CSS swatches
  const COL_BL          = "rgba(94,190,210,";
  const COL_SE          = "rgba(240,180,80,";
  const COL_BL_ARROW    = "rgba(167,185,145,"; // blend of BL + SE — matches visual mix when edges overlap
  const COL_EDGE_ALPHA  = 0.30;
  const COL_EDGE_HI     = 0.75;     // alpha when a neighbour is selected

  // Node colours
  const COL_NODE        = "#4a90b8";
  const COL_NODE_HUB    = "#a8e4ff"; // high-degree end of the degree gradient
  const COL_NODE_HI     = "#e8c36a"; // selected
  const COL_NODE_NBRS   = "#6bc8e0"; // neighbours of selected
  const COL_NODE_DIM    = "rgba(74,144,184,0.15)";
  const COL_NODE_SEARCH = "#e8c36a";

  /* ── Data ────────────────────────────────────────────────────────────── */
  const raw = window.GRAPH_DATA || { nodes: [], backlink_edges: [], semantic_edges: [] };

  // Keyed maps for O(1) lookups
  const nodeById = new Map(raw.nodes.map(n => [n.id, n]));

  // Build adjacency: directed inlinks/outlinks + combined for dimming
  const blInlinks    = new Map(raw.nodes.map(n => [n.id, new Set()])); // edges where this node is target
  const blOutlinks   = new Map(raw.nodes.map(n => [n.id, new Set()])); // edges where this node is source
  const blNeighbours = new Map(raw.nodes.map(n => [n.id, new Set()])); // combined for selection dimming
  const seNeighbours = new Map(raw.nodes.map(n => [n.id, new Set()]));

  raw.backlink_edges.forEach(e => {
    blOutlinks.get(e.source)?.add(e.target);
    blInlinks.get(e.target)?.add(e.source);
    blNeighbours.get(e.source)?.add(e.target);
    blNeighbours.get(e.target)?.add(e.source);
  });
  raw.semantic_edges.forEach(e => {
    seNeighbours.get(e.source)?.add(e.target);
    seNeighbours.get(e.target)?.add(e.source);
  });

  /* ── DOM refs ────────────────────────────────────────────────────────── */
  const container   = document.getElementById("graph-container");
  const canvas      = document.getElementById("graph-canvas");
  const svgEl       = document.getElementById("graph-svg");
  const loadingEl   = document.getElementById("graph-loading");
  const chkBL       = document.getElementById("chk-backlinks");
  const chkSE       = document.getElementById("chk-semantic");
  const searchEl    = document.getElementById("graph-search");
  const btnFit      = document.getElementById("btn-fit");
  const sidebar     = document.getElementById("graph-sidebar");
  const sbClose     = document.getElementById("sb-close");
  const sbTitle     = document.getElementById("sb-title");
  const sbDate      = document.getElementById("sb-date");
  const sbTags      = document.getElementById("sb-tags");
  const sbDesc      = document.getElementById("sb-desc");
  const sbLink      = document.getElementById("sb-link");
  const sbBLCnt     = document.getElementById("sb-bl-cnt");
  const sbOLCnt     = document.getElementById("sb-ol-cnt");
  const sbSECnt     = document.getElementById("sb-se-cnt");
  const sbBLDiv     = document.getElementById("sb-backlinks");
  const sbOLDiv     = document.getElementById("sb-outlinks");
  const sbSEDiv     = document.getElementById("sb-semantic");
  const btnZoomIn        = document.getElementById("btn-zoom-in");
  const btnZoomOut       = document.getElementById("btn-zoom-out");
  const tooltip          = document.getElementById("graph-tooltip");
  const legendConnCnt    = document.getElementById("legend-connected-cnt");
  const legendUnconnCnt  = document.getElementById("legend-unconnected-cnt");

  const ctx         = canvas.getContext("2d");

  /* ── State ───────────────────────────────────────────────────────────── */
  let width = 0, height = 0;
  let currentTransform = d3.zoomIdentity;
  let selectedId = null;
  let searchQuery = "";
  let showBL = true;
  let showSE = true;
  let connectedIds = new Set();
  let degreeMap = new Map();   // node id → active edge count
  let maxDegree = 1;
  let hoveredId = null;
  let hoverLeaveTimer = null;
  let clickTimer = null;   // { id, timer } — distinguishes single vs double click
  const heldPanKeys = new Set();
  let panRafId = null;
  let cursorSX = null, cursorSY = null; // cursor position in SVG screen space

  /* ── D3 simulation nodes (mutable, D3 attaches x/y/vx/vy) ───────────── */
  const simNodes = raw.nodes.map(n => ({ ...n }));
  const simById  = new Map(simNodes.map(n => [n.id, n]));

  /* ── D3 force simulation ─────────────────────────────────────────────── */
  const forceLink = d3.forceLink([])
    .id(d => d.id)
    .distance(60)
    .strength(0.3);

  const simulation = d3.forceSimulation(simNodes)
    .force("link",    forceLink)
    .force("charge",  d3.forceManyBody().strength(-80).distanceMax(360))
    .force("collide", d3.forceCollide(NODE_R * 1.2 + 2))
    .alphaDecay(0.025)
    .on("tick", renderFrame);

  /* ── SVG layer (nodes + labels) ──────────────────────────────────────── */
  const svg = d3.select(svgEl)
    .attr("cursor", "grab");

  const gRoot = svg.append("g"); // receives zoom transform

  const gNodes = gRoot.append("g").attr("class", "nodes-g");
  const gLabels = gRoot.append("g").attr("class", "labels-g");

  // Draw node circles
  const nodeCircles = gNodes.selectAll("circle")
    .data(simNodes, d => d.id)
    .join("circle")
    .attr("class", "nn")
    .attr("r", NODE_R)
    .attr("fill", COL_NODE)
    .attr("stroke", "none")
    .style("cursor", "pointer")
    .on("mouseenter", onNodeEnter)
    .on("mousemove",  onNodeMove)
    .on("mouseleave", onNodeLeave)
    .on("click", onNodeClick)
    .call(
      d3.drag()
        .on("start", dragStart)
        .on("drag",  dragging)
        .on("end",   dragEnd)
    );

  // Draw labels
  const nodeLabels = gLabels.selectAll("text")
    .data(simNodes, d => d.id)
    .join("text")
    .attr("class", "nl")
    .attr("dy", "0.31em")
    .attr("x", NODE_R + 4)
    .text(d => d.title)
    .style("opacity", 0); // hidden until zoom threshold

  /* ── Zoom ────────────────────────────────────────────────────────────── */
  const zoom = d3.zoom()
    .scaleExtent([0.08, 8])
    .on("zoom", e => {
      currentTransform = e.transform;
      gRoot.attr("transform", e.transform);
      updateLabelVisibility();
      renderFrame();
    });

  svg.call(zoom);

  // Two-finger trackpad pan: wheel events with deltaX (horizontal component)
  // indicate a pan gesture rather than a zoom — translate instead of scale.
  svgEl.addEventListener("wheel", e => {
    if (e.ctrlKey) return; // pinch-to-zoom: let D3 handle it
    if (Math.abs(e.deltaX) < 2 && Math.abs(e.deltaY) >= Math.abs(e.deltaX) * 3) return; // mostly vertical → zoom
    e.preventDefault();
    const t = currentTransform.translate(-e.deltaX, -e.deltaY);
    svg.call(zoom.transform, t);
  }, { passive: false });

  /* ── Resize ──────────────────────────────────────────────────────────── */
  function resize() {
    const rect = container.getBoundingClientRect();
    width  = rect.width;
    height = rect.height;
    canvas.width  = width;
    canvas.height = height;
    svgEl.setAttribute("width",  width);
    svgEl.setAttribute("height", height);
    simulation.force("center", d3.forceCenter(0, 0));
  }

  window.addEventListener("resize", () => { resize(); renderFrame(); });
  resize();

  /* ── Layout management ───────────────────────────────────────────────── */
  function activeEdges() {
    const edges = [];
    if (showBL) raw.backlink_edges.forEach(e => edges.push({ ...e, kind: "bl" }));
    if (showSE) raw.semantic_edges.forEach(e => edges.push({ ...e, kind: "se" }));
    return edges;
  }

  // Returns target {x,y} for a node in the current mode
  function targetCoords(n) {
    if (showSE && !showBL && n.umap_x != null) {
      // Pure semantic → UMAP layout
      const margin = 0.85;
      const hw = (width  / 2) * margin;
      const hh = (height / 2) * margin;
      return { x: n.umap_x * hw, y: n.umap_y * hh };
    }
    // Force or mixed → keep current sim position (simulation owns it)
    return null;
  }

  function applyLayout(animate) {
    const edges = activeEdges();

    // Recompute which nodes have at least one active edge
    connectedIds = new Set();
    edges.forEach(e => {
      connectedIds.add(e.source?.id ?? e.source);
      connectedIds.add(e.target?.id ?? e.target);
    });

    // Compute per-node degree from active edges
    degreeMap = new Map(simNodes.map(n => [n.id, 0]));
    edges.forEach(e => {
      const src = e.source?.id ?? e.source;
      const tgt = e.target?.id ?? e.target;
      degreeMap.set(src, (degreeMap.get(src) || 0) + 1);
      degreeMap.set(tgt, (degreeMap.get(tgt) || 0) + 1);
    });
    maxDegree = Math.max(...degreeMap.values(), 1);

    // Update legend counts
    const totalNodes = simNodes.length;
    const connCount  = connectedIds.size;
    if (legendConnCnt)  legendConnCnt.textContent  = `(${connCount})`;
    if (legendUnconnCnt) legendUnconnCnt.textContent = `(${totalNodes - connCount})`;

    // Re-register forces so D3 re-evaluates strength per node with updated connectedIds
    const hasSplit = connectedIds.size > 0;
    simulation.force("charge", d3.forceManyBody()
      .strength(d => connectedIds.has(d.id) ? -200 : -60)
      .distanceMax(600));
    // Equal X and Y centripetal pull for unconnected → emergent circular cluster
    simulation.force("xSep", d3.forceX(d => (hasSplit && !connectedIds.has(d.id)) ? UNCONNECTED_X : 0)
      .strength(d => (hasSplit && !connectedIds.has(d.id)) ? 0.12 : 0.02));
    simulation.force("ySep", d3.forceY(0)
      .strength(d => (hasSplit && !connectedIds.has(d.id)) ? 0.12 : 0.02));

    if (showSE && !showBL) {
      // ── UMAP layout: freeze simulation, tween positions ────────────────
      simulation.stop();
      forceLink.links([]);

      if (animate) {
        const t = d3.transition().duration(TRANSITION_MS).ease(d3.easeCubicInOut);
        simNodes.forEach(n => {
          const tgt = targetCoords(n);
          if (!tgt) return;
          d3.select({}) // dummy selection to drive a tween
            .transition(t)
            .tween(`pos-${n.id}`, () => {
              const ix = d3.interpolateNumber(n.x, tgt.x);
              const iy = d3.interpolateNumber(n.y, tgt.y);
              return tt => { n.x = ix(tt); n.y = iy(tt); renderFrame(); };
            });
        });
      } else {
        simNodes.forEach(n => {
          const tgt = targetCoords(n);
          if (tgt) { n.x = tgt.x; n.y = tgt.y; }
        });
        renderFrame();
      }
    } else {
      // ── Force layout (backlinks, both, or neither) ─────────────────────
      forceLink
        .links(edges)
        .strength(e => e.kind === "bl" ? 0.35 : 0.12)
        .distance(e => e.kind === "bl" ? 66 : 108);

      simulation
        .force("link", forceLink)
        .alpha(FORCE_ALPHA)
        .restart();
    }
  }

  /* ── Canvas render (edges) ───────────────────────────────────────────── */
  function renderFrame() {
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.translate(currentTransform.x, currentTransform.y);
    ctx.scale(currentTransform.k, currentTransform.k);

    const selBLNbrs = selectedId ? blNeighbours.get(selectedId) : null;
    const selSENbrs = selectedId ? seNeighbours.get(selectedId) : null;

    const ARROW_LEN = 8;
    const ARROW_WID = 4;

    function drawEdges(edges, baseCol, directed) {
      edges.forEach(e => {
        const s = simById.get(e.source?.id ?? e.source);
        const t = simById.get(e.target?.id ?? e.target);
        if (!s || !t) return;

        const focusId = selectedId || hoveredId;
        let alpha = COL_EDGE_ALPHA;
        if (focusId) {
          const connected = (s.id === focusId || t.id === focusId);
          alpha = connected ? COL_EDGE_HI : 0.05;
        }

        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        const ux = dx / dist;
        const uy = dy / dist;
        const sim = e.similarity ?? 1;
        const color = baseCol + alpha + ")";
        const lw = 0.5 + sim * 0.5;

        if (directed) {
          // Tip sits at the edge of the target circle
          const tipX = t.x - ux * NODE_R;
          const tipY = t.y - uy * NODE_R;
          // Arrowhead base, ARROW_LEN back from tip
          const bx = tipX - ux * ARROW_LEN;
          const by = tipY - uy * ARROW_LEN;
          // Perpendicular offset for arrowhead width
          const px = -uy * ARROW_WID;
          const py =  ux * ARROW_WID;

          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(bx, by);
          ctx.strokeStyle = color;
          ctx.lineWidth = lw;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(bx + px, by + py);
          ctx.lineTo(bx - px, by - py);
          ctx.closePath();
          ctx.fillStyle = COL_BL_ARROW + alpha + ")";
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = color;
          ctx.lineWidth = lw;
          ctx.stroke();
        }
      });
    }

    // SE drawn first so BL lines + arrowheads render on top — prevents
    // a blue arrowhead sitting on a gold line when both edge types share a node pair
    if (showSE) drawEdges(
      (showSE && !showBL ? raw.semantic_edges : forceLink.links().filter(e => e.kind === "se")),
      COL_SE, false
    );
    if (showBL) drawEdges(forceLink.links().filter(e => e.kind === "bl"), COL_BL, true);

    ctx.restore();

    // Compute which nodes have at least one active edge
    const activeConnected = new Set();
    if (showBL) raw.backlink_edges.forEach(e => {
      activeConnected.add(e.source?.id ?? e.source);
      activeConnected.add(e.target?.id ?? e.target);
    });
    if (showSE) raw.semantic_edges.forEach(e => {
      activeConnected.add(e.source?.id ?? e.source);
      activeConnected.add(e.target?.id ?? e.target);
    });

    // Update SVG node colours
    const sq = searchQuery.toLowerCase();
    const focusId = selectedId || hoveredId;
    nodeCircles
      .attr("r", d => d.id === selectedId ? NODE_R_HOVER : NODE_R)
      .attr("fill", d => {
        if (focusId) {
          if (d.id === focusId) return COL_NODE_HI;
          const isNbr = blNeighbours.get(focusId)?.has(d.id)
                     || seNeighbours.get(focusId)?.has(d.id);
          return isNbr ? COL_NODE_NBRS : COL_NODE_DIM;
        }
        if (sq && !d.title.toLowerCase().includes(sq)) return COL_NODE_DIM;
        if (sq && d.title.toLowerCase().includes(sq)) return COL_NODE_SEARCH;
        if (!activeConnected.has(d.id)) return COL_NODE_DIM;
        const t = Math.sqrt((degreeMap.get(d.id) || 0) / maxDegree);
        return d3.interpolateRgb(COL_NODE, COL_NODE_HUB)(t);
      })
      .attr("stroke", d => (!focusId && !sq && !activeConnected.has(d.id)) ? "rgba(74,144,184,0.7)" : "none")
      .attr("stroke-dasharray", d => (!focusId && !sq && !activeConnected.has(d.id)) ? "4 3" : null)
      .attr("stroke-width", d => (!focusId && !sq && !activeConnected.has(d.id)) ? 1.5 : 0);

    // Update node positions
    nodeCircles.attr("cx", d => d.x).attr("cy", d => d.y);
    nodeLabels .attr("x",  d => d.x + NODE_R + 4).attr("y", d => d.y);

    updateLabelVisibility();
  }

  /* ── Label visibility ────────────────────────────────────────────────── */
  function updateLabelVisibility() {
    const k = currentTransform.k;
    const focusId = selectedId || hoveredId;

    // Build the focused node's full network (node + BL + SE neighbors)
    const focusNetwork = focusId ? new Set([
      focusId,
      ...(blNeighbours.get(focusId) || []),
      ...(seNeighbours.get(focusId) || []),
    ]) : null;

    nodeLabels.style("opacity", d => {
      // Always show labels for the focused node and its immediate network
      if (focusNetwork && focusNetwork.has(d.id)) return 1;

      // Everything else: zoom gate + cursor spotlight
      if (k < LABEL_MIN_ZOOM) return 0;
      // When something is selected, hide all non-network labels
      if (selectedId) return 0;
      if (cursorSX === null) return 0;
      const sx = d.x * k + currentTransform.x;
      const sy = d.y * k + currentTransform.y;
      const dist = Math.sqrt((sx - cursorSX) ** 2 + (sy - cursorSY) ** 2);
      if (dist >= LABEL_CURSOR_R) return 0;
      return Math.min(1, (1 - dist / LABEL_CURSOR_R) * 2.5);
    });
  }

  /* ── Fit-to-view ─────────────────────────────────────────────────────── */
  function fitView(animate) {
    if (!simNodes.length) return;
    const xs = simNodes.map(n => n.x);
    const ys = simNodes.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const gw   = maxX - minX || 1;
    const gh   = maxY - minY || 1;
    const pad  = 60;
    const k    = Math.min((width - pad * 2) / gw, (height - pad * 2) / gh, 4);
    const cx   = (minX + maxX) / 2;
    const cy   = (minY + maxY) / 2;
    const tx   = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(k)
      .translate(-cx, -cy);

    (animate
      ? svg.transition().duration(450).ease(d3.easeCubicOut)
      : svg
    ).call(zoom.transform, tx);
  }

  /* ── Node interactions ───────────────────────────────────────────────── */
  function onNodeEnter(event, d) {
    clearTimeout(hoverLeaveTimer);
    d3.select(this).attr("r", NODE_R_HOVER);
    svgEl.style.cursor = "pointer";
    hoveredId = d.id;
    renderFrame();
    if (d.id === selectedId) return;
    tooltip.innerHTML = `<div class="tt-title">${escHtml(d.title)}</div>`
      + (d.date ? `<div class="tt-date">${escHtml(d.date)}</div>` : "");
    positionTooltip(event);
    tooltip.classList.add("visible");
  }
  function onNodeMove(event) {
    positionTooltip(event);
  }
  function onNodeLeave(event, d) {
    if (d.id !== selectedId) d3.select(this).attr("r", NODE_R);
    svgEl.style.cursor = "";
    tooltip.classList.remove("visible");
    hoverLeaveTimer = setTimeout(() => {
      hoveredId = null;
      renderFrame();
    }, 80);
  }
  function positionTooltip(event) {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left + 14;
    const y = event.clientY - rect.top  - 10;
    // Flip left if too close to right edge
    const flip = x + 240 > rect.width;
    tooltip.style.left = flip ? `${x - 240}px` : `${x}px`;
    tooltip.style.top  = `${y}px`;
  }
  function zoomToNeighborhood(d) {
    const nbrIds = new Set([
      d.id,
      ...(blNeighbours.get(d.id) || []),
      ...(seNeighbours.get(d.id) || []),
    ]);
    const pts  = [...nbrIds].map(id => simById.get(id)).filter(Boolean);
    const xs   = pts.map(n => n.x), ys = pts.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad  = NODE_R * 4;
    const k    = Math.min(
      (width  - pad * 2) / (maxX - minX || 1),
      (height - pad * 2) / (maxY - minY || 1),
      2.5
    );
    const tx = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(k)
      .translate(-d.x, -d.y);
    svg.transition().duration(450).ease(d3.easeCubicOut).call(zoom.transform, tx);
  }

  function onNodeClick(event, d) {
    event.stopPropagation();
    tooltip.classList.remove("visible");
    hoveredId = null;

    if (clickTimer && clickTimer.id === d.id) {
      // Second click within 250ms on the same node → double-click: select + zoom
      clearTimeout(clickTimer.timer);
      clickTimer = null;
      selectedId = d.id;
      openSidebar(nodeById.get(selectedId));
      zoomToNeighborhood(d);
      renderFrame();
      return;
    }

    // Cancel any pending timer from a different node
    if (clickTimer) { clearTimeout(clickTimer.timer); clickTimer = null; }

    clickTimer = {
      id: d.id,
      timer: setTimeout(() => {
        clickTimer = null;
        // Single click: select/deselect + sidebar, no zoom
        selectedId = (selectedId === d.id) ? null : d.id;
        if (selectedId) openSidebar(nodeById.get(selectedId));
        else closeSidebar();
        renderFrame();
      }, 250),
    };
  }

  // Click on background → deselect
  svg.on("click", () => { selectedId = null; closeSidebar(); renderFrame(); });

  // Cursor tracking for proximity labels
  svg.on("mousemove.labels", e => {
    [cursorSX, cursorSY] = d3.pointer(e);
    updateLabelVisibility();
  }).on("mouseleave.labels", () => {
    cursorSX = null; cursorSY = null;
    updateLabelVisibility();
  });

  /* ── Drag ────────────────────────────────────────────────────────────── */
  function dragStart(event, d) {
    if (clickTimer) { clearTimeout(clickTimer.timer); clickTimer = null; }
    if (!event.active) simulation.alphaTarget(0.2).restart();
    d.fx = d.x; d.fy = d.y;
    svgEl.style.cursor = "grabbing";
  }
  function dragging(event, d) {
    d.fx = event.x; d.fy = event.y;
  }
  function dragEnd(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
    svgEl.style.cursor = "";
  }

  /* ── Sidebar ─────────────────────────────────────────────────────────── */
  function openSidebar(node) {
    if (!node) return;
    sbTitle.textContent = node.title;
    sbDate.textContent  = node.date || "";
    sbLink.href         = node.url;

    sbTags.innerHTML = (node.tags || [])
      .map(t => `<a href="/posts/all/?tags=${encodeURIComponent(t.toLowerCase())}" target="_blank" rel="noopener" class="badge text-bg-secondary text-decoration-none">${escHtml(t)}</a>`)
      .join("");

    sbDesc.textContent = node.description || "";

    const blInNbrs = [...(blInlinks.get(node.id)  || [])];
    const blOutNbrs = [...(blOutlinks.get(node.id) || [])];
    const seNbrs    = [...(seNeighbours.get(node.id) || [])];

    sbBLCnt.textContent = `(${blInNbrs.length})`;
    sbOLCnt.textContent = `(${blOutNbrs.length})`;
    sbSECnt.textContent = `(${seNbrs.length})`;

    sbBLDiv.innerHTML = renderNeighbourList(blInNbrs);
    sbOLDiv.innerHTML = renderNeighbourList(blOutNbrs);
    sbSEDiv.innerHTML = renderNeighbourList(seNbrs);

    [sbBLDiv, sbOLDiv, sbSEDiv].forEach(div => {
      div.querySelectorAll(".nbr-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          selectedId = id;
          openSidebar(nodeById.get(id));
          renderFrame();
        });
      });
    });

    sidebar.classList.add("open");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
  }

  function renderNeighbourList(ids) {
    if (!ids.length) return `<span class="sb-empty">None</span>`;
    return ids
      .map(id => {
        const n = nodeById.get(id);
        if (!n) return "";
        return `<button class="nbr-btn" data-id="${escAttr(id)}">${escHtml(n.title)}</button>`;
      })
      .join("");
  }

  sbClose.addEventListener("click", () => {
    selectedId = null;
    closeSidebar();
    renderFrame();
  });

  /* ── Controls ────────────────────────────────────────────────────────── */
  chkBL.addEventListener("change", () => {
    showBL = chkBL.checked;
    applyLayout(true);
  });
  chkSE.addEventListener("change", () => {
    showSE = chkSE.checked;
    applyLayout(true);
  });

  let searchTimer;
  searchEl.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = searchEl.value.trim();
      renderFrame();
    }, 120);
  });

  function panLoop() {
    const SPEED = 7; // screen-px per frame (~420px/s at 60fps)
    let dx = 0, dy = 0;
    if (heldPanKeys.has("ArrowLeft")  || heldPanKeys.has("a")) dx =  SPEED;
    if (heldPanKeys.has("ArrowRight") || heldPanKeys.has("d")) dx = -SPEED;
    if (heldPanKeys.has("ArrowUp")    || heldPanKeys.has("w")) dy =  SPEED;
    if (heldPanKeys.has("ArrowDown")  || heldPanKeys.has("s")) dy = -SPEED;
    if (dx || dy) {
      svg.call(zoom.translateBy, dx, dy);
      panRafId = requestAnimationFrame(panLoop);
    } else {
      panRafId = null;
    }
  }

  btnFit.addEventListener("click", () => fitView(true));

  document.addEventListener("keydown", e => {
    const inInput  = document.activeElement === searchEl;
    const noMods   = !e.metaKey && !e.ctrlKey && !e.altKey;
    const modalOpen = document.getElementById("graph-help-modal")?.classList.contains("show");

    if (e.key === "Escape") {
      selectedId = null;
      closeSidebar();
      renderFrame();
      return;
    }

    if (modalOpen || inInput || !noMods) return;

    if (e.key === "r") {
      fitView(true);
      return;
    }

    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      btnZoomIn.click();
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      btnZoomOut.click();
      return;
    }

    // WASD / arrow key panning — add to held set, rAF loop drives motion
    const PAN_KEYS = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","a","d","w","s"];
    if (PAN_KEYS.includes(e.key)) {
      e.preventDefault();
      heldPanKeys.add(e.key);
      if (!panRafId) panRafId = requestAnimationFrame(panLoop);
    }
  });

  document.addEventListener("keyup", e => {
    heldPanKeys.delete(e.key);
  });

  btnZoomIn.addEventListener("click",  () => svg.transition().duration(300).call(zoom.scaleBy, 1.5));
  btnZoomOut.addEventListener("click", () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.5));

  // Click ripple on all control bar buttons
  document.querySelectorAll("#graph-controls .btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const rect = btn.getBoundingClientRect();
      const size = Math.max(btn.offsetWidth, btn.offsetHeight);
      const el   = document.createElement("span");
      el.className  = "ctrl-ripple";
      el.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(el);
      el.addEventListener("animationend", () => el.remove());
    });
  });

  /* ── Init ────────────────────────────────────────────────────────────── */
  function init() {
    // Give the simulation a few ticks before revealing
    simulation.stop();

    // Run initial ticks synchronously so first render isn't a hairball
    const isMobile = window.innerWidth <= MOBILE_W;
    const initTicks = isMobile ? 80 : 150;

    applyLayout(false); // populates connectedIds and registers forces
    simulation.stop();

    // Pre-position nodes near their zone so sync ticks converge fast
    simNodes.forEach((n, i) => {
      if (connectedIds.has(n.id)) {
        const angle = (i / simNodes.length) * 2 * Math.PI;
        n.x = Math.cos(angle) * 150;
        n.y = Math.sin(angle) * 150;
      } else {
        n.x = UNCONNECTED_X + (Math.random() - 0.5) * 300;
        n.y = (Math.random() - 0.5) * 400;
      }
    });

    for (let i = 0; i < initTicks; i++) simulation.tick();
    renderFrame();
    fitView(false);

    // Fade out loading overlay
    loadingEl.classList.add("hidden");
    setTimeout(() => { loadingEl.style.display = "none"; }, 420);

    // Now let simulation run live
    simulation.alpha(0.25).restart();

    // After sim cools, do a final fit
    setTimeout(() => fitView(true), 2800);
  }

  // Small guard: if data is empty, show a message
  if (!raw.nodes.length) {
    loadingEl.textContent = "No graph data found — run scripts/generate_graph_data.py first.";
    return;
  }

  init();

  /* ── Utilities ───────────────────────────────────────────────────────── */
  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escAttr(s) {
    return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
})();
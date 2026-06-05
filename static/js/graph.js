(function () {
  "use strict";

  /* ── Constants ───────────────────────────────────────────────────────── */
  const NODE_R = 20; // base node radius
  const NODE_R_HOVER = 26;
  const LABEL_MIN_ZOOM = 0.4; // below this zoom labels are always hidden
  const LABEL_CURSOR_R = 150; // screen-px radius around cursor to reveal labels
  const TRANSITION_MS = 600; // layout morph duration
  const FORCE_ALPHA = 0.5; // simulation restart alpha
  const MOBILE_W = 600;
  const UNCONNECTED_X = -1000; // x target for unconnected cluster (to the left)

  // Edge colours — match CSS swatches
  const COL_BL = "rgba(94,190,210,";
  const COL_SE = "rgba(240,180,80,";
  const COL_BL_ARROW = "rgba(167,185,145,"; // blend of BL + SE — matches visual mix when edges overlap
  const COL_EDGE_ALPHA = 0.3;
  const COL_EDGE_HI = 0.75; // alpha when a neighbour is selected

  // Node colours
  const COL_NODE = "#4a90b8";
  const COL_NODE_HUB = "#a8e4ff"; // high-degree end of the degree gradient
  const COL_NODE_HI = "#e8c36a"; // selected
  const COL_NODE_NBRS = "#6bc8e0"; // neighbours of selected
  const COL_NODE_DIM = "rgba(74,144,184,0.15)";
  const COL_NODE_SEARCH = "#e8c36a";

  /* ── Data ────────────────────────────────────────────────────────────── */
  const raw = window.GRAPH_DATA || { nodes: [], backlink_edges: [], semantic_edges: [] };

  // Keyed maps for O(1) lookups
  const nodeById = new Map(raw.nodes.map((n) => [n.id, n]));
  const nodeByUrl = new Map(raw.nodes.map((n) => [n.url, n]));

  // Build adjacency: directed inlinks/outlinks + combined neighbour sets for dimming
  const blInlinks = new Map(raw.nodes.map((n) => [n.id, new Set()])); // edges where this node is target
  const blOutlinks = new Map(raw.nodes.map((n) => [n.id, new Set()])); // edges where this node is source
  const blNeighbours = new Map(raw.nodes.map((n) => [n.id, new Set()])); // undirected, for selection dimming
  const seNeighbours = new Map(raw.nodes.map((n) => [n.id, new Set()]));

  raw.backlink_edges.forEach((edge) => {
    blOutlinks.get(edge.source)?.add(edge.target);
    blInlinks.get(edge.target)?.add(edge.source);
    blNeighbours.get(edge.source)?.add(edge.target);
    blNeighbours.get(edge.target)?.add(edge.source);
  });
  raw.semantic_edges.forEach((edge) => {
    seNeighbours.get(edge.source)?.add(edge.target);
    seNeighbours.get(edge.target)?.add(edge.source);
  });

  /* ── DOM refs ────────────────────────────────────────────────────────── */
  const container = document.getElementById("graph-container");
  const canvas = document.getElementById("graph-canvas");
  const svgEl = document.getElementById("graph-svg");
  const loadingEl = document.getElementById("graph-loading");
  const chkBL = document.getElementById("chk-backlinks");
  const chkSE = document.getElementById("chk-semantic");
  const searchEl = document.getElementById("graph-search");
  const btnFit = document.getElementById("btn-fit");
  const sidebar = document.getElementById("graph-sidebar");
  const sbClose = document.getElementById("sb-close");
  const sbTitle = document.getElementById("sb-title");
  const sbDate = document.getElementById("sb-date");
  const sbTags = document.getElementById("sb-tags");
  const sbDesc = document.getElementById("sb-desc");
  const sbLink = document.getElementById("sb-link");
  const sbCopyLink = document.getElementById("sb-copy-link");
  const sbBLCnt = document.getElementById("sb-bl-cnt");
  const sbOLCnt = document.getElementById("sb-ol-cnt");
  const sbSECnt = document.getElementById("sb-se-cnt");
  const sbBLDiv = document.getElementById("sb-backlinks");
  const sbOLDiv = document.getElementById("sb-outlinks");
  const sbSEDiv = document.getElementById("sb-semantic");
  const btnZoomIn = document.getElementById("btn-zoom-in");
  const btnZoomOut = document.getElementById("btn-zoom-out");
  const btnFullscreen = document.getElementById("btn-fullscreen");
  const tooltip = document.getElementById("graph-tooltip");
  const legendConnCnt = document.getElementById("legend-connected-cnt");
  const legendUnconnCnt = document.getElementById("legend-unconnected-cnt");

  const ctx = canvas.getContext("2d");

  /* ── URL state ───────────────────────────────────────────────────────── */
  // `node` param is a post slug (e.g. "some-post").
  // Reconstruct the graph node URL as /posts/<slug> for the lookup.
  const _rawParam = new URLSearchParams(window.location.search).get("node");
  const deepLinkId = _rawParam
    ? (nodeById.has(_rawParam)
        ? _rawParam
        : nodeByUrl.get(`/posts/${_rawParam}`)?.id ?? null)
    : null;

  /* ── State ───────────────────────────────────────────────────────────── */
  let width = 0,
    height = 0;
  let currentTransform = d3.zoomIdentity;
  let selectedId = null;
  let searchQuery = "";
  let showBL = true;
  let showSE = true;
  let connectedIds = new Set();
  let degreeMap = new Map(); // node id → active edge count
  let maxDegree = 1;
  let hoveredId = null;
  let hoverLeaveTimer = null;
  let clickTimer = null; // { id, timer } — distinguishes single vs double click
  const heldPanKeys = new Set();
  let panRafId = null;
  let cursorSX = null,
    cursorSY = null; // cursor position in SVG screen space

  /* ── D3 simulation nodes (mutable, D3 attaches x/y/vx/vy) ───────────── */
  const simNodes = raw.nodes.map((n) => ({ ...n }));
  const simById = new Map(simNodes.map((n) => [n.id, n]));

  /* ── D3 force simulation ─────────────────────────────────────────────── */
  const forceLink = d3
    .forceLink([])
    .id((d) => d.id)
    .distance(60)
    .strength(0.3);

  const simulation = d3
    .forceSimulation(simNodes)
    .force("link", forceLink)
    .force("charge", d3.forceManyBody().strength(-80).distanceMax(360))
    .force("collide", d3.forceCollide(NODE_R * 1.2 + 2))
    .alphaDecay(0.025)
    .on("tick", renderFrame);

  /* ── SVG layer (nodes + labels) ──────────────────────────────────────── */
  const svg = d3.select(svgEl).attr("cursor", "grab");

  const gRoot = svg.append("g"); // receives zoom transform
  const gNodes = gRoot.append("g").attr("class", "nodes-g");
  const gLabels = gRoot.append("g").attr("class", "labels-g");

  // Draw node circles
  const nodeCircles = gNodes
    .selectAll("circle")
    .data(simNodes, (d) => d.id)
    .join("circle")
    .attr("class", "nn")
    .attr("r", NODE_R)
    .attr("fill", COL_NODE)
    .attr("stroke", "none")
    .style("cursor", "pointer")
    .on("mouseenter", onNodeEnter)
    .on("mousemove", onNodeMove)
    .on("mouseleave", onNodeLeave)
    .on("click", onNodeClick)
    .call(d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd));

  // Draw labels (hidden until zoom threshold or cursor proximity)
  const nodeLabels = gLabels
    .selectAll("text")
    .data(simNodes, (d) => d.id)
    .join("text")
    .attr("class", "nl")
    .attr("dy", "0.31em")
    .attr("x", NODE_R + 4)
    .text((d) => d.title)
    .style("opacity", 0);

  /* ── Zoom ────────────────────────────────────────────────────────────── */
  const zoom = d3
    .zoom()
    .scaleExtent([0.08, 8])
    .on("zoom", (e) => {
      currentTransform = e.transform;
      gRoot.attr("transform", e.transform);
      updateLabelVisibility();
      renderFrame();
    });

  svg.call(zoom);

  // Two-finger trackpad pan: wheel events with a significant horizontal component
  // indicate a pan gesture rather than a zoom — translate instead of scale.
  svgEl.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) return; // pinch-to-zoom: let D3 handle it
      if (Math.abs(e.deltaX) < 2 && Math.abs(e.deltaY) >= Math.abs(e.deltaX) * 3) return; // mostly vertical → zoom
      e.preventDefault();
      const t = currentTransform.translate(-e.deltaX, -e.deltaY);
      svg.call(zoom.transform, t);
    },
    { passive: false },
  );

  /* ── Resize ──────────────────────────────────────────────────────────── */
  /** Sync canvas and SVG dimensions to the container, then recentre forces. */
  function resize() {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width;
    canvas.height = height;
    svgEl.setAttribute("width", width);
    svgEl.setAttribute("height", height);
    simulation.force("center", d3.forceCenter(0, 0));
  }

  window.addEventListener("resize", () => {
    resize();
    renderFrame();
  });
  resize();

  /* ── Layout management ───────────────────────────────────────────────── */
  /** Returns all edges that are currently toggled on, tagged with their kind. */
  function activeEdges() {
    const edges = [];
    if (showBL) raw.backlink_edges.forEach((e) => edges.push({ ...e, kind: "bl" }));
    if (showSE) raw.semantic_edges.forEach((e) => edges.push({ ...e, kind: "se" }));
    return edges;
  }

  /**
   * Returns the target {x, y} for a node under the current display mode.
   * Returns null when the simulation owns positioning (force / mixed mode).
   */
  function targetCoords(node) {
    if (showSE && !showBL && node.umap_x != null) {
      // Pure semantic mode → use pre-computed UMAP coordinates
      const margin = 0.85;
      const halfW = (width / 2) * margin;
      const halfH = (height / 2) * margin;
      return { x: node.umap_x * halfW, y: node.umap_y * halfH };
    }
    // Force or mixed mode → simulation owns positions
    return null;
  }

  /**
   * Recomputes which nodes are connected, updates force parameters, and
   * either tweens to UMAP positions or restarts the force simulation.
   */
  function applyLayout(animate) {
    const edges = activeEdges();

    // Recompute which nodes have at least one active edge
    connectedIds = new Set();
    edges.forEach((edge) => {
      connectedIds.add(edge.source?.id ?? edge.source);
      connectedIds.add(edge.target?.id ?? edge.target);
    });

    // Compute per-node degree from active edges
    degreeMap = new Map(simNodes.map((n) => [n.id, 0]));
    edges.forEach((edge) => {
      const srcId = edge.source?.id ?? edge.source;
      const tgtId = edge.target?.id ?? edge.target;
      degreeMap.set(srcId, (degreeMap.get(srcId) || 0) + 1);
      degreeMap.set(tgtId, (degreeMap.get(tgtId) || 0) + 1);
    });
    maxDegree = Math.max(...degreeMap.values(), 1);

    // Update legend counts
    const totalNodes = simNodes.length;
    const connCount = connectedIds.size;
    if (legendConnCnt) legendConnCnt.textContent = `(${connCount})`;
    if (legendUnconnCnt) legendUnconnCnt.textContent = `(${totalNodes - connCount})`;

    // Re-register forces so D3 re-evaluates strength per node with updated connectedIds.
    // Connected nodes repel strongly; isolated nodes cluster loosely off to the side.
    const hasSplit = connectedIds.size > 0;
    simulation.force(
      "charge",
      d3
        .forceManyBody()
        .strength((d) => (connectedIds.has(d.id) ? -200 : -60))
        .distanceMax(600),
    );
    simulation.force(
      "xSep",
      d3
        .forceX((d) => (hasSplit && !connectedIds.has(d.id) ? UNCONNECTED_X : 0))
        .strength((d) => (hasSplit && !connectedIds.has(d.id) ? 0.12 : 0.02)),
    );
    simulation.force(
      "ySep",
      d3.forceY(0).strength((d) => (hasSplit && !connectedIds.has(d.id) ? 0.12 : 0.02)),
    );

    if (showSE && !showBL) {
      // ── UMAP layout: freeze simulation, tween nodes to their UMAP positions ──
      simulation.stop();
      forceLink.links([]);

      if (animate) {
        const transition = d3.transition().duration(TRANSITION_MS).ease(d3.easeCubicInOut);
        simNodes.forEach((node) => {
          const target = targetCoords(node);
          if (!target) return;
          d3.select({}) // dummy selection to drive a per-node tween
            .transition(transition)
            .tween(`pos-${node.id}`, () => {
              const interpX = d3.interpolateNumber(node.x, target.x);
              const interpY = d3.interpolateNumber(node.y, target.y);
              return (t) => {
                node.x = interpX(t);
                node.y = interpY(t);
                renderFrame();
              };
            });
        });
      } else {
        simNodes.forEach((node) => {
          const target = targetCoords(node);
          if (target) {
            node.x = target.x;
            node.y = target.y;
          }
        });
        renderFrame();
      }
    } else {
      // ── Force layout (backlinks, both, or neither) ────────────────────
      forceLink
        .links(edges)
        .strength((edge) => (edge.kind === "bl" ? 0.35 : 0.12))
        .distance((edge) => (edge.kind === "bl" ? 66 : 108));

      simulation.force("link", forceLink).alpha(FORCE_ALPHA).restart();
    }
  }

  /* ── Canvas render (edges) ───────────────────────────────────────────── */
  /** Clears the canvas and redraws all edges, then syncs SVG node positions and colours. */
  function renderFrame() {
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.translate(currentTransform.x, currentTransform.y);
    ctx.scale(currentTransform.k, currentTransform.k);

    const ARROW_LEN = 8;
    const ARROW_WID = 4;

    /**
     * Draws a set of edges onto the canvas.
     * @param {Array}   edges     - edge objects with source/target ids
     * @param {string}  baseColor - rgba prefix, e.g. "rgba(94,190,210,"
     * @param {boolean} directed  - whether to draw arrowheads
     */
    function drawEdges(edges, baseColor, directed) {
      edges.forEach((edge) => {
        const srcNode = simById.get(edge.source?.id ?? edge.source);
        const tgtNode = simById.get(edge.target?.id ?? edge.target);
        if (!srcNode || !tgtNode) return;

        // Dim edges that don't touch the focused node
        const focusId = selectedId || hoveredId;
        let alpha = COL_EDGE_ALPHA;
        if (focusId) {
          const touchesFocus = srcNode.id === focusId || tgtNode.id === focusId;
          alpha = touchesFocus ? COL_EDGE_HI : 0.05;
        }

        const deltaX = tgtNode.x - srcNode.x;
        const deltaY = tgtNode.y - srcNode.y;
        const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (dist === 0) return;

        // Unit vector from source to target
        const unitX = deltaX / dist;
        const unitY = deltaY / dist;

        const similarity = edge.similarity ?? 1;
        const color = baseColor + alpha + ")";
        const lineWidth = 0.5 + similarity * 0.5;

        if (directed) {
          // Arrowhead tip sits at the edge of the target circle
          const tipX = tgtNode.x - unitX * NODE_R;
          const tipY = tgtNode.y - unitY * NODE_R;

          // Arrowhead base, ARROW_LEN back from the tip
          const arrowBaseX = tipX - unitX * ARROW_LEN;
          const arrowBaseY = tipY - unitY * ARROW_LEN;

          // Perpendicular offset for arrowhead width
          const perpX = -unitY * ARROW_WID;
          const perpY = unitX * ARROW_WID;

          // Shaft from source to arrowhead base
          ctx.beginPath();
          ctx.moveTo(srcNode.x, srcNode.y);
          ctx.lineTo(arrowBaseX, arrowBaseY);
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.stroke();

          // Filled triangle arrowhead
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(arrowBaseX + perpX, arrowBaseY + perpY);
          ctx.lineTo(arrowBaseX - perpX, arrowBaseY - perpY);
          ctx.closePath();
          ctx.fillStyle = COL_BL_ARROW + alpha + ")";
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(srcNode.x, srcNode.y);
          ctx.lineTo(tgtNode.x, tgtNode.y);
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.stroke();
        }
      });
    }

    // SE drawn first so BL lines + arrowheads render on top — prevents a blue
    // arrowhead sitting on a gold line when both edge types share a node pair.
    if (showSE)
      drawEdges(
        showSE && !showBL ? raw.semantic_edges : forceLink.links().filter((e) => e.kind === "se"),
        COL_SE,
        false,
      );
    if (showBL)
      drawEdges(
        forceLink.links().filter((e) => e.kind === "bl"),
        COL_BL,
        true,
      );

    ctx.restore();

    // Build the set of nodes that have at least one active edge (for dimming unconnected nodes)
    const activeConnected = new Set();
    if (showBL)
      raw.backlink_edges.forEach((edge) => {
        activeConnected.add(edge.source?.id ?? edge.source);
        activeConnected.add(edge.target?.id ?? edge.target);
      });
    if (showSE)
      raw.semantic_edges.forEach((edge) => {
        activeConnected.add(edge.source?.id ?? edge.source);
        activeConnected.add(edge.target?.id ?? edge.target);
      });

    // Update SVG node colours based on selection, search, and degree
    const searchLower = searchQuery.toLowerCase();
    const focusId = selectedId || hoveredId;
    nodeCircles
      .attr("r", (d) => (d.id === selectedId ? NODE_R_HOVER : NODE_R))
      .attr("fill", (d) => {
        if (focusId) {
          if (d.id === focusId) return COL_NODE_HI;
          const isNeighbour =
            (showBL && blNeighbours.get(focusId)?.has(d.id)) ||
            (showSE && seNeighbours.get(focusId)?.has(d.id));
          return isNeighbour ? COL_NODE_NBRS : COL_NODE_DIM;
        }
        if (searchLower && !d.title.toLowerCase().includes(searchLower)) return COL_NODE_DIM;
        if (searchLower && d.title.toLowerCase().includes(searchLower)) return COL_NODE_SEARCH;
        if (!activeConnected.has(d.id)) return COL_NODE_DIM;

        // Colour connected nodes on a gradient from base to hub colour by degree
        const degreeRatio = Math.sqrt((degreeMap.get(d.id) || 0) / maxDegree);
        return d3.interpolateRgb(COL_NODE, COL_NODE_HUB)(degreeRatio);
      })
      .attr("stroke", (d) =>
        !focusId && !searchLower && !activeConnected.has(d.id) ? "rgba(74,144,184,0.7)" : "none",
      )
      .attr("stroke-dasharray", (d) =>
        !focusId && !searchLower && !activeConnected.has(d.id) ? "4 3" : null,
      )
      .attr("stroke-width", (d) =>
        !focusId && !searchLower && !activeConnected.has(d.id) ? 1.5 : 0,
      );

    // Sync SVG element positions to simulation coordinates
    nodeCircles.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
    nodeLabels.attr("x", (d) => d.x + NODE_R + 4).attr("y", (d) => d.y);

    updateLabelVisibility();
  }

  /* ── Label visibility ────────────────────────────────────────────────── */
  /**
   * Shows labels for the focused node's network, and fades in other labels
   * based on zoom level and cursor proximity.
   */
  function updateLabelVisibility() {
    const zoomScale = currentTransform.k;
    const focusId = selectedId || hoveredId;

    // Build the full network of the focused node (itself + all neighbours)
    const focusNetwork = focusId
      ? new Set([
          focusId,
          ...(showBL ? blNeighbours.get(focusId) || [] : []),
          ...(showSE ? seNeighbours.get(focusId) || [] : []),
        ])
      : null;

    nodeLabels.style("opacity", (d) => {
      // Always show labels for the focused node and its immediate network
      if (focusNetwork && focusNetwork.has(d.id)) return 1;

      // Below minimum zoom, hide all non-network labels entirely
      if (zoomScale < LABEL_MIN_ZOOM) return 0;
      // When a node is selected, hide all labels outside its network
      if (selectedId) return 0;
      if (cursorSX === null) return 0;

      // Fade in labels within cursor spotlight radius
      const screenX = d.x * zoomScale + currentTransform.x;
      const screenY = d.y * zoomScale + currentTransform.y;
      const distFromCursor = Math.sqrt((screenX - cursorSX) ** 2 + (screenY - cursorSY) ** 2);
      if (distFromCursor >= LABEL_CURSOR_R) return 0;
      return Math.min(1, (1 - distFromCursor / LABEL_CURSOR_R) * 2.5);
    });
  }

  /* ── Fit-to-view ─────────────────────────────────────────────────────── */
  /** Computes a zoom transform that fits all nodes within the viewport with padding. */
  function fitView(animate) {
    if (!simNodes.length) return;

    const xs = simNodes.map((n) => n.x);
    const ys = simNodes.map((n) => n.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);

    const graphW = maxX - minX || 1;
    const graphH = maxY - minY || 1;
    const pad = 60;
    const scale = Math.min((width - pad * 2) / graphW, (height - pad * 2) / graphH, 4);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);

    (animate ? svg.transition().duration(450).ease(d3.easeCubicOut) : svg).call(
      zoom.transform,
      transform,
    );
  }

  /* ── Node interactions ───────────────────────────────────────────────── */
  function onNodeEnter(event, d) {
    clearTimeout(hoverLeaveTimer);
    d3.select(this).attr("r", NODE_R_HOVER);
    svgEl.style.cursor = "pointer";
    hoveredId = d.id;
    renderFrame();

    if (d.id === selectedId) return;
    tooltip.innerHTML =
      `<div class="tt-title">${escHtml(d.title)}</div>` +
      (d.date ? `<div class="tt-date">${escHtml(d.date)}</div>` : "");
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

  /** Positions the tooltip near the cursor, flipping left if too close to the right edge. */
  function positionTooltip(event) {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left + 14;
    const y = event.clientY - rect.top - 10;
    const flipLeft = x + 240 > rect.width;
    tooltip.style.left = flipLeft ? `${x - 240}px` : `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  /** Zooms the viewport to fit the selected node and all its neighbours. */
  function zoomToNeighborhood(d) {
    const neighborIds = new Set([
      d.id,
      ...(blNeighbours.get(d.id) || []),
      ...(seNeighbours.get(d.id) || []),
    ]);
    const neighborNodes = [...neighborIds].map((id) => simById.get(id)).filter(Boolean);

    const xs = neighborNodes.map((n) => n.x);
    const ys = neighborNodes.map((n) => n.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);

    const pad = NODE_R * 4;
    const scale = Math.min(
      (width - pad * 2) / (maxX - minX || 1),
      (height - pad * 2) / (maxY - minY || 1),
      2.5,
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);

    svg.transition().duration(450).ease(d3.easeCubicOut).call(zoom.transform, transform);
  }

  /**
   * Handles single vs double click on a node.
   * Single click: select/deselect + open sidebar, no zoom.
   * Double click (within 250ms): select + open sidebar + zoom to neighbourhood.
   */
  function onNodeClick(event, d) {
    event.stopPropagation();
    tooltip.classList.remove("visible");
    hoveredId = null;

    if (clickTimer && clickTimer.id === d.id) {
      // Second click on the same node within 250ms → treat as double-click
      clearTimeout(clickTimer.timer);
      clickTimer = null;
      selectedId = d.id;
      openSidebar(nodeById.get(selectedId));
      zoomToNeighborhood(d);
      renderFrame();
      return;
    }

    // Cancel any pending timer from a different node
    if (clickTimer) {
      clearTimeout(clickTimer.timer);
      clickTimer = null;
    }

    clickTimer = {
      id: d.id,
      timer: setTimeout(() => {
        clickTimer = null;
        selectedId = selectedId === d.id ? null : d.id;
        if (selectedId) openSidebar(nodeById.get(selectedId));
        else closeSidebar();
        renderFrame();
      }, 250),
    };
  }

  // Click on background → deselect current node
  svg.on("click", () => {
    selectedId = null;
    closeSidebar();
    renderFrame();
  });

  // Track cursor position for the label proximity spotlight
  svg
    .on("mousemove.labels", (e) => {
      [cursorSX, cursorSY] = d3.pointer(e);
      updateLabelVisibility();
    })
    .on("mouseleave.labels", () => {
      cursorSX = null;
      cursorSY = null;
      updateLabelVisibility();
    });

  /* ── Drag ────────────────────────────────────────────────────────────── */
  function dragStart(event, d) {
    // Cancel any pending click timer so drag doesn't trigger a click
    if (clickTimer) {
      clearTimeout(clickTimer.timer);
      clickTimer = null;
    }
    if (!event.active) simulation.alphaTarget(0.2).restart();
    d.fx = d.x;
    d.fy = d.y;
    svgEl.style.cursor = "grabbing";
  }

  function dragging(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragEnd(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
    svgEl.style.cursor = "";
  }

  /* ── Sidebar ─────────────────────────────────────────────────────────── */
  /** Populates and opens the sidebar panel for the given node. */
  function openSidebar(node) {
    if (!node) return;

    sbTitle.textContent = node.title;
    sbDate.textContent = node.date || "";
    sbLink.href = node.url;
    sbDesc.textContent = node.description || "";

    const nodeSlug = node.url.split("/").filter(Boolean).pop();
    sbCopyLink.onclick = () => {
      const url = `${location.origin}/posts/graph/?node=${nodeSlug}`;
      navigator.clipboard.writeText(url).then(() => {
        sbCopyLink.textContent = "Copied!";
        setTimeout(() => (sbCopyLink.textContent = "Copy graph link"), 1500);
      });
    };

    sbTags.innerHTML = (node.tags || [])
      .map(
        (tag) =>
          `<a href="/posts/all/?tags=${encodeURIComponent(tag.toLowerCase())}" target="_blank" rel="noopener" class="badge text-bg-secondary text-decoration-none">${escHtml(tag)}</a>`,
      )
      .join("");

    const inlinkIds = [...(blInlinks.get(node.id) || [])];
    const outlinkIds = [...(blOutlinks.get(node.id) || [])];
    const semanticNeighborIds = [...(seNeighbours.get(node.id) || [])];

    sbBLCnt.textContent = `(${inlinkIds.length})`;
    sbOLCnt.textContent = `(${outlinkIds.length})`;
    sbSECnt.textContent = `(${semanticNeighborIds.length})`;

    sbBLDiv.innerHTML = renderNeighbourList(inlinkIds);
    sbOLDiv.innerHTML = renderNeighbourList(outlinkIds);
    sbSEDiv.innerHTML = renderNeighbourList(semanticNeighborIds);

    // Wire up neighbour buttons to select that node when clicked
    [sbBLDiv, sbOLDiv, sbSEDiv].forEach((div) => {
      div.querySelectorAll(".nbr-btn").forEach((btn) => {
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

  /** Renders a list of node IDs as clickable neighbour buttons. */
  function renderNeighbourList(ids) {
    if (!ids.length) return `<span class="sb-empty">None</span>`;
    return ids
      .map((id) => {
        const node = nodeById.get(id);
        if (!node) return "";
        return `<button class="nbr-btn" data-id="${escAttr(id)}">${escHtml(node.title)}</button>`;
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

  /** rAF loop that pans the viewport while arrow/WASD keys are held. */
  function panLoop() {
    const SPEED = 7; // screen-px per frame (~420px/s at 60fps)
    let dx = 0,
      dy = 0;
    if (heldPanKeys.has("ArrowLeft") || heldPanKeys.has("a")) dx = SPEED;
    if (heldPanKeys.has("ArrowRight") || heldPanKeys.has("d")) dx = -SPEED;
    if (heldPanKeys.has("ArrowUp") || heldPanKeys.has("w")) dy = SPEED;
    if (heldPanKeys.has("ArrowDown") || heldPanKeys.has("s")) dy = -SPEED;
    if (dx || dy) {
      svg.call(zoom.translateBy, dx, dy);
      panRafId = requestAnimationFrame(panLoop);
    } else {
      panRafId = null;
    }
  }

  btnFit.addEventListener("click", () => fitView(true));

  document.addEventListener("keydown", (e) => {
    const inInput = document.activeElement === searchEl;
    const noMods = !e.metaKey && !e.ctrlKey && !e.altKey;
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
    const PAN_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"];
    if (PAN_KEYS.includes(e.key)) {
      e.preventDefault();
      heldPanKeys.add(e.key);
      if (!panRafId) panRafId = requestAnimationFrame(panLoop);
    }
  });

  document.addEventListener("keyup", (e) => {
    heldPanKeys.delete(e.key);
  });

  btnZoomIn.addEventListener("click", () => svg.transition().duration(300).call(zoom.scaleBy, 1.5));
  btnZoomOut.addEventListener("click", () =>
    svg
      .transition()
      .duration(300)
      .call(zoom.scaleBy, 1 / 1.5),
  );

  // Click ripple effect on all control bar buttons
  document.querySelectorAll("#graph-controls .btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const rect = btn.getBoundingClientRect();
      const size = Math.max(btn.offsetWidth, btn.offsetHeight);
      const ripple = document.createElement("span");
      ripple.className = "ctrl-ripple";
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    });
  });

  /* ── Init ────────────────────────────────────────────────────────────── */
  /**
   * Runs synchronous simulation ticks before first render so the graph
   * doesn't appear as a hairball on load, then fades in and lets the
   * live simulation take over.
   */
  function init() {
    const isMobile = window.innerWidth <= MOBILE_W;
    const initTicks = isMobile ? 80 : 150;

    applyLayout(false); // populates connectedIds and registers forces
    simulation.stop();

    // Pre-position nodes near their intended zone so sync ticks converge faster
    simNodes.forEach((node, i) => {
      if (connectedIds.has(node.id)) {
        const angle = (i / simNodes.length) * 2 * Math.PI;
        node.x = Math.cos(angle) * 150;
        node.y = Math.sin(angle) * 150;
      } else {
        node.x = UNCONNECTED_X + (Math.random() - 0.5) * 300;
        node.y = (Math.random() - 0.5) * 400;
      }
    });

    for (let i = 0; i < initTicks; i++) simulation.tick();
    renderFrame();

    // If deep-linking, zoom to the node immediately after pre-ticks (positions are stable enough).
    // Otherwise fit all nodes and let the simulation cool before re-fitting.
    if (deepLinkId && simById.has(deepLinkId)) {
      selectedId = deepLinkId;
      openSidebar(nodeById.get(deepLinkId));
      zoomToNeighborhood(simById.get(deepLinkId));
      renderFrame();
    } else {
      fitView(false);
      simulation.on("end.init", () => {
        simulation.on("end.init", null);
        fitView(true);
      });
    }

    // Fade out loading overlay
    loadingEl.classList.add("hidden");
    setTimeout(() => {
      loadingEl.style.display = "none";
    }, 420);

    simulation.alpha(0.25).restart();
  }

  if (!raw.nodes.length) {
    loadingEl.textContent = "No graph data found — run scripts/generate_graph_data.py first.";
    return;
  }

  init();

  /* ── Fullscreen ──────────────────────────────────────────────────────── */
  /** Syncs the fullscreen button icon and hides/shows nav+footer in fullscreen mode. */
  function updateFullscreenIcon() {
    const icon = btnFullscreen.querySelector("i");
    const isFullscreen = !!document.fullscreenElement;
    const nav = document.querySelector("nav.navbar");
    const footer = document.querySelector("footer");

    icon.className = isFullscreen ? "bi bi-fullscreen-exit" : "bi bi-fullscreen";
    btnFullscreen.title = isFullscreen ? "Exit full screen" : "Toggle full screen";

    if (nav) nav.style.display = isFullscreen ? "none" : "";
    if (footer) footer.style.display = isFullscreen ? "none" : "";
    document.body.classList.toggle("graph-fullscreen", isFullscreen);
  }

  btnFullscreen.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener("fullscreenchange", updateFullscreenIcon);

  /* ── Utilities ───────────────────────────────────────────────────────── */
  /** Escapes a string for safe insertion into HTML content. */
  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Escapes a string for safe insertion into an HTML attribute value. */
  function escAttr(s) {
    return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
})();

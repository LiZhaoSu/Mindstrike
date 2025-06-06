// Mindmap Generator: Hybrid (vertical + banded horizontal) layout, clean, complete

function normalizeLine(line) {
  return line.replace(/[^a-zA-Z0-9' ]+/g, '').trim().toLowerCase();
}

const DISCOURSE_MARKERS = ["na", "la", "oh", "yeah", "woah", "hey", "uh", "woo", "ha", "mm"];

function isDiscourseMarkerLine(line, markerList=DISCOURSE_MARKERS) {
  const norm = normalizeLine(line);
  for (let marker of markerList) {
    const re = new RegExp(`^(${marker}[ -]?)+$`, "i");
    if (re.test(norm)) {
      const count = (norm.match(new RegExp(marker, "gi")) || []).length;
      return {marker, count};
    }
  }
  return null;
}

// Build the mindmap tree: hybrid layout with banding and correct child node logic
function buildMindmapTree(lyrics) {
  const rawLines = lyrics.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.match(/^\[.*\]$/));
  if (rawLines.length === 0) return { label: "Song", children: [] };

  // Discourse marker grouping
  const lines = [];
  for (let i = 0; i < rawLines.length; ++i) {
    const dm = isDiscourseMarkerLine(rawLines[i]);
    if (dm) {
      let count = dm.count;
      let j = i + 1;
      while (j < rawLines.length && isDiscourseMarkerLine(rawLines[j], [dm.marker])) {
        count += isDiscourseMarkerLine(rawLines[j], [dm.marker]).count;
        j++;
      }
      lines.push({ type: "discourse", label: dm.marker, big: true, count, idx: i });
      i = j - 1;
    } else {
      lines.push({ type: "lyric", label: rawLines[i], idx: i });
    }
  }

  function groupByStem(nodes, minCount = 2, stemWindow = [3,2]) {
    if (nodes.length <= 1) return nodes.map(n => ({ ...n }));

    for (let stemLen of stemWindow) {
      const stemGroups = {};
      nodes.forEach((node, idx) => {
        if (node.type === "lyric") {
          const words = node.label.trim().split(/\s+/);
          if (words.length >= stemLen) {
            const stem = words.slice(0, stemLen).join(" ").toLowerCase();
            if (!stemGroups[stem]) stemGroups[stem] = [];
            stemGroups[stem].push(idx);
          }
        }
      });
      const validStems = Object.entries(stemGroups)
        .filter(([stem, idxArr]) => idxArr.length >= minCount && idxArr.length < nodes.length);
      if (validStems.length > 0) {
        const usedIdx = new Set();
        const result = [];
        validStems.forEach(([stem, idxArr]) => {
          const seen = new Set();
          const children = [];
          idxArr.forEach(idx => {
            const node = nodes[idx];
            const words = node.label.trim().split(/\s+/);
            let suffix = words.slice(stemLen).join(" ");
            if (!suffix) suffix = "(...)";
            const normSuffix = normalizeLine(suffix);
            if (!seen.has(normSuffix)) {
              let childNode = { label: suffix };
              if (node.children) childNode.children = node.children;
              children.push(childNode);
              seen.add(normSuffix);
            }
          });
          // No banding here -- leave as children, let banding be handled at rendering
          result.push({ label: stem, children });
          idxArr.forEach(idx => usedIdx.add(idx));
        });
        nodes.forEach((node, idx) => {
          if (!usedIdx.has(idx)) {
            if (node.type === "lyric" || node.type === "discourse") result.push({ ...node });
          }
        });
        return result;
      }
    }
    return nodes.map(node => ({ ...node }));
  }

  function buildHybridTree(nodes) {
    if (!nodes || nodes.length === 0) return [];
    const grouped = groupByStem(nodes);
    return grouped.map(groupNode => {
      let node = { ...groupNode };
      if (node.children) {
        node.children = buildHybridTree(node.children);
      }
      return node;
    });
  }

  let title = "Song";
  for (const l of lines) {
    if (l.type === "lyric") {
      title = l.label;
      break;
    }
  }
  const children = buildHybridTree(lines);

  return { label: title, children };
}

// Helper: fit text to box, shrink font if needed
function fitText(text, maxW, baseSize, minSize) {
  if (!text) return { font: baseSize, lines: [""] };
  const estW = text.length * baseSize * 0.62 + 18;
  if (estW <= maxW) return { font: baseSize, lines: [text] };
  if (text.length > 18) {
    let idx = Math.floor(text.length / 2);
    for (let off = 0; off < 8; ++off) {
      if (text[idx - off] === " ") { idx = idx - off; break; }
      if (text[idx + off] === " ") { idx = idx + off; break; }
    }
    let lines = [text.slice(0, idx).trim(), text.slice(idx).trim()];
    let estW1 = Math.max(lines[0].length, lines[1].length) * baseSize * 0.62 + 18;
    if (estW1 <= maxW) return { font: baseSize, lines };
    let shrink = Math.max(minSize, baseSize * maxW / estW1);
    return { font: shrink, lines };
  }
  let shrink = Math.max(minSize, baseSize * maxW / estW);
  return { font: shrink, lines: [text] };
}

// --- Hybrid Layout: vertical progression, horizontal bands for children ---

function bandChildren(children) {
  // Given children array, split into bands of sqrt(children.length) height, bands are horizontal blocks
  if (!children || children.length === 0) return [];
  const bandHeight = Math.ceil(Math.sqrt(children.length));
  const bands = [];
  for (let i = 0; i < children.length; i += bandHeight) {
    bands.push(children.slice(i, i + bandHeight));
  }
  return bands;
}

function measureTree(node, opts) {
  const boxW = node.big ? 140 : (opts.branchBoxW || 220);
  const boxH = node.big ? 70 : (opts.branchBoxH || 46);
  if (!node.children || node.children.length === 0) {
    return { width: boxW, height: boxH, node, children: [], boxW, boxH };
  }
  // Band children
  const bands = bandChildren(node.children);
  let width = boxW;
  let height = boxH;
  const bandRects = [];
  let maxBandW = 0;
  bands.forEach(bandArr => {
    // This band: vertical stack of nodes
    let bandChildrenRects = bandArr.map(child => measureTree(child, opts));
    let bandW = Math.max(...bandChildrenRects.map(r => r.width));
    let bandH = bandChildrenRects.reduce((a, r) => a + r.height, 0) + (bandChildrenRects.length - 1) * opts.vSpacing;
    bandRects.push({
      children: bandChildrenRects,
      width: bandW,
      height: bandH,
    });
    maxBandW += bandW;
  });
  // Bands are arranged horizontally, each band's width is bandW, height is max in column
  let bandsSpacingW = (bands.length - 1) * opts.hSpacing;
  width = Math.max(boxW, bandRects.reduce((a, b) => a + b.width, 0) + bandsSpacingW);
  height = boxH + (bandRects.length > 0 ? opts.vSpacing + Math.max(...bandRects.map(b => b.height)) : 0);
  return {
    width, height, node, bands: bandRects, boxW, boxH
  };
}

function renderTree(x, y, rect, opts, elements, parentCenter = null) {
  const { node, bands, boxW, boxH } = rect;
  let nodeX = x + (rect.width - boxW) / 2;
  let nodeY = y;
  // Draw box and label
  elements.push(`<rect x="${nodeX}" y="${nodeY}" width="${boxW}" height="${boxH}" rx="9" fill="#fff" stroke="#222" stroke-width="2"/>`);
  let label = node.label || "";
  if (node.big && node.count > 1) label += ` ×${node.count}`;
  let fontSize = node.big ? 48 : 24;
  const fit = fitText(label, boxW - 18, fontSize, 13);
  if (fit.lines.length === 1) {
    elements.push(`<text x="${nodeX + boxW / 2}" y="${nodeY + boxH / 2 + fit.font / 3 - 4}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle" font-weight="${node.big ? "bold" : "normal"}">${fit.lines[0]}</text>`);
  } else {
    elements.push(`<text x="${nodeX + boxW / 2}" y="${nodeY + boxH / 2 - 4}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle" font-weight="${node.big ? "bold" : "normal"}">${fit.lines[0]}</text>`);
    elements.push(`<text x="${nodeX + boxW / 2}" y="${nodeY + boxH / 2 + fit.font + 2}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle" font-weight="${node.big ? "bold" : "normal"}">${fit.lines[1]}</text>`);
  }
  // Connect to parent
  if (parentCenter) {
    elements.push(`<path d="M${parentCenter.x} ${parentCenter.y} L${nodeX + boxW / 2} ${nodeY}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
  }
  // Render bands
  if (bands && bands.length > 0) {
    let totalBandsW = bands.reduce((a, b) => a + b.width, 0) + (bands.length - 1) * opts.hSpacing;
    let cx = x + (rect.width - totalBandsW) / 2;
    let cy = nodeY + boxH + opts.vSpacing;
    bands.forEach(band => {
      let bandY = cy;
      band.children.forEach(childRect => {
        renderTree(cx, bandY, childRect, opts, elements, {
          x: nodeX + boxW / 2,
          y: nodeY + boxH
        });
        bandY += childRect.height + opts.vSpacing;
      });
      cx += band.width + opts.hSpacing;
    });
  }
}

function renderMindmap(mindmap) {
  // Layout options
  const opts = {
    branchBoxW: 220, branchBoxH: 54,
    hSpacing: 38, vSpacing: 32
  };
  // Measure recursively
  const tree = measureTree(mindmap, opts);

  // SVG size
  let svgW = Math.max(tree.width + 80, 900);
  let svgH = tree.height + 100;
  let elements = [];
  // SVG marker
  const marker = `<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M2,2 L7,4 L2,6 L4,4 L2,2" style="fill: #222;" /></marker></defs>`;
  // Render tree recursively
  renderTree(40, 28, tree, opts, elements, null);
  // Surrounding box
  elements.push(`<rect x="10" y="10" width="${svgW - 20}" height="${svgH - 20}" rx="22" fill="none" stroke="#222" stroke-width="3"/>`);

  // Draggable SVG in a scrollable wrapper
  return `
  <div id="mindmapSvgWrapper" style="width:100%;height:700px;overflow:auto;cursor:grab;">
  <svg id="mindmapSvg" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="background:#efefef;user-select:none">${marker}${elements.join('\n')}</svg>
  </div>`;
}

function generateMindmap() {
  const lyrics = document.getElementById('lyricsInput').value;
  if (!lyrics.trim()) {
    document.getElementById('mindmapArea').innerHTML = '<p style="color:#c00">Please paste some lyrics first.</p>';
    return;
  }
  const mindmap = buildMindmapTree(lyrics);
  const svg = renderMindmap(mindmap);
  document.getElementById('mindmapArea').innerHTML = svg;

  // Add drag-to-pan logic
  setTimeout(() => {
    const wrapper = document.getElementById("mindmapSvgWrapper");
    const svgEl = document.getElementById("mindmapSvg");
    if (!wrapper || !svgEl) return;
    let isDown = false, startX = 0, startY = 0, scrollLeft = 0, scrollTop = 0;
    wrapper.onmousedown = function(e) {
      isDown = true;
      wrapper.style.cursor = 'grabbing';
      startX = e.pageX - wrapper.offsetLeft;
      startY = e.pageY - wrapper.offsetTop;
      scrollLeft = wrapper.scrollLeft;
      scrollTop = wrapper.scrollTop;
    };
    wrapper.onmouseleave = function() { isDown = false; wrapper.style.cursor = 'grab';};
    wrapper.onmouseup = function() { isDown = false; wrapper.style.cursor = 'grab';};
    wrapper.onmousemove = function(e) {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - wrapper.offsetLeft;
      const y = e.pageY - wrapper.offsetTop;
      wrapper.scrollLeft = scrollLeft - (x - startX);
      wrapper.scrollTop = scrollTop - (y - startY);
    };
  }, 100);
}

document.addEventListener("DOMContentLoaded", function() {
  const btn = document.getElementById('generateBtn');
  if (btn) {
    btn.addEventListener('click', generateMindmap);
  }
});
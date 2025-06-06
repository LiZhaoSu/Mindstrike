// Mindmap Generator: Hybrid, easy-to-follow arrows, vertical main flow

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

// --- Mindmap tree building as before ---

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
          result.push({ label: stem, band: children });
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
      if (node.band) {
        node.band = buildHybridTree(node.band);
      }
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

// --- Text fit helper ---

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
  if (!node.children && !node.band) {
    return { width: boxW, height: boxH, node, children: [], boxW, boxH };
  }
  if (node.band) {
    // Band nodes: horizontal row of nodes, then continue vertical flow below the band
    const bandRects = node.band.map(child => measureTree(child, opts));
    let totalBandW = bandRects.reduce((a, b) => a + b.width, 0) + (bandRects.length - 1) * opts.hSpacing;
    let bandH = Math.max(...bandRects.map(r => r.height));
    let width = Math.max(boxW, totalBandW);
    let height = boxH + opts.vSpacing + bandH;
    // Add extra vertical for .children below the band, if any
    let childrenRect = null;
    if (node.children && node.children.length > 0) {
      childrenRect = measureTree({label: null, children: node.children}, opts);
      height += opts.vSpacing + childrenRect.height;
      width = Math.max(width, childrenRect.width);
    }
    return {
      width, height, node, band: bandRects, childrenRect, boxW, boxH
    };
  }
  if (node.children && node.children.length > 0) {
    // Standard: children are a vertical stack
    let childrenRects = node.children.map(child => measureTree(child, opts));
    let width = Math.max(boxW, ...childrenRects.map(r => r.width));
    let height = boxH + opts.vSpacing + childrenRects.reduce((a, r) => a + r.height, 0) + (childrenRects.length - 1) * opts.vSpacing;
    return {
      width, height, node, children: childrenRects, boxW, boxH
    };
  }
  return { width: boxW, height: boxH, node, children: [], boxW, boxH };
}

function renderTree(x, y, rect, opts, elements, parentCenter = null) {
  const { node, children, band, childrenRect, boxW, boxH } = rect;
  let nodeX = x + (rect.width - boxW) / 2;
  let nodeY = y;

  // Draw box and label if not a null node
  if (node.label !== null) {
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
  }

  // Render band (horizontal row of nodes)
  if (band) {
    let totalBandW = band.reduce((a, b) => a + b.width, 0) + (band.length - 1) * opts.hSpacing;
    let bandStartX = x + (rect.width - totalBandW) / 2;
    let bandY = nodeY + boxH + opts.vSpacing;
    // Draw arrows from parent to each band node
    for (let i = 0, bcx = bandStartX; i < band.length; ++i) {
      let b = band[i];
      // Parent arrow to each child in band
      elements.push(`<path d="M${nodeX + boxW / 2} ${nodeY + boxH} L${bcx + b.width/2} ${bandY}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
      renderTree(bcx, bandY, b, opts, elements, null);
      bcx += b.width + opts.hSpacing;
    }
    // After band, continue single flow vertically from center of band
    if (childrenRect) {
      let bandCenterX = bandStartX + totalBandW / 2;
      let bandBottomY = bandY + Math.max(...band.map(b => b.height));
      // Arrow from band center down to next node
      elements.push(`<path d="M${bandCenterX} ${bandBottomY} L${bandCenterX} ${bandBottomY + opts.vSpacing}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
      renderTree(bandCenterX - childrenRect.width/2, bandBottomY + opts.vSpacing, childrenRect, opts, elements, null);
    }
    return;
  }

  // Render children (vertical stack)
  if (children && children.length > 0) {
    let cy = nodeY + boxH + opts.vSpacing;
    for (let i = 0; i < children.length; ++i) {
      let ch = children[i];
      let cx = x + (rect.width - ch.width) / 2;
      // Arrow from parent to first child only
      if (i === 0 && node.label !== null) {
        elements.push(`<path d="M${nodeX + boxW / 2} ${nodeY + boxH} L${cx + ch.width/2} ${cy}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
      }
      renderTree(cx, cy, ch, opts, elements, null);
      cy += ch.height + opts.vSpacing;
    }
  }
}

function renderMindmap(mindmap) {
  // Layout options
  const opts = {
    branchBoxW: 220, branchBoxH: 54,
    hSpacing: 38, vSpacing: 32
  };
  const tree = measureTree(mindmap, opts);

  let svgW = Math.max(tree.width + 80, 900);
  let svgH = tree.height + 100;
  let elements = [];
  const marker = `<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M2,2 L7,4 L2,6 L4,4 L2,2" style="fill: #222;" /></marker></defs>`;
  renderTree(40, 28, tree, opts, elements, null);
  elements.push(`<rect x="10" y="10" width="${svgW - 20}" height="${svgH - 20}" rx="22" fill="none" stroke="#222" stroke-width="3"/>`);

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
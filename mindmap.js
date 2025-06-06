// Mindmap Generator: Hybrid grid/branching with banding and robust child node logic

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

  // Recursively group by stems, and always emit a label for each node
  function groupByStem(nodes, minCount = 2, stemWindow = [3,2]) {
    if (nodes.length <= 1) return nodes.map(n => ({ ...n }));

    // Try to group by stems
    for (let stemLen of stemWindow) {
      // Find stems
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
      // Only keep stems with at least minCount lines and not all lines
      const validStems = Object.entries(stemGroups)
        .filter(([stem, idxArr]) => idxArr.length >= minCount && idxArr.length < nodes.length);
      if (validStems.length > 0) {
        const usedIdx = new Set();
        const result = [];
        validStems.forEach(([stem, idxArr]) => {
          // Deduplicate suffixes and skip blank/empty suffixes
          const seen = new Set();
          const children = [];
          idxArr.forEach(idx => {
            const node = nodes[idx];
            const words = node.label.trim().split(/\s+/);
            let suffix = words.slice(stemLen).join(" ");
            if (!suffix) suffix = "(...)";
            const normSuffix = normalizeLine(suffix);
            if (!seen.has(normSuffix)) {
              // Recursively group suffixes as new nodes (if possible)
              let childNode = { label: suffix };
              if (node.children) childNode.children = node.children;
              children.push(childNode);
              seen.add(normSuffix);
            }
          });
          // Banding: arrange children vertically in bands, each of height ~sqrt(count)
          let bandHeight = Math.ceil(Math.sqrt(children.length));
          let bands = [];
          for (let i = 0; i < children.length; i += bandHeight) {
            bands.push(children.slice(i, i + bandHeight));
          }
          // Each band's children should be stacked vertically, but the bands (if more than one) are laid out horizontally
          let bandNodes = bands.map(bandArr => ({
            label: null,
            isBand: true,
            children: bandArr
          }));
          // If only one band, flatten:
          if (bandNodes.length === 1) {
            result.push({ label: stem, children: bands[0] });
          } else {
            result.push({ label: stem, children: bandNodes });
          }
          idxArr.forEach(idx => usedIdx.add(idx));
        });
        // Add unused nodes as vertical nodes under this group
        nodes.forEach((node, idx) => {
          if (!usedIdx.has(idx)) {
            if (node.type === "lyric" || node.type === "discourse") result.push({ ...node });
          }
        });
        return result;
      }
    }
    // No valid stems, just return nodes (each with label)
    return nodes.map(node => ({ ...node }));
  }

  // Hybrid tree builder: each vertical level is a "band", children are laid out horizontally, then rejoined in the next band
  function buildHybridTree(nodes) {
    if (!nodes || nodes.length === 0) return [];
    // Group by stems at this level
    const grouped = groupByStem(nodes);
    // For each group, recursively process children
    return grouped.map(groupNode => {
      let node = { ...groupNode };
      // If isBand, just process band children vertically
      if (node.isBand && node.children) {
        node.children = node.children.map(child => buildHybridTree([child])[0]);
      } else if (node.children) {
        node.children = buildHybridTree(node.children);
      }
      return node;
    });
  }

  // The first lyric is the root
  let title = "Song";
  for (const l of lines) {
    if (l.type === "lyric") {
      title = l.label;
      break;
    }
  }
  // Build the hybrid tree for the rest
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

// Recursive layout: vertical bands, but child nodes in a band horizontally
function measureTree(node, opts) {
  // Returns { width, height, node, children: [ ... ] }
  const boxW = node.big ? 140 : (opts.branchBoxW || 220);
  const boxH = node.big ? 70 : (opts.branchBoxH || 46);

  // If isBand, children are stacked vertically, else children are horizontal band
  if (node.isBand && node.children && node.children.length) {
    // Stack all band children vertically
    let widths = [];
    let height = 0;
    let childrenRects = node.children.map(child => {
      let rect = measureTree(child, opts);
      widths.push(rect.width);
      height += rect.height + opts.vSpacing;
      return rect;
    });
    height -= opts.vSpacing; // no vspacing after last
    let width = Math.max(...widths, boxW);
    return { width, height, node, children: childrenRects, boxW, boxH, isBand: true };
  }
  if (!node.children || node.children.length === 0) {
    return { width: boxW, height: boxH, node, children: [], boxW, boxH };
  }
  // Children: arrange horizontally (band)
  let childrenRects = node.children.map(child => measureTree(child, opts));
  const hSpacing = opts.hSpacing;
  const totalChildrenWidth =
    childrenRects.reduce((a, b) => a + b.width, 0) +
    hSpacing * (childrenRects.length - 1);
  const width = Math.max(boxW, totalChildrenWidth);
  const height = boxH + (childrenRects.length > 0 ? opts.vSpacing + Math.max(...childrenRects.map(c => c.height)) : 0);
  return {
    width, height, node, children: childrenRects, boxW, boxH, isBand: false
  };
}

// Render tree: hybrid vertical/horizontal bands, no blank nodes
function renderTree(x, y, rect, opts, elements, parentCenter = null) {
  const { node, children, boxW, boxH, isBand } = rect;
  // Center current node horizontally above its children (or align for band)
  let nodeX = x + (rect.width - boxW) / 2;
  let nodeY = y;
  // Draw box and label (skip for isBand)
  if (!isBand) {
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
  // Children
  if (children && children.length > 0) {
    if (isBand) {
      // Stack children vertically (band)
      let cy = nodeY;
      children.forEach(childRect => {
        renderTree(x, cy, childRect, opts, elements, parentCenter);
        cy += childRect.height + opts.vSpacing;
      });
    } else {
      // Layout children horizontally (band)
      let cx = x;
      let cy = nodeY + boxH + opts.vSpacing;
      children.forEach(childRect => {
        renderTree(cx, cy, childRect, opts, elements, {
          x: nodeX + boxW / 2,
          y: nodeY + boxH
        });
        cx += childRect.width + opts.hSpacing;
      });
    }
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
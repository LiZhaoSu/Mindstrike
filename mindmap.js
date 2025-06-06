// Mindmap Generator: maximal prefix merging, repeated line handling, vertical flow

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

// Maximal common prefix of arrays of words
function maximalCommonPrefixArr(arrs) {
  if (!arrs.length) return [];
  let prefix = [];
  let idx = 0;
  while (true) {
    const word = arrs[0][idx];
    if (word === undefined) break;
    if (arrs.every(a => a[idx] === word)) {
      prefix.push(word);
      idx++;
    } else {
      break;
    }
  }
  return prefix;
}

// Build the mindmap tree: maximal merging, repeated line handling
function buildMindmapTree(lyrics) {
  const rawLines = lyrics.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.match(/^\[.*\]$/));
  if (rawLines.length === 0) return { label: "Song", children: [] };

  // Index to handle repeated lines
  const freq = {};
  rawLines.forEach(line => {
    const norm = normalizeLine(line);
    if (!freq[norm]) freq[norm] = 0;
    freq[norm]++;
  });
  const seen = {}; // for tracking first occurrences

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

  // Recursively merge with repeat handling
  function mergeNodes(nodes) {
    if (nodes.length === 0) return [];
    // If all are discourse nodes, emit as is
    if (nodes.every(n => n.type === "discourse")) {
      return nodes.map(n => ({ ...n }));
    }
    // Filter out discourse nodes, process lyrics
    const lyrics = nodes.filter(n => n.type !== "discourse");
    const discourse = nodes.filter(n => n.type === "discourse");
    if (lyrics.length === 0) return discourse.map(n => ({ ...n }));

    // Handle repeats: if a line has already been placed, emit a repeat marker instead
    const lyricGroups = {};
    lyrics.forEach(n => {
      const norm = normalizeLine(n.label);
      if (!lyricGroups[norm]) lyricGroups[norm] = [];
      lyricGroups[norm].push(n);
    });

    // Reference node for repeats
    function makeRefNode(label) {
      return { label: label, repeatRef: true };
    }

    // Remove duplicates, but keep references for repeats
    const uniqueLyrics = [];
    Object.values(lyricGroups).forEach(group => {
      const line = group[0].label;
      const norm = normalizeLine(line);
      if (!seen[norm]) {
        seen[norm] = true;
        uniqueLyrics.push(group[0]);
      } else {
        // This is a repeated line, add a reference node
        uniqueLyrics.push(makeRefNode(line));
      }
    });

    // Merge as much as possible using maximal common prefix
    if (uniqueLyrics.length === 1) {
      // Only one unique lyric, emit it (and any discourse markers after)
      const lyricNode = uniqueLyrics[0].repeatRef
        ? { label: uniqueLyrics[0].label, repeatRef: true }
        : { label: uniqueLyrics[0].label };
      return [
        lyricNode,
        ...discourse.map(n => ({ ...n }))
      ];
    }

    // Find maximal common prefix
    const splitArrs = uniqueLyrics.map(n => n.label.trim().split(/\s+/));
    const prefix = maximalCommonPrefixArr(splitArrs);

    if (prefix.length === 0) {
      // No merge possible, emit each as vertical node (with repeat markers as needed)
      return [
        ...uniqueLyrics.map(n =>
          n.repeatRef ? { label: n.label, repeatRef: true } : { label: n.label }
        ),
        ...discourse.map(n => ({ ...n }))
      ];
    }

    // Group by the word after the prefix
    const groups = {};
    uniqueLyrics.forEach(n => {
      const words = n.label.trim().split(/\s+/);
      const suffixArr = words.slice(prefix.length);
      const key = suffixArr.length === 0 ? "…" : suffixArr[0];
      if (!groups[key]) groups[key] = [];
      // If this is a repeat reference node, pass along the repeatRef property
      if (n.repeatRef) {
        groups[key].push({ label: suffixArr.join(" ") || "(...)", repeatRef: true });
      } else {
        groups[key].push({
          label: suffixArr.join(" ") || "(...)"
        });
      }
    });

    // Compose node for the prefix, with children as horizontal bands
    const children = Object.values(groups).map(groupArr => mergeNodes(groupArr)[0]);
    // Place discourse nodes as their own children at the end (to maintain order)
    discourse.forEach(dn => children.push({ ...dn }));

    return [{
      label: prefix.join(" "),
      children
    }];
  }

  // Build tree
  const tree = mergeNodes(lines);

  // Use first lyric as root if possible
  let title = "Song";
  for (const n of lines) {
    if (n.type === "lyric") {
      title = n.label;
      break;
    }
  }
  // If tree[0].label == title, use its children as root's children
  if (tree.length === 1 && tree[0].label === title && tree[0].children) {
    return { label: title, children: tree[0].children };
  }
  return { label: title, children: tree };
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

// --- Hybrid Layout: vertical main flow, horizontal children with wrapping ---

function wrapChildren(children, maxPerRow = 4) {
  if (!children || children.length === 0) return [];
  const rows = [];
  for (let i = 0; i < children.length; i += maxPerRow) {
    rows.push(children.slice(i, i + maxPerRow));
  }
  return rows;
}

function measureTree(node, opts) {
  const boxW = node.big ? 140 : (opts.branchBoxW || 220);
  const boxH = node.big ? 70 : (opts.branchBoxH || 46);
  if (!node.children || node.children.length === 0) {
    return { width: boxW, height: boxH, node, childrenRows: [], boxW, boxH };
  }
  const maxPerRow = 4;
  const rows = wrapChildren(node.children, maxPerRow);
  const childrenRows = rows.map(row =>
    row.map(child => measureTree(child, opts))
  );
  const rowWidths = childrenRows.map(rowRects =>
    rowRects.reduce((a, b) => a + b.width, 0) + (rowRects.length - 1) * opts.hSpacing
  );
  const rowHeights = childrenRows.map(rowRects =>
    Math.max(...rowRects.map(r => r.height))
  );
  const bandW = Math.max(boxW, ...rowWidths);
  const bandH = rowHeights.reduce((a, h) => a + h, 0) + (rowHeights.length - 1) * opts.vSpacing;
  const width = bandW;
  const height = boxH + (childrenRows.length > 0 ? opts.vSpacing + bandH : 0);
  return {
    width, height, node, childrenRows, rowWidths, rowHeights, boxW, boxH
  };
}

function renderTree(x, y, rect, opts, elements, parentCenter = null) {
  const { node, childrenRows, rowWidths, rowHeights, boxW, boxH } = rect;
  let nodeX = x + (rect.width - boxW) / 2;
  let nodeY = y;
  // Draw box and label
  let boxStroke = node.repeatRef ? "#888" : "#222";
  let boxDash = node.repeatRef ? 'stroke-dasharray="7,5"' : "";
  elements.push(`<rect x="${nodeX}" y="${nodeY}" width="${boxW}" height="${boxH}" rx="9" fill="#fff" stroke="${boxStroke}" stroke-width="2" ${boxDash}/>`);
  let label = node.label || "";
  if (node.big && node.count > 1) label += ` ×${node.count}`;
  if (node.repeatRef) label += " ↺";
  let fontSize = node.big ? 48 : 24;
  const fit = fitText(label, boxW - 18, fontSize, 13);
  if (fit.lines.length === 1) {
    elements.push(`<text x="${nodeX + boxW / 2}" y="${nodeY + boxH / 2 + fit.font / 3 - 4}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle" font-weight="${node.big ? "bold" : node.repeatRef ? "bold" : "normal"}" fill="${node.repeatRef ? "#888" : "#222"}">${fit.lines[0]}</text>`);
  } else {
    elements.push(`<text x="${nodeX + boxW / 2}" y="${nodeY + boxH / 2 - 4}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle" font-weight="${node.big ? "bold" : node.repeatRef ? "bold" : "normal"}" fill="${node.repeatRef ? "#888" : "#222"}">${fit.lines[0]}</text>`);
    elements.push(`<text x="${nodeX + boxW / 2}" y="${nodeY + boxH / 2 + fit.font + 2}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle" font-weight="${node.big ? "bold" : node.repeatRef ? "bold" : "normal"}" fill="${node.repeatRef ? "#888" : "#222"}">${fit.lines[1]}</text>`);
  }
  // Connect to parent
  if (parentCenter) {
    elements.push(`<path d="M${parentCenter.x} ${parentCenter.y} L${nodeX + boxW / 2} ${nodeY}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
  }
  // Render children in rows
  if (childrenRows && childrenRows.length > 0) {
    let cy = nodeY + boxH + opts.vSpacing;
    for (let r = 0; r < childrenRows.length; ++r) {
      let row = childrenRows[r];
      let rowW = rowWidths[r];
      let rowH = rowHeights[r];
      let cx = x + (rect.width - rowW) / 2;
      for (let i = 0; i < row.length; ++i) {
        let ch = row[i];
        elements.push(`<path d="M${nodeX + boxW / 2} ${nodeY + boxH} L${cx + ch.width/2} ${cy}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
        renderTree(cx, cy, ch, opts, elements, null);
        cx += ch.width + opts.hSpacing;
      }
      cy += rowH + opts.vSpacing;
    }
  }
}

function renderMindmap(mindmap) {
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
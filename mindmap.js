// Mindmap Generator: Always Sings the Whole Song

function normalizeLine(line) {
  // Remove punctuation, trim and lowercase
  return line.replace(/[^a-zA-Z0-9' ]+/g, '').trim().toLowerCase();
}

const DISCOURSE_MARKERS = ["na", "la", "oh", "yeah", "woah", "hey", "uh", "woo", "ha", "mm"];

// Detects if the line is a sequence of a discourse marker (e.g. "na na na na")
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

// Parse lyrics into a sequence of nodes, grouping discourse marker blocks, and marking repeated lines (optional)
function parseLyricsToNodes(lyrics) {
  const lines = lyrics.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.match(/^\[.*\]$/));
  const nodes = [];
  const seenLines = {}; // for repeated line detection
  let lastDiscourse = null;

  for (let i = 0; i < lines.length; ++i) {
    const line = lines[i];
    const dm = isDiscourseMarkerLine(line);
    if (dm) {
      // Group consecutive discourse marker lines into one node, count total
      let count = dm.count;
      let j = i + 1;
      while (j < lines.length && isDiscourseMarkerLine(lines[j], [dm.marker])) {
        count += isDiscourseMarkerLine(lines[j], [dm.marker]).count;
        j++;
      }
      nodes.push({
        type: "discourse",
        marker: dm.marker,
        count: count
      });
      i = j - 1;
      lastDiscourse = dm.marker;
      continue;
    }

    // Optionally, detect repeated lines (could be rendered as references)
    const norm = normalizeLine(line);
    let isRepeat = false;
    if (seenLines[norm]) {
      isRepeat = true;
      seenLines[norm].push(nodes.length);
    } else {
      seenLines[norm] = [nodes.length];
    }

    nodes.push({
      type: "lyric",
      text: line,
      repeat: isRepeat,
      origIndex: i
    });
    lastDiscourse = null;
  }
  return nodes;
}

// Build a linear mindmap tree from parsed nodes
function buildMindmapTree(lyrics) {
  const nodes = parseLyricsToNodes(lyrics);
  // The tree is a top-level "Song Title" node, with children as the sequence of lyric/discourse nodes
  // If the first line is not a "title", use the first line as the title, otherwise take first non-empty line
  let title = "";
  const allLines = lyrics.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  if (allLines.length > 0 && allLines[0].length > 0) {
    title = allLines[0];
  } else {
    title = "Song";
  }
  return {
    main: title,
    sequence: nodes
  };
}

// SVG Renderer for linear lyrics mindmap
function renderMindmap(mindmap) {
  // Layout: vertical tree, root at top, each line/discourse node in order
  const svgNS = 'http://www.w3.org/2000/svg';
  const rootW = 500, rootH = 72;
  const nodeW = 370, nodeH = 48;
  const nodePadY = 26;
  const nodeFont = 22;
  const discourseFont = 44;
  const repeatFont = 18;

  let svgW = 950;
  let svgH = rootH + mindmap.sequence.length * (nodeH + nodePadY) + 100;

  let elements = [];
  // Root node
  let rootX = svgW / 2 - rootW / 2, rootY = 32;
  elements.push(`<rect x="${rootX}" y="${rootY}" width="${rootW}" height="${rootH}" rx="12" fill="#fff" stroke="#222" stroke-width="2"/>`);
  elements.push(`<text x="${rootX + rootW / 2}" y="${rootY + rootH / 2 + 20}" font-size="54" font-family="sans-serif" text-anchor="middle" font-weight="bold">${mindmap.main}</text>`);

  // Sequential nodes
  let prevX = rootX + rootW / 2, prevY = rootY + rootH;
  let nodeX = rootX + 50;
  let nodeStartY = rootY + rootH + 18;
  mindmap.sequence.forEach((node, idx) => {
    let y = nodeStartY + idx * (nodeH + nodePadY);
    let label = "";
    let fontSize = nodeFont;
    let boxW = nodeW;
    let fontWeight = "normal";
    let extra = "";

    if (node.type === "discourse") {
      label = node.marker;
      fontSize = discourseFont;
      fontWeight = "bold";
      boxW = 130;
      if (node.count > 1)
        extra = `<text x="${nodeX + boxW / 2}" y="${y + nodeH / 2 + 28}" font-size="${repeatFont}" font-family="sans-serif" text-anchor="middle" fill="#444">×${node.count}</text>`;
    } else if (node.type === "lyric") {
      label = node.text;
      if (node.repeat)
        extra = `<text x="${nodeX + boxW - 20}" y="${y + nodeH / 2 + 10}" font-size="${repeatFont}" font-family="sans-serif" text-anchor="end" fill="#888">↺</text>`;
    }

    // Node box
    elements.push(`<rect x="${nodeX}" y="${y}" width="${boxW}" height="${nodeH}" rx="9" fill="#fff" stroke="#222" stroke-width="2"/>`);
    // Text
    elements.push(`<text x="${nodeX + boxW / 2}" y="${y + nodeH / 2 + fontSize / 3 - 4}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" font-weight="${fontWeight}">${label}</text>`);
    // Extra (repeat or count)
    if (extra) elements.push(extra);

    // Connector from previous node
    if (idx === 0) {
      // From root to first node
      elements.push(`<path d="M${prevX} ${prevY} L${nodeX + boxW / 2} ${y}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
    } else {
      // From previous node to this node
      let prevYBox = nodeStartY + (idx - 1) * (nodeH + nodePadY) + nodeH;
      elements.push(`<path d="M${nodeX + boxW / 2} ${prevYBox} L${nodeX + boxW / 2} ${y}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
    }
  });

  // Surrounding box
  elements.push(`<rect x="${rootX - 34}" y="${rootY - 20}" width="${svgW - rootX + 10}" height="${svgH - rootY + 10}" rx="22" fill="none" stroke="#222" stroke-width="3"/>`);

  // SVG marker
  const marker = `<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M2,2 L7,4 L2,6 L4,4 L2,2" style="fill: #222;" /></marker></defs>`;
  return `<svg width="${svgW}" height="${svgH}" xmlns="${svgNS}" style="background:#efefef">${marker}${elements.join('\n')}</svg>`;
}

// Main entry point
function generateMindmap() {
  const lyrics = document.getElementById('lyricsInput').value;
  if (!lyrics.trim()) {
    document.getElementById('mindmapArea').innerHTML = '<p style="color:#c00">Please paste some lyrics first.</p>';
    return;
  }
  const mindmap = buildMindmapTree(lyrics);
  const svg = renderMindmap(mindmap);
  document.getElementById('mindmapArea').innerHTML = svg;
}

// Attach event listener after DOM is ready
document.addEventListener("DOMContentLoaded", function() {
  const btn = document.getElementById('generateBtn');
  if (btn) {
    btn.addEventListener('click', generateMindmap);
  }
});
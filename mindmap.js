// Mindmap Generator: Lyrics Branching for Repeats and Parallel Verses

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

// Detect repeated blocks in lyrics (returns array of block {start, end, length, textArr})
function findRepeatedBlocks(lines, minBlockLen=2) {
  // Find repeated blocks (naive approach, but enough for song lyrics)
  const blocks = [];
  const seenBlocks = {};
  for (let blockLen = Math.max(minBlockLen, 2); blockLen <= 6; blockLen++) {
    for (let i = 0; i <= lines.length - blockLen; i++) {
      const block = lines.slice(i, i + blockLen).map(normalizeLine).join("\n");
      if (!seenBlocks[block]) {
        seenBlocks[block] = [i];
      } else {
        seenBlocks[block].push(i);
      }
    }
  }
  // Collect blocks that repeat (appear in 2+ different positions, not overlapping)
  Object.entries(seenBlocks).forEach(([block, indices]) => {
    if (indices.length > 1) {
      // Avoid overlapping blocks and duplicates
      indices.forEach(idx => {
        // Check if block already overlaps with one in blocks[]
        let overlaps = blocks.some(b => {
          return (
            (idx >= b.start && idx < b.end) ||
            (b.start >= idx && b.start < idx + block.split("\n").length)
          );
        });
        if (!overlaps) {
          blocks.push({
            start: idx,
            end: idx + block.split("\n").length,
            length: block.split("\n").length,
            textArr: block.split("\n"),
            block
          });
        }
      });
    }
  });
  // Sort by start index
  blocks.sort((a, b) => a.start - b.start);
  return blocks;
}

// Detect stems (common line beginnings) for partial repeat branches
function detectStems(lines, minCount=2, minWords=2) {
  const stemMap = {};
  lines.forEach((line, idx) => {
    const words = line.trim().split(/\s+/);
    if (words.length >= minWords) {
      const stem = words.slice(0, minWords).join(" ").toLowerCase();
      if (!stemMap[stem]) stemMap[stem] = [];
      stemMap[stem].push(idx);
    }
  });
  // Only keep stems with at least minCount lines
  return Object.entries(stemMap)
    .filter(([stem, idxArr]) => idxArr.length >= minCount)
    .map(([stem, idxArr]) => ({ stem, idxArr }));
}

// Build a tree structure for the mindmap: root is title, branches for repeated/parallel parts
function buildBranchingMindmapTree(lyrics) {
  const rawLines = lyrics.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.match(/^\[.*\]$/));
  if (rawLines.length === 0) return { main: "Song", branches: [] };
  
  // Find and group discourse marker lines
  const lines = [];
  for (let i = 0; i < rawLines.length; ++i) {
    const dm = isDiscourseMarkerLine(rawLines[i]);
    if (dm) {
      // Group consecutive same marker lines
      let count = dm.count;
      let j = i + 1;
      while (j < rawLines.length && isDiscourseMarkerLine(rawLines[j], [dm.marker])) {
        count += isDiscourseMarkerLine(rawLines[j], [dm.marker]).count;
        j++;
      }
      lines.push({ type: "discourse", marker: dm.marker, count, idx: i });
      i = j - 1;
    } else {
      lines.push({ type: "lyric", text: rawLines[i], idx: i });
    }
  }

  // Use the first line as title if it's not a discourse marker
  const title = (lines[0].type === "lyric") ? lines[0].text : "Song";

  // Find repeated blocks (for chorus/verse detection)
  const lyricLines = lines.map(l => l.type === "lyric" ? l.text : "");
  const repeatedBlocks = findRepeatedBlocks(lyricLines, 2);

  // Mark lines as part of a repeated block (chorus/verse)
  const blockMap = {};
  repeatedBlocks.forEach(block => {
    for (let i = block.start; i < block.end; i++) {
      if (!blockMap[i]) blockMap[i] = [];
      blockMap[i].push(block);
    }
  });

  // Detect stems (e.g., "Hey Jude, don't ...") for partial repeats
  const stems = detectStems(lyricLines, 2, 3); // 3-word stems for more specificity

  // Build branches: group lines by repeated block, stem, or as sequentials
  const branches = [];
  const usedIdx = new Set();

  for (let i = 0; i < lines.length; ++i) {
    if (usedIdx.has(i)) continue;

    // Discourse marker node
    if (lines[i].type === "discourse") {
      branches.push({
        label: lines[i].marker,
        big: true,
        count: lines[i].count
      });
      usedIdx.add(i);
      continue;
    }

    // Try to group as a repeated block
    let block = null;
    if (blockMap[i]) {
      // Pick the longest block starting here
      block = blockMap[i].reduce((a, b) => (a.length > b.length ? a : b));
    }
    if (block && block.start === i) {
      branches.push({
        label: "Repeated section",
        children: block.textArr.map((t, j) => ({
          label: t
        })),
        repeated: true
      });
      // Mark all lines in this block as used
      for (let j = i; j < i + block.length; ++j) usedIdx.add(j);
      continue;
    }

    // Try to group as a stem (parallel structure)
    const stemEntry = stems.find(stemObj => stemObj.idxArr.includes(i));
    if (stemEntry && stemEntry.idxArr[0] === i) {
      // Group all lines starting with same stem as a branch
      branches.push({
        label: lines[i].text.split(/\s+/).slice(0, 3).join(" "),
        children: stemEntry.idxArr.map(idx => ({
          label: lines[idx].text
        }))
      });
      stemEntry.idxArr.forEach(idx => usedIdx.add(idx));
      continue;
    }

    // Otherwise, add as a single line
    branches.push({
      label: lines[i].text
    });
    usedIdx.add(i);
  }

  return {
    main: title,
    branches: branches
  };
}

// SVG Renderer for branching lyrics mindmap
function renderMindmap(mindmap) {
  // Layout: vertical tree, root at top, branches arranged vertically
  const svgNS = 'http://www.w3.org/2000/svg';
  const rootW = 500, rootH = 72;
  const branchBoxW = 220, branchBoxH = 54;
  const childBoxW = 200, childBoxH = 40;
  const vSpacing = 34, hSpacing = 28;
  const rootXPad = 24;

  let svgW = 1100;
  let svgH = 220 + (mindmap.branches.length * (branchBoxH + vSpacing)) + 110;

  let elements = [];
  // Root node
  let rootX = svgW / 2 - rootW / 2, rootY = 32;
  elements.push(`<rect x="${rootX}" y="${rootY}" width="${rootW}" height="${rootH}" rx="12" fill="#fff" stroke="#222" stroke-width="2"/>`);
  elements.push(`<text x="${rootX + rootW / 2}" y="${rootY + rootH / 2 + 20}" font-size="54" font-family="sans-serif" text-anchor="middle" font-weight="bold">${mindmap.main}</text>`);

  // Branches
  let currentY = rootY + rootH + 56;
  mindmap.branches.forEach((branch, bi) => {
    let bx = rootX + rootXPad, by = currentY;
    let bbW = branchBoxW;
    let bbH = branchBoxH;
    let fontSize = 28;
    let fontWeight = "bold";

    if (branch.big) {
      bbW = 130;
      fontSize = 48;
      fontWeight = "bold";
    }

    // Branch box
    elements.push(`<rect x="${bx}" y="${by}" width="${bbW}" height="${bbH}" rx="9" fill="#fff" stroke="#222" stroke-width="2"/>`);
    // Branch label
    let branchLabel = branch.label;
    if (branch.big && branch.count > 1) {
      branchLabel += ` ×${branch.count}`;
    }
    elements.push(`<text x="${bx + bbW / 2}" y="${by + bbH / 2 + fontSize / 3 - 4}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" font-weight="${fontWeight}">${branchLabel}</text>`);
    // Connector from root to branch
    elements.push(`<path d="M${rootX + rootW / 2} ${rootY + rootH} L${bx + bbW / 2} ${by}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);

    // Children (horizontal, rightwards)
    if (branch.children && branch.children.length) {
      let childrenTotalH = branch.children.length * (childBoxH + 7) - 7;
      let startCy = by + bbH / 2 - childrenTotalH / 2;
      branch.children.forEach((child, j) => {
        let cx = bx + bbW + hSpacing, cy = startCy + j * (childBoxH + 7);
        const cb = `<rect x="${cx}" y="${cy}" width="${childBoxW}" height="${childBoxH}" rx="7" fill="#fff" stroke="#222" stroke-width="1.8"/>`;
        const ct = `<text x="${cx + childBoxW / 2}" y="${cy + childBoxH / 2 + 8}" font-size="19" font-family="sans-serif" text-anchor="middle">${child.label}</text>`;
        elements.push(cb, ct);
        // Connector from branch to child
        elements.push(`<path d="M${bx + bbW} ${by + bbH / 2} L${cx} ${cy + childBoxH / 2}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
      });
      currentY += Math.max(bbH, childrenTotalH) + vSpacing;
    } else {
      currentY += bbH + (branch.big ? 24 : vSpacing);
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
  const mindmap = buildBranchingMindmapTree(lyrics);
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
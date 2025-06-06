// Mindmap Generator: Clean branching, minimal repeats, correct border scaling

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

// Find repeated blocks for lyrics (returns array of block {start, end, length, textArr, count})
function findRepeatedBlocks(lines, minBlockLen=2) {
  const blocks = [];
  const blockMap = {};
  for (let blockLen = Math.max(minBlockLen, 2); blockLen <= 6; blockLen++) {
    for (let i = 0; i <= lines.length - blockLen; i++) {
      const block = lines.slice(i, i + blockLen).map(normalizeLine).join("\n");
      if (!blockMap[block]) blockMap[block] = [i];
      else blockMap[block].push(i);
    }
  }
  Object.entries(blockMap).forEach(([block, indices]) => {
    if (indices.length > 1) {
      // Only keep non-overlapping blocks
      indices.forEach(idx => {
        let overlaps = blocks.some(b =>
          (idx >= b.start && idx < b.end) ||
          (b.start >= idx && b.start < idx + block.split("\n").length)
        );
        if (!overlaps) {
          blocks.push({
            start: idx,
            end: idx + block.split("\n").length,
            length: block.split("\n").length,
            textArr: block.split("\n"),
            count: indices.length
          });
        }
      });
    }
  });
  blocks.sort((a, b) => a.start - b.start);
  return blocks;
}

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
  return Object.entries(stemMap)
    .filter(([stem, idxArr]) => idxArr.length >= minCount)
    .map(([stem, idxArr]) => ({ stem, idxArr }));
}

function buildBranchingMindmapTree(lyrics) {
  const rawLines = lyrics.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.match(/^\[.*\]$/));
  if (rawLines.length === 0) return { main: "Song", branches: [] };

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
      lines.push({ type: "discourse", marker: dm.marker, count, idx: i });
      i = j - 1;
    } else {
      lines.push({ type: "lyric", text: rawLines[i], idx: i });
    }
  }

  const title = (lines[0].type === "lyric") ? lines[0].text : "Song";

  // Find repeated blocks
  const lyricLines = lines.map(l => l.type === "lyric" ? l.text : "");
  const repeatedBlocks = findRepeatedBlocks(lyricLines, 2);

  // Mark lines as part of a repeated block
  const blockStarts = new Set();
  const blockFirstOccurrence = {};
  repeatedBlocks.forEach(block => {
    blockStarts.add(block.start);
    if (!blockFirstOccurrence[block.block]) {
      blockFirstOccurrence[block.block] = block.start;
    }
  });

  // Detect stems for partial repeats/branches
  const stems = detectStems(lyricLines, 2, 3);

  // Build branches: show repeated block only at first position with repeat mark, not elsewhere
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

    // Check if this is the start of a repeated block
    let block = repeatedBlocks.find(b => b.start === i && blockFirstOccurrence[b.block] === i);
    if (block) {
      branches.push({
        children: block.textArr.map((t, j) => ({
          label: t
        })),
        repeat: block.count
      });
      for (let j = i; j < i + block.length; ++j) usedIdx.add(j);
      continue;
    }

    // Skip other occurrences of repeated blocks
    let isInOtherBlock = repeatedBlocks.some(b =>
      b.start !== i &&
      i >= b.start &&
      i < b.end &&
      blockFirstOccurrence[b.block] !== i
    );
    if (isInOtherBlock) {
      usedIdx.add(i);
      continue;
    }

    // Try to group as a stem (parallel structure)
    const stemEntry = stems.find(stemObj => stemObj.idxArr.includes(i) && stemObj.idxArr[0] === i);
    if (stemEntry) {
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

// SVG Renderer for branching lyrics mindmap, proper scaling
function renderMindmap(mindmap) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const rootW = 500, rootH = 72;
  const branchBoxW = 260, branchBoxH = 54;
  const childBoxW = 220, childBoxH = 40;
  const vSpacing = 34, hSpacing = 32;
  const rootXPad = 24;

  // Calculate max needed width and height for branches/children
  let maxBranchChildren = 0;
  mindmap.branches.forEach(branch => {
    if (branch.children && branch.children.length) {
      maxBranchChildren = Math.max(maxBranchChildren, branch.children.length);
    }
  });

  let minSvgW = rootW + rootXPad * 2 + (childBoxW + hSpacing) * (maxBranchChildren > 0 ? 2 : 1) + 60;
  let svgW = Math.max(minSvgW, 1100);
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
    let fontSize = 26;
    let fontWeight = "bold";

    if (branch.big) {
      bbW = 130;
      fontSize = 48;
    }

    // Branch box
    elements.push(`<rect x="${bx}" y="${by}" width="${bbW}" height="${bbH}" rx="9" fill="#fff" stroke="#222" stroke-width="2"/>`);

    // Branch label
    let branchLabel = branch.label || "";
    if (branch.big && branch.count > 1) {
      branchLabel += ` ×${branch.count}`;
    }

    let showLabel = (branch.label !== undefined);
    if (showLabel) {
      elements.push(`<text x="${bx + bbW / 2}" y="${by + bbH / 2 + fontSize / 3 - 4}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" font-weight="${fontWeight}">${branchLabel}</text>`);
    }

    // Repeat mark for blocks (not for discourse marker)
    if (branch.repeat && !branch.big) {
      elements.push(`<text x="${bx + bbW - 20}" y="${by + bbH / 2 + 10}" font-size="21" font-family="sans-serif" text-anchor="end" fill="#888">×${branch.repeat}</text>`);
    }

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

  // Surrounding box (scaled)
  elements.push(`<rect x="10" y="10" width="${svgW - 20}" height="${svgH - 20}" rx="22" fill="none" stroke="#222" stroke-width="3"/>`);

  // SVG marker
  const marker = `<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M2,2 L7,4 L2,6 L4,4 L2,2" style="fill: #222;" /></marker></defs>`;
  return `<svg width="${svgW}" height="${svgH}" xmlns="${svgNS}" style="background:#efefef">${marker}${elements.join('\n')}</svg>`;
}

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

document.addEventListener("DOMContentLoaded", function() {
  const btn = document.getElementById('generateBtn');
  if (btn) {
    btn.addEventListener('click', generateMindmap);
  }
});
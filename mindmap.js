// Mindmap Generator: No duplicate child nodes, clean branching, draggable, fit text

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

  // Detect stems for partial repeats/branches (also keep word count)
  const stems = [];
  lyricLines.forEach((line, idx) => {
    const words = line.trim().split(/\s+/);
    for (let w = 3; w >= 2; w--) {
      if (words.length >= w) {
        const stem = words.slice(0, w).join(" ").toLowerCase();
        let found = stems.find(s => s.stem === stem);
        if (!found) stems.push({ stem, idxArr: [idx], words: w });
        else found.idxArr.push(idx);
        break;
      }
    }
  });
  // Filter: only stems with at least 2 lines, prefer longest possible
  const stemGroups = stems.filter(s => s.idxArr.length >= 2)
    .sort((a, b) => b.words - a.words); // prefer longer stems

  // Track which lines are already grouped
  const usedIdx = new Set();
  const branches = [];

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

    // Check for repeated block
    let block = repeatedBlocks.find(b => b.start === i && blockFirstOccurrence[b.block] === i);
    if (block) {
      // Only show once
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

    // Try to group as a stem (prefer longest match, and only if the lines are not already grouped)
    let stemObj = stemGroups.find(stemObj =>
      stemObj.idxArr.includes(i) &&
      stemObj.idxArr.filter(idx => !usedIdx.has(idx)).length >= 2 &&
      stemObj.idxArr[0] === i
    );
    if (stemObj) {
      // Only keep unique suffixes (no duplicate child nodes)
      const uniqueSuffixes = new Set();
      const childNodes = [];
      stemObj.idxArr
        .filter(idx => !usedIdx.has(idx))
        .forEach(idx => {
          const line = (lines[idx].type === "lyric" ? lines[idx].text : "");
          let suffix = line.trim().split(/\s+/).slice(stemObj.words).join(" ");
          if (!suffix) suffix = "(...)";
          const normSuffix = normalizeLine(suffix);
          if (!uniqueSuffixes.has(normSuffix)) {
            childNodes.push({ label: suffix });
            uniqueSuffixes.add(normSuffix);
          }
        });
      if (childNodes.length > 0) {
        branches.push({
          label: stemObj.stem,
          children: childNodes
        });
        stemObj.idxArr.forEach(idx => usedIdx.add(idx));
        continue;
      }
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

// Helper: fit text to box, shrink font if needed
function fitText(text, maxW, baseSize, minSize) {
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

function renderMindmap(mindmap) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const rootW = 500, rootH = 72;
  const branchBoxW = 260, branchBoxH = 54;
  const childBoxW = 220, childBoxH = 40;
  const vSpacing = 34, hSpacing = 32;
  const rootXPad = 24;

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
  let rootX = svgW / 2 - rootW / 2, rootY = 32;
  elements.push(`<rect x="${rootX}" y="${rootY}" width="${rootW}" height="${rootH}" rx="12" fill="#fff" stroke="#222" stroke-width="2"/>`);
  elements.push(`<text x="${rootX + rootW / 2}" y="${rootY + rootH / 2 + 20}" font-size="54" font-family="sans-serif" text-anchor="middle" font-weight="bold">${mindmap.main}</text>`);

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

    elements.push(`<rect x="${bx}" y="${by}" width="${bbW}" height="${bbH}" rx="9" fill="#fff" stroke="#222" stroke-width="2"/>`);

    let branchLabel = branch.label || "";
    if (branch.big && branch.count > 1) {
      branchLabel += ` ×${branch.count}`;
    }

    let showLabel = (branch.label !== undefined);
    if (showLabel) {
      const fit = fitText(branchLabel, bbW - 20, fontSize, 15);
      if (fit.lines.length === 1) {
        elements.push(`<text x="${bx + bbW / 2}" y="${by + bbH / 2 + fit.font / 3 - 4}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle" font-weight="${fontWeight}">${fit.lines[0]}</text>`);
      } else {
        elements.push(`<text x="${bx + bbW / 2}" y="${by + bbH / 2 - 5}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle" font-weight="${fontWeight}">${fit.lines[0]}</text>`);
        elements.push(`<text x="${bx + bbW / 2}" y="${by + bbH / 2 + fit.font + 2}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle" font-weight="${fontWeight}">${fit.lines[1]}</text>`);
      }
    }

    if (branch.repeat && !branch.big) {
      elements.push(`<text x="${bx + bbW - 20}" y="${by + bbH / 2 + 10}" font-size="21" font-family="sans-serif" text-anchor="end" fill="#888">×${branch.repeat}</text>`);
    }

    elements.push(`<path d="M${rootX + rootW / 2} ${rootY + rootH} L${bx + bbW / 2} ${by}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);

    if (branch.children && branch.children.length) {
      let childrenTotalH = branch.children.length * (childBoxH + 7) - 7;
      let startCy = by + bbH / 2 - childrenTotalH / 2;
      branch.children.forEach((child, j) => {
        let cx = bx + bbW + hSpacing, cy = startCy + j * (childBoxH + 7);
        const fit = fitText(child.label, childBoxW - 16, 19, 11);
        elements.push(`<rect x="${cx}" y="${cy}" width="${childBoxW}" height="${childBoxH}" rx="7" fill="#fff" stroke="#222" stroke-width="1.8"/>`);
        if (fit.lines.length === 1) {
          elements.push(`<text x="${cx + childBoxW / 2}" y="${cy + childBoxH / 2 + fit.font / 3 - 4}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle">${fit.lines[0]}</text>`);
        } else {
          elements.push(`<text x="${cx + childBoxW / 2}" y="${cy + childBoxH / 2 - 4}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle">${fit.lines[0]}</text>`);
          elements.push(`<text x="${cx + childBoxW / 2}" y="${cy + childBoxH / 2 + fit.font + 2}" font-size="${fit.font}" font-family="sans-serif" text-anchor="middle">${fit.lines[1]}</text>`);
        }
        elements.push(`<path d="M${bx + bbW} ${by + bbH / 2} L${cx} ${cy + childBoxH / 2}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
      });
      currentY += Math.max(bbH, childrenTotalH) + vSpacing;
    } else {
      currentY += bbH + (branch.big ? 24 : vSpacing);
    }
  });

  elements.push(`<rect x="10" y="10" width="${svgW - 20}" height="${svgH - 20}" rx="22" fill="none" stroke="#222" stroke-width="3"/>`);

  const marker = `<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M2,2 L7,4 L2,6 L4,4 L2,2" style="fill: #222;" /></marker></defs>`;
  return `
  <div id="mindmapSvgWrapper" style="width:100%;height:700px;overflow:auto;cursor:grab;">
  <svg id="mindmapSvg" width="${svgW}" height="${svgH}" xmlns="${svgNS}" style="background:#efefef;user-select:none">${marker}${elements.join('\n')}</svg>
  </div>`;
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
// Song Mindmap Generator (Generalized)

function normalizeLine(line) {
  // Remove punctuation, trim and lowercase
  return line.replace(/[^a-zA-Z0-9' ]+/g, '').trim().toLowerCase();
}

function isSignificant(line) {
  // Ignore short or trivial vocalizations
  const trivial = ["oh", "yeah", "wow", "na", "la", "woah", "hey", "uh"];
  const norm = normalizeLine(line);
  return norm.length > 3 && !trivial.includes(norm);
}

function extractPhrases(lyrics) {
  // Split lyrics into non-empty, non-section lines
  const lines = lyrics.split(/\r?\n/).map(l => l.trim())
    .filter(l => l && !l.match(/^\[.*\]$/));

  // Count frequencies and preserve original form
  const freq = {};
  lines.forEach(line => {
    const norm = normalizeLine(line);
    if (!freq[norm]) freq[norm] = {count:0, orig:line};
    freq[norm].count++;
  });

  // Get sorted list of significant lines
  const sorted = Object.entries(freq)
    .filter(([norm]) => isSignificant(norm))
    .sort((a, b) => b[1].count - a[1].count);

  return {lines, freq, sorted};
}

function findBranchStems(sorted, maxBranches=5) {
  // Collect main "branch stems" by frequency, using first 2 words as group
  const groups = {};
  for (const [norm, obj] of sorted) {
    const words = obj.orig.split(/\s+/);
    if (words.length < 2) continue;
    const stem = words.slice(0,2).join(" ").toLowerCase();
    if (!groups[stem]) groups[stem] = {count:0, samples:[]};
    groups[stem].count += obj.count;
    if (groups[stem].samples.length < 3) groups[stem].samples.push(obj.orig);
  }
  // Also look for frequent one-word stems
  for (const [norm, obj] of sorted) {
    const words = obj.orig.split(/\s+/);
    if (words.length === 1) {
      const stem = words[0].toLowerCase();
      if (!groups[stem]) groups[stem] = {count:0, samples:[]};
      groups[stem].count += obj.count;
      if (groups[stem].samples.length < 3) groups[stem].samples.push(obj.orig);
    }
  }
  // Sort by count, prefer longer stems
  const groupArr = Object.entries(groups)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, maxBranches);
  return groupArr.map(([stem, obj]) => ({stem, ...obj}));
}

function groupMindmapNodes(lyrics) {
  const {lines, freq, sorted} = extractPhrases(lyrics);
  const mainPhrase = sorted.length ? sorted[0][1].orig : (lines[0] || "Song");

  // Find main branch stems
  const branches = findBranchStems(sorted, 5);

  // For each branch, gather children: lines starting with that stem, and next lines (if short)
  function getChildren(stem) {
    const children = [];
    const lowStem = stem.toLowerCase();
    for (let i=0; i<lines.length; ++i) {
      const line = lines[i];
      if (normalizeLine(line).startsWith(lowStem)) {
        // Child is the remainder after stem
        const rest = line.slice(stem.length).trim();
        if (rest && isSignificant(rest)) {
          children.push({label: rest});
        }
        // Try to add next line as child if it's short and not a branch
        if (lines[i+1] && isSignificant(lines[i+1])) {
          const nextNorm = normalizeLine(lines[i+1]);
          if (!branches.some(b => nextNorm.startsWith(b.stem))) {
            children.push({label: lines[i+1]});
          }
        }
      }
    }
    // Remove duplicates
    const seen = new Set();
    return children.filter(child => {
      const norm = normalizeLine(child.label);
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    }).slice(0, 4); // limit per branch
  }

  // Add a branch for heavily repeated simple lines ("na", "la", "oh", etc)
  const simpleVocalFreq = {};
  lines.forEach(line => {
    const match = line.match(/^((na|la|oh|yeah|woah|hey)[ -]?)+$/i);
    if (match) {
      const key = match[0].toLowerCase();
      simpleVocalFreq[key] = (simpleVocalFreq[key]||0) + 1;
    }
  });
  let topVocal = null;
  let topVocalCount = 0;
  for (const [vocal, count] of Object.entries(simpleVocalFreq)) {
    if (count > topVocalCount) {
      topVocal = vocal.trim();
      topVocalCount = count;
    }
  }
  // Compose the mindmap structure
  const mindmap = {
    main: mainPhrase,
    branches: branches.map(branch => ({
      label: branch.stem,
      children: getChildren(branch.stem)
    }))
  };
  if (topVocal && topVocal.length > 2) {
    mindmap.branches.push({label: topVocal, big:true});
  }
  return mindmap;
}

// --------- Mindmap SVG Renderer ---------
function renderMindmap(mindmap) {
  // Auto layout: vertical tree, root at top, branches below, children horizontal
  const svgNS = 'http://www.w3.org/2000/svg';
  const padX = 24, padY = 16;
  const branchBoxW = 180, branchBoxH = 46;
  const childBoxW = 175, childBoxH = 38;
  const rootW = 500, rootH = 72;
  const hSpacing = 22, vSpacing = 38;

  const numBranches = mindmap.branches.length;
  let svgH = Math.max(550, 110 + (branchBoxH+vSpacing)*numBranches + 100);
  let svgW = 900;

  // Helper: SVG box with text
  function box(x, y, w, h, text, opts={}) {
    const fontSize = opts.fontSize || (opts.big?44:opts.med?28:20);
    const bold = opts.bold||opts.big;
    const minWidth = opts.minWidth||w;
    const textW = Math.max(minWidth, text.length*fontSize*0.54 + 24);
    const rect = `<rect x="${x}" y="${y}" width="${textW}" height="${h}" rx="9" fill="#fff" stroke="#222" stroke-width="2"/>`;
    const txt = `<text x="${x+textW/2}" y="${y+h/2+fontSize/3-4}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" font-weight="${bold?'bold':'normal'}">${text}</text>`;
    return {rect, txt, width:textW, height:h};
  }

  let elements = [];
  // Root box
  let rootX = svgW/2 - rootW/2, rootY = 32;
  const root = box(rootX, rootY, rootW, rootH, mindmap.main, {fontSize:54, bold:true, minWidth:rootW});
  elements.push(root.rect, root.txt);

  // Branches (vertical)
  let startY = rootY + rootH + 40;
  let branchYs = [];
  mindmap.branches.forEach((branch, i) => {
    let bx = rootX+24, by = startY + i*(branchBoxH+vSpacing);
    branchYs.push(by);
    // Branch box
    const bb = box(bx, by, branchBoxW, branchBoxH, branch.label, {fontSize:branch.big?48:26, big:branch.big, minWidth:branchBoxW});
    elements.push(bb.rect, bb.txt);
    // Connector from root to branch
    elements.push(`<path d="M${rootX+rootW/2} ${rootY+rootH} L${bx+branchBoxW/2} ${by}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
    // Children (horizontal, rightwards)
    if (branch.children && branch.children.length) {
      branch.children.forEach((child, j) => {
        let cx = bx+branchBoxW+hSpacing, cy = by + j*(childBoxH+7);
        const cb = box(cx, cy, childBoxW, childBoxH, child.label, {fontSize:18, minWidth:childBoxW});
        elements.push(cb.rect, cb.txt);
        // Connector from branch to child
        elements.push(`<path d="M${bx+branchBoxW} ${by+branchBoxH/2} L${cx} ${cy+childBoxH/2}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
      });
    }
  });

  // Surrounding box
  elements.push(`<rect x="${rootX-34}" y="${rootY-20}" width="${svgW-rootX+10}" height="${svgH-rootY+10}" rx="22" fill="none" stroke="#222" stroke-width="3"/>`);

  // SVG marker
  const marker = `<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M2,2 L7,4 L2,6 L4,4 L2,2" style="fill: #222;" /></marker></defs>`;
  return `<svg width="${svgW}" height="${svgH}" xmlns="${svgNS}" style="background:#efefef">${marker}${elements.join('\n')}</svg>`;
}

// Main entry point
window.generateMindmap = function() {
  const lyrics = document.getElementById('lyricsInput').value;
  if (!lyrics.trim()) {
    document.getElementById('mindmapArea').innerHTML = '<p style="color:#c00">Please paste some lyrics first.</p>';
    return;
  }
  const mindmap = groupMindmapNodes(lyrics);
  const svg = renderMindmap(mindmap);
  document.getElementById('mindmapArea').innerHTML = svg;
};
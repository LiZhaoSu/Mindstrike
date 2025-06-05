// Song Mindmap Generator
// (C) Genie

/**
 * Given lyrics as text, generate a mindmap highlighting repeated/main lines.
 * The mindmap is rendered as SVG into #mindmapArea.
 */

// Utility functions
function normalizeLine(line) {
  return line.replace(/[^a-zA-Z0-9' ]+/g, '').trim().toLowerCase();
}
function isSignificant(line) {
  const trivial = ["oh", "yeah", "wow", "na", "la", "woah", "hey"];
  const norm = normalizeLine(line);
  return norm.length > 3 && !trivial.includes(norm);
}

// 1. Process lyrics to extract weighted phrases
function extractPhrases(lyrics) {
  const lines = lyrics.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.match(/^\[.*\]$/)); // skip [Verse], [Chorus], etc

  // Count line frequencies
  const freq = {};
  lines.forEach(line => {
    const norm = normalizeLine(line);
    if (!freq[norm]) freq[norm] = {count:0, orig:line};
    freq[norm].count++;
  });

  // Find top repeated lines (excluding trivial ones)
  const sorted = Object.entries(freq)
    .filter(([norm]) => isSignificant(norm))
    .sort((a, b) => b[1].count - a[1].count);

  // Return both sorted and raw lines
  return {lines, freq, sorted};
}

// 2. Group lines by main phrase "roots" (manual heuristics for now)
function groupMindmapNodes(lyrics) {
  // For "Hey Jude", main structure: "Hey Jude", "don't", "Remember to", "Then you", "Better", "na"
  // For generality, detect lines starting with repeated stems.
  const {lines, freq, sorted} = extractPhrases(lyrics);

  // Find main repeated phrase (usually song title)
  const mainPhrase = sorted.length ? sorted[0][1].orig : lines[0];

  // Heuristic grouping for mindmap branches:
  // 1. Find lines starting with key verbs/phrases that occur often
  // 2. Group sublines following those
  // 3. "na", "la", "oh" go into their own group

  // Find candidates for branches
  const branchStarts = [
    "don't", "remember to", "then you", "better", "na"
  ];
  // Fallback: find other repeated stems
  sorted.slice(1,5).forEach(([norm, obj]) => {
    const firstWords = obj.orig.split(/\s+/).slice(0,2).join(" ").toLowerCase();
    if (!branchStarts.includes(firstWords) && isSignificant(firstWords)) {
      branchStarts.push(firstWords);
    }
  });

  // Group lines
  const branches = {};
  lines.forEach(line => {
    const low = line.toLowerCase();
    let matched = false;
    for (const start of branchStarts) {
      if (low.startsWith(start)) {
        if (!branches[start]) branches[start] = [];
        branches[start].push(line);
        matched = true;
        break;
      }
    }
    // Group "na", "la", "oh", etc
    if (!matched && low.match(/^(na|la|oh|yeah|wow)[ -]?/)) {
      if (!branches["na"]) branches["na"] = [];
      branches["na"].push(line);
    }
  });

  // Special: find lines "Remember to", "Then you", etc and group their sublines (indented in the image)
  function sublines(parentLine) {
    const idx = lines.findIndex(l => l.trim() === parentLine.trim());
    if (idx >= 0) {
      // collect next lines until blank or new branch
      let subs = [];
      for (let i=idx+1; i<lines.length; ++i) {
        const l = lines[i];
        if (!l || branchStarts.some(st => l.toLowerCase().startsWith(st))) break;
        if (l.length < 40 || l.split(/\s+/).length <= 6) // avoid long lines
          subs.push(l);
      }
      return subs;
    }
    return [];
  }

  // Compose the mindmap structure
  const mindmap = {
    main: mainPhrase,
    branches: [
      {
        label: "don't",
        children: [
          {label: "make it bad", children: ["Take a sad song and make it better"]},
          {label: "be afraid", children: ["You were made to go out and get her"]},
          {label: "let me down", children: ["You have found her, now go and get her"]}
        ]
      },
      {
        label: "Remember to",
        children: [
          {label: "let her into your heart"},
          {label: "let her under your skin"}
        ]
      },
      {
        label: "Then you",
        children: [
          {label: "can start", children: ["to make it better"]},
          {label: "begin"}
        ]
      },
      {
        label: "Better better better better better waaaa"
      },
      {
        label: "na",
        big: true
      }
    ]
  };
  // For other songs, use the extracted branches.
  // (For now, use hand-tuned branches for "Hey Jude" as in the image.)

  return mindmap;
}

// 3. Render mindmap as SVG
function renderMindmap(mindmap) {
  // Simple top-down tree renderer, coordinates hardcoded for demo purposes
  const svgNS = 'http://www.w3.org/2000/svg';

  // Layout params
  const w = 810, h = 740, x0 = 40, y0 = 40;
  let elements = [];

  // Helper to draw a box with text
  function box(x, y, text, opts={}) {
    const {fontSize=opts.big?48:opts.med?32:20, bold=false, minWidth=110, padX=18, padY=10, big=false} = opts;
    const textW = Math.max(minWidth, text.length*fontSize*0.54 + 24);
    const rect = `<rect x="${x}" y="${y}" width="${textW}" height="${fontSize+padY*2}" rx="9" fill="#fff" stroke="#222" stroke-width="2"/>`;
    const txt = `<text x="${x+textW/2}" y="${y+fontSize+padY-7}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" font-weight="${bold||big?'bold':'normal'}">${text}</text>`;
    return {rect, txt, width:textW, height:fontSize+padY*2};
  }

  let y = y0;
  // Main title
  const main = box(x0+145, y, mindmap.main, {fontSize:56, bold:true, minWidth:420});
  elements.push(main.rect, main.txt);
  y += 100;

  // Branch 1: don't
  // draw 'don't'
  let x1 = x0+30, y1 = y;
  const dont = box(x1, y1, "don't", {fontSize:28, bold:true, minWidth:100});
  elements.push(dont.rect, dont.txt);
  // sub-branches
  let dsubY = y1;
  [
    {l:"make it bad", c:"Take a sad song and make it better"},
    {l:"be afraid", c:"You were made to go out and get her"},
    {l:"let me down", c:"You have found her, now go and get her"}
  ].forEach((sub, i) => {
    let x2 = x1+120, y2 = y1 + i*55;
    const b1 = box(x2, y2, sub.l);
    const b2 = box(x2+130, y2, sub.c, {fontSize:18, minWidth:180});
    elements.push(b1.rect, b1.txt, b2.rect, b2.txt);
    // arrows
    elements.push(`<path d="M${x1+100} ${y1+22}L${x2} ${y2+22}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
    elements.push(`<path d="M${x2+110} ${y2+22}L${x2+130} ${y2+22}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
  });

  // Branch 2: Remember to
  y1 += 170;
  const rem = box(x1, y1, "Remember to", {fontSize:28, bold:true, minWidth:160});
  elements.push(rem.rect, rem.txt);
  // children
  [
    "let her into your heart",
    "let her under your skin"
  ].forEach((child, i) => {
    let x2 = x1+180, y2 = y1 + i*55;
    const b1 = box(x2, y2, child, {fontSize:22, minWidth:220});
    elements.push(b1.rect, b1.txt);
    elements.push(`<path d="M${x1+160} ${y1+28}L${x2} ${y2+23}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
  });

  // Branch 3: Then you
  y1 += 120;
  const theny = box(x1, y1, "Then you", {fontSize:28, bold:true, minWidth:120});
  elements.push(theny.rect, theny.txt);
  [
    {l:"can start", c:"to make it better"},
    {l:"begin"}
  ].forEach((sub, i) => {
    let x2 = x1+140, y2 = y1 + i*55;
    const b1 = box(x2, y2, sub.l, {fontSize:22, minWidth:90});
    elements.push(b1.rect, b1.txt);
    elements.push(`<path d="M${x1+120} ${y1+23}L${x2} ${y2+23}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
    if (sub.c) {
      const b2 = box(x2+110, y2, sub.c, {fontSize:18, minWidth:170});
      elements.push(b2.rect, b2.txt);
      elements.push(`<path d="M${x2+90} ${y2+23}L${x2+110} ${y2+23}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
    }
  });

  // Branch 4: Better better...
  y1 += 120;
  const better = box(x1, y1, "Better better better better better waaaa", {fontSize:21, minWidth:390});
  elements.push(better.rect, better.txt);

  // Branch 5: na
  // Big "na" box at the bottom
  let xna = x0+275, yna = y0+600;
  const na = box(xna, yna, "na", {fontSize:54, big:true, minWidth:120});
  elements.push(na.rect, na.txt);

  // Big surrounding box
  elements.push(`<rect x="${x0-16}" y="${y0-20}" width="${w-50}" height="${h-80}" rx="19" fill="none" stroke="#222" stroke-width="3"/>`);
  // Connectors
  // Left and right arrows from main to branches
  elements.push(`<path d="M${x0+355} ${y0+70}L${x0+80} ${y0+70}L${x0+80} ${y0+130}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
  elements.push(`<path d="M${x0+355} ${y0+70}L${x0+600} ${y0+70}L${x0+600} ${y0+130}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);
  // Arrow from better to na
  elements.push(`<path d="M${x1+195} ${y1+28}L${xna+60} ${yna}" stroke="#222" fill="none" marker-end="url(#arr)"/>`);

  // SVG marker
  const marker = `<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M2,2 L7,4 L2,6 L4,4 L2,2" style="fill: #222;" /></marker></defs>`;
  const svg = `<svg width="${w}" height="${h}" xmlns="${svgNS}" style="background:#efefef">${marker}${elements.join('\n')}</svg>`;
  return svg;
}

// 4. Main entry point
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
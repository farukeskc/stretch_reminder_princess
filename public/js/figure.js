// Animasyonlu esneme karakteri.
// Tek bir SVG iskeleti (önden + yandan görünüm), eklemler <g> grupları olarak iç içe.
// Her animasyon "poz" listesiyle tanımlanır; eller için hedef nokta verilirse açıları
// 2 eklemli ters kinematik (IK) ile hesaplanır. Pozlardan CSS @keyframes üretilir.

const D2R = Math.PI / 180;
const rot = ([x, y], deg) => {
  const r = deg * D2R;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
};
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
/** rotate(θ) uygulanmış (0,1) vektörünün d yönünü göstermesi için gereken θ. */
const dirAngle = ([dx, dy]) => Math.atan2(-dx, dy) / D2R;
const norm = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
const r1 = (n) => Math.round(n * 10) / 10;

/** Omuz S, hedef T, kol uzunlukları L1/L2; pref dirseğin hangi yöne bakacağı. */
function solveArm(S, T, L1, L2, pref) {
  let d = sub(T, S);
  let D = len(d) || 0.001;
  const maxD = L1 + L2 - 0.4;
  const minD = Math.abs(L1 - L2) + 0.4;
  const clamped = Math.min(maxD, Math.max(minD, D));
  d = [(d[0] * clamped) / D, (d[1] * clamped) / D];
  D = clamped;
  const target = add(S, d);
  const base = dirAngle(d);
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)))) / D2R;
  let best = null;
  for (const th of [base + a, base - a]) {
    const E = add(S, rot([0, L1], th));
    const score = (E[0] - S[0]) * pref[0] + (E[1] - S[1]) * pref[1];
    if (!best || score > best.score) best = { th, E, score };
  }
  const th2 = dirAngle(sub(target, best.E));
  return { upper: best.th, fore: norm(th2 - best.th) };
}

const T = (s) => ({ prop: 'transform', value: s });

// ---------------------------------------------------------------------------
// Önden görünüm
// ---------------------------------------------------------------------------
const FRONT = {
  L1: 34,
  L2: 31,
  shoulders: { L: [-24, -56], R: [24, -56] },
  pref: { L: [-1, 0.35], R: [1, 0.35] },
  rest: {
    body: 0, bodyY: 0, head: 0, headY: 0, faceX: 0, faceY: 0, eyes: 1, palms: 0,
    emblemX: 0, shrug: 0,
    armL: [-31, 6], armR: [31, 6],
    thighL: 0, shinL: 0, thighR: 0, shinR: 0,
  },
  solve(p) {
    const out = {
      'j-body': T(`rotate(${r1(p.body)}deg) translate(0px, ${r1(p.bodyY)}px)`),
      'j-head': T(`translate(0px, ${r1(p.headY)}px) rotate(${r1(p.head)}deg)`),
      'j-face': T(`translate(${r1(p.faceX)}px, ${r1(p.faceY)}px)`),
      'j-eye': T(`scale(1, ${p.eyes})`),
      'j-palms': { prop: 'opacity', value: String(p.palms) },
      'j-emblem': T(`translate(${r1(p.emblemX)}px, 0px)`),
      'j-thighL': T(`rotate(${r1(p.thighL)}deg)`),
      'j-shinL': T(`rotate(${r1(p.shinL)}deg)`),
      'j-thighR': T(`rotate(${r1(p.thighR)}deg)`),
      'j-shinR': T(`rotate(${r1(p.shinR)}deg)`),
    };
    for (const side of ['L', 'R']) {
      const spec = p[`arm${side}`];
      const shoulderLocal = add(this.shoulders[side], [0, p.bodyY + p.shrug]);
      const S = rot(shoulderLocal, p.body);
      let upper;
      let fore;
      if (Array.isArray(spec)) {
        const sol = solveArm(S, spec, this.L1, this.L2, p[`pref${side}`] || this.pref[side]);
        upper = sol.upper - p.body;
        fore = sol.fore;
      } else {
        [upper, fore] = spec.a;
      }
      out[`j-arm${side}`] = T(`translate(0px, ${r1(p.shrug)}px) rotate(${r1(norm(upper))}deg)`);
      out[`j-fore${side}`] = T(`rotate(${r1(fore)}deg)`);
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Yandan görünüm (sağa bakıyor)
// ---------------------------------------------------------------------------
const SIDE = {
  L1: 34,
  L2: 32,
  waist: [0, -28],
  shoulders: { N: [1, -25], F: [-2, -24] },
  pref: { N: [-0.25, 1], F: [-0.25, 1] },
  rest: {
    body: 0, chest: 0, head: 0, headX: 0,
    armN: [30, -7], armF: [27, -8], handN: 0, handF: 0,
    thighN: -90, shinN: 90, footN: 0,
    thighF: -90, shinF: 90, footF: 0,
  },
  solve(p) {
    const out = {
      'j-body': T(`rotate(${r1(p.body)}deg)`),
      'j-chest': T(`rotate(${r1(p.chest)}deg)`),
      'j-head': T(`translate(${r1(p.headX)}px, 0px) rotate(${r1(p.head)}deg)`),
    };
    for (const k of ['N', 'F']) {
      out[`j-thigh${k}`] = T(`rotate(${r1(p[`thigh${k}`])}deg)`);
      out[`j-shin${k}`] = T(`rotate(${r1(p[`shin${k}`])}deg)`);
      out[`j-foot${k}`] = T(`rotate(${r1(p[`foot${k}`])}deg)`);
      out[`j-hand${k}`] = T(`rotate(${r1(p[`hand${k}`])}deg)`);
      const spec = p[`arm${k}`];
      const parent = p.body + p.chest;
      const S = rot(add(this.waist, rot(this.shoulders[k], p.chest)), p.body);
      let upper;
      let fore;
      if (Array.isArray(spec)) {
        const sol = solveArm(S, spec, this.L1, this.L2, p[`pref${k}`] || this.pref[k]);
        upper = sol.upper - parent;
        fore = sol.fore;
      } else {
        [upper, fore] = spec.a;
      }
      out[`j-arm${k}`] = T(`rotate(${r1(norm(upper))}deg)`);
      out[`j-fore${k}`] = T(`rotate(${r1(fore)}deg)`);
    }
    return out;
  },
};

const RIGS = { front: FRONT, side: SIDE };

// ---------------------------------------------------------------------------
// Animasyon tanımları. mirror: true → yalnızca bir taraf tanımlanır, her döngüde
// figür (simetrik dinlenme pozundayken) aynalanır ve diğer taraf gösterilir.
// key: azaltılmış hareket modunda / küçük kartlarda gösterilecek anahtar kare (%).
// ---------------------------------------------------------------------------
export const ANIMS = {
  'neck-tilt': {
    view: 'front', dur: 4, mirror: true, key: 45,
    frames: [[0, {}], [15, {}], [40, { head: 24 }], [75, { head: 24 }], [100, {}]],
  },
  'neck-turn': {
    view: 'front', dur: 3.5, mirror: true, key: 50,
    frames: [[0, {}], [15, {}], [40, { faceX: -7, head: -3 }], [72, { faceX: -7, head: -3 }], [100, {}]],
  },
  'shoulder-roll': {
    view: 'front', dur: 3, key: 25,
    frames: [
      [0, {}],
      [25, { shrug: -9 }],
      [50, { shrug: -5, armL: [-34, 2], armR: [34, 2] }],
      [75, { shrug: 2 }],
      [100, {}],
    ],
  },
  shrug: {
    view: 'front', dur: 3.2, key: 40,
    frames: [[0, {}], [10, {}], [30, { shrug: -11, headY: 1 }], [55, { shrug: -11, headY: 1 }], [68, {}], [100, {}]],
  },
  'cross-arm': {
    view: 'front', dur: 4, mirror: true, key: 50,
    frames: [
      [0, {}],
      [12, {}],
      [35, { armL: { a: [-86, 0] }, armR: [10, -51], prefR: [1, 0.8] }],
      [78, { armL: { a: [-86, 0] }, armR: [10, -51], prefR: [1, 0.8] }],
      [100, {}],
    ],
  },
  triceps: {
    view: 'front', dur: 4.5, mirror: true, key: 50,
    frames: [
      [0, {}],
      [12, {}],
      [24, { armL: { a: [175, 0] } }],
      [38, { armL: { a: [175, 158] }, armR: [-23, -94], prefR: [1, -0.6] }],
      [80, { armL: { a: [175, 158] }, armR: [-23, -94], prefR: [1, -0.6] }],
      [92, { armL: { a: [175, 0] } }],
      [100, {}],
    ],
  },
  'side-bend': {
    view: 'front', dur: 4.5, mirror: true, key: 50,
    frames: [
      [0, {}],
      [12, {}],
      [24, { armL: { a: [180, 0] } }],
      [42, { body: 14, armL: { a: [176, 48] }, armR: [36, 0] }],
      [78, { body: 14, armL: { a: [176, 48] }, armR: [36, 0] }],
      [90, { armL: { a: [180, 0] } }],
      [100, {}],
    ],
  },
  twist: {
    view: 'front', dur: 4.5, mirror: true, key: 50,
    frames: [
      [0, {}],
      [12, {}],
      [40, { body: -3, faceX: -7, emblemX: -8, armR: [-6, 4], prefR: [0.6, 1], armL: [-35, -14], prefL: [-1, 0.2] }],
      [80, { body: -3, faceX: -7, emblemX: -8, armR: [-6, 4], prefR: [0.6, 1], armL: [-35, -14], prefL: [-1, 0.2] }],
      [100, {}],
    ],
  },
  'figure-four': {
    view: 'front', dur: 5, mirror: true, key: 60,
    frames: [
      [0, {}],
      [10, {}],
      [30, { thighL: 26, shinL: -108, armL: [-18, 10], armR: [24, 14] }],
      [50, { thighL: 26, shinL: -108, bodyY: 7, headY: 2, armL: [-18, 12], armR: [24, 16] }],
      [82, { thighL: 26, shinL: -108, bodyY: 7, headY: 2, armL: [-18, 12], armR: [24, 16] }],
      [94, { thighL: 26, shinL: -108, armL: [-18, 10], armR: [24, 14] }],
      [100, {}],
    ],
  },
  eyes: {
    view: 'front', dur: 9, key: 80,
    frames: [
      [0, {}],
      [8, {}],
      [16, { faceX: 4, faceY: -2, eyes: 1.15 }],
      [38, { faceX: 4, faceY: -2, eyes: 1.15 }],
      [43, { eyes: 1 }],
      [45, { eyes: 0.12 }],
      [47, { eyes: 1 }],
      [49, { eyes: 0.12 }],
      [51, { eyes: 1 }],
      [53, { eyes: 0.12 }],
      [55, { eyes: 1 }],
      [64, { eyes: 1, armL: [-10, -80], armR: [10, -80], prefL: [-1, 1], prefR: [1, 1] }],
      [70, { eyes: 0.12, palms: 1, armL: [-9, -84], armR: [9, -84], prefL: [-1, 1], prefR: [1, 1] }],
      [90, { eyes: 0.12, palms: 1, armL: [-9, -84], armR: [9, -84], prefL: [-1, 1], prefR: [1, 1] }],
      [96, { eyes: 1, palms: 0 }],
      [100, {}],
    ],
  },

  // --- Yandan ---
  'chin-tuck': {
    view: 'side', dur: 3, key: 45,
    frames: [[0, {}], [15, {}], [35, { headX: -6 }], [65, { headX: -6 }], [85, {}], [100, {}]],
  },
  'chest-open': {
    view: 'side', dur: 6, key: 35,
    frames: [
      [0, {}],
      [10, {}],
      [25, { armN: [-24, 8], armF: [-26, 7], prefN: [0, 1], prefF: [0, 1] }],
      [35, { chest: -7, head: -14, armN: [-26, 10], armF: [-28, 9], prefN: [0, 1], prefF: [0, 1] }],
      [80, { chest: -7, head: -14, armN: [-26, 10], armF: [-28, 9], prefN: [0, 1], prefF: [0, 1] }],
      [92, { armN: [-24, 8], armF: [-26, 7], prefN: [0, 1], prefF: [0, 1] }],
      [100, {}],
    ],
  },
  'cat-cow': {
    view: 'side', dur: 6, key: 70,
    frames: [
      [0, {}],
      [20, { body: -3, chest: -10, head: -16 }],
      [35, { body: -3, chest: -10, head: -16 }],
      [65, { body: 6, chest: 20, head: 26 }],
      [80, { body: 6, chest: 20, head: 26 }],
      [100, {}],
    ],
  },
  'wrist-flexor': {
    view: 'side', dur: 5, key: 50,
    frames: [
      [0, {}],
      [12, {}],
      [28, { armN: { a: [-90, 0] }, handN: -90 }],
      [40, { armN: { a: [-90, 0] }, handN: -100, armF: [64, -64], prefF: [0, 1] }],
      [78, { armN: { a: [-90, 0] }, handN: -112, armF: [62, -64], prefF: [0, 1] }],
      [90, { armN: { a: [-90, 0] }, handN: -90 }],
      [100, {}],
    ],
  },
  'wrist-extensor': {
    view: 'side', dur: 5, key: 50,
    frames: [
      [0, {}],
      [12, {}],
      [28, { armN: { a: [-90, 0] }, handN: 80 }],
      [40, { armN: { a: [-90, 0] }, handN: 88, armF: [65, -51], prefF: [0, 1], handF: -60 }],
      [78, { armN: { a: [-90, 0] }, handN: 98, armF: [64, -50], prefF: [0, 1], handF: -60 }],
      [90, { armN: { a: [-90, 0] }, handN: 80 }],
      [100, {}],
    ],
  },
  hamstring: {
    view: 'side', dur: 6, key: 55,
    frames: [
      [0, {}],
      [12, {}],
      [28, { thighN: -54, shinN: 0, footN: -50, armN: [24, -6], armF: [22, -7] }],
      [45, { thighN: -54, shinN: 0, footN: -50, body: 26, chest: 6, head: -6, armN: [36, 18], armF: [33, 16] }],
      [80, { thighN: -54, shinN: 0, footN: -50, body: 26, chest: 6, head: -6, armN: [36, 18], armF: [33, 16] }],
      [92, { thighN: -54, shinN: 0, footN: -50, armN: [24, -6], armF: [22, -7] }],
      [100, {}],
    ],
  },
  ankle: {
    view: 'side', dur: 6, key: 30,
    frames: [
      [0, {}],
      [10, {}],
      [20, { thighN: -102, shinN: 82, footN: 0 }],
      [30, { thighN: -102, shinN: 82, footN: -28 }],
      [42, { thighN: -102, shinN: 82, footN: 22 }],
      [54, { thighN: -102, shinN: 82, footN: -28 }],
      [66, { thighN: -102, shinN: 82, footN: 22 }],
      [78, { thighN: -102, shinN: 82, footN: -28 }],
      [88, { thighN: -102, shinN: 82, footN: 0 }],
      [100, {}],
    ],
  },
};

// ---------------------------------------------------------------------------
// CSS üretimi
// ---------------------------------------------------------------------------
function decl({ prop, value }) {
  return `${prop}:${value}`;
}

export function buildFigureCss() {
  let css = '';
  // Dinlenme pozları
  for (const [view, rig] of Object.entries(RIGS)) {
    const rest = rig.solve({ ...rig.rest });
    for (const [joint, d] of Object.entries(rest)) css += `.fig-${view} .${joint}{${decl(d)}}\n`;
  }
  css += '@keyframes fig-flip{0%{transform:scale(1,1)}50%{transform:scale(-1,1)}100%{transform:scale(-1,1)}}\n';

  for (const [name, def] of Object.entries(ANIMS)) {
    const rig = RIGS[def.view];
    const solved = def.frames.map(([pct, p]) => [pct, rig.solve({ ...rig.rest, ...p })]);
    const sel = `.fig[data-anim="${name}"]`;
    for (const joint of Object.keys(solved[0][1])) {
      const vals = solved.map(([, s]) => decl(s[joint]));
      if (vals.every((v) => v === vals[0]) && vals[0] === decl(rig.solve({ ...rig.rest })[joint])) continue;
      const kf = `fa-${name}-${joint}`;
      css += `@keyframes ${kf}{${solved.map(([pct, s]) => `${pct}%{${decl(s[joint])}}`).join('')}}\n`;
      css += `${sel} .${joint}{animation:${kf} ${def.dur}s ease-in-out infinite}\n`;
    }
    if (def.mirror) css += `${sel} .j-flip{animation:fig-flip ${def.dur * 2}s steps(1,end) infinite}\n`;
  }
  return css;
}

let injected = false;
function ensureCss() {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'figure-css';
  style.textContent = buildFigureCss();
  document.head.appendChild(style);
  injected = true;
}

// ---------------------------------------------------------------------------
// SVG işaretlemesi
// ---------------------------------------------------------------------------
const j = (cls, x, y, inner) => `<g transform="translate(${x} ${y})"><g class="${cls}">${inner}</g></g>`;

function frontArm(side) {
  const [x, y] = FRONT.shoulders[side];
  return j(
    `j-arm${side}`,
    x,
    y,
    `<line x1="0" y1="0" x2="0" y2="33" class="f-sleeve"/>` +
      j(`j-fore${side}`, 0, 34, `<line x1="0" y1="0" x2="0" y2="27" class="f-forearm"/><circle cx="0" cy="31" r="5.6" class="f-skin"/>`) +
      `<circle cx="0" cy="2" r="8.5" class="f-top"/>`,
  );
}

function frontLeg(side, x) {
  const footX = side === 'L' ? -2 : 2;
  return j(
    `j-thigh${side}`,
    x,
    0,
    j(`j-shin${side}`, 0, 16, `<rect x="-7" y="-2" width="14" height="48" rx="7" class="f-pants-shin"/><ellipse cx="${footX}" cy="49" rx="10" ry="5.5" class="f-shoe"/>`) +
      `<rect x="-11.5" y="-6" width="23" height="25" rx="10" class="f-pants"/>` +
      `<ellipse cx="0" cy="13" rx="8" ry="5" class="f-knee"/>`,
  );
}

const FRONT_HEAD =
  `<rect x="-5" y="-14" width="10" height="17" rx="4" class="f-skin-shade"/>` +
  `<circle cx="0" cy="-54" r="9" class="f-hair"/>` +
  `<ellipse cx="0" cy="-30" rx="23" ry="23" class="f-hair"/>` +
  `<circle cx="0" cy="-28" r="18.5" class="f-skin"/>` +
  `<g class="j-face">` +
  `<g transform="translate(-7 -27)"><ellipse class="j-eye f-eye" rx="2.3" ry="2.9"/></g>` +
  `<g transform="translate(7 -27)"><ellipse class="j-eye f-eye" rx="2.3" ry="2.9"/></g>` +
  `<circle cx="-11.5" cy="-20" r="3.6" class="f-blush"/><circle cx="11.5" cy="-20" r="3.6" class="f-blush"/>` +
  `<path d="M-4 -19 Q0 -15.5 4 -19" class="f-mouth"/>` +
  `</g>` +
  `<path class="f-hair" d="M-18.8 -30 C-18 -46 -6 -50 0 -48 C6 -50 18 -46 18.8 -30 C14 -38 8 -41 3 -40 C1 -37.5 -1 -37.5 -3 -40 C-8 -41 -14 -38 -18.8 -30 Z"/>` +
  `<path class="f-hair" d="M-22.5 -32 Q-25 -14 -18 -8 Q-17.5 -20 -17.5 -30 Z M22.5 -32 Q25 -14 18 -8 Q17.5 -20 17.5 -30 Z"/>` +
  `<path class="f-crown" d="M-9 -47 L-10.5 -57 L-5 -52 L0 -59 L5 -52 L10.5 -57 L9 -47 Z"/>` +
  `<circle cx="0" cy="-51" r="1.8" class="f-jewel"/>` +
  `<g class="j-palms"><ellipse cx="-8.5" cy="-27" rx="8" ry="6.5" class="f-skin"/><ellipse cx="8.5" cy="-27" rx="8" ry="6.5" class="f-skin"/></g>`;

function frontSvg() {
  return (
    `<ellipse cx="100" cy="231" rx="64" ry="5" class="f-shadow"/>` +
    `<g class="j-flip" style="transform-origin:100px 120px">` +
    `<g class="f-chair">` +
    `<rect x="66" y="82" width="68" height="84" rx="16" class="c-back"/>` +
    `<rect x="95" y="170" width="10" height="46" rx="3" class="c-stem"/>` +
    `<path d="M64 221 L136 221" class="c-base"/>` +
    `<circle cx="66" cy="225" r="4" class="c-wheel"/><circle cx="100" cy="226" r="4" class="c-wheel"/><circle cx="134" cy="225" r="4" class="c-wheel"/>` +
    `<rect x="58" y="156" width="84" height="15" rx="7" class="c-seat"/>` +
    `</g>` +
    `<g transform="translate(100 158)">` +
    frontLeg('R', 13) +
    frontLeg('L', -13) +
    `<g class="j-body">` +
    `<path class="f-top" d="M-22 -58 Q0 -64 22 -58 C27 -50 25 -36 18 -24 C23 -14 25 -4 24 4 L-24 4 C-25 -4 -23 -14 -18 -24 C-25 -36 -27 -50 -22 -58 Z"/>` +
    `<path class="f-pants" d="M-18 -22 L18 -22 C23 -13 26 -4 27 6 L-27 6 C-26 -4 -23 -13 -18 -22 Z"/>` +
    `<path class="f-skin" d="M-7 -60.5 Q0 -51 7 -60.5 Z"/>` +
    `<g class="j-emblem"><path class="f-heart" d="M0 -31 C-6 -35 -7 -40 -3.5 -41.5 C-1.5 -42.2 0 -40.5 0 -39.5 C0 -40.5 1.5 -42.2 3.5 -41.5 C7 -40 6 -35 0 -31 Z"/></g>` +
    frontArm('L') +
    frontArm('R') +
    j('j-head', 0, -58, FRONT_HEAD) +
    `</g></g></g>`
  );
}

function sideArm(k, far) {
  const [x, y] = SIDE.shoulders[k];
  const c = far ? ' far' : '';
  return j(
    `j-arm${k}`,
    x,
    y,
    `<line x1="0" y1="0" x2="0" y2="33" class="f-sleeve${c}"/>` +
      j(
        `j-fore${k}`,
        0,
        34,
        `<line x1="0" y1="0" x2="0" y2="26" class="f-forearm${c}"/>` +
          j(`j-hand${k}`, 0, 27, `<rect x="-5" y="-2" width="10" height="17" rx="5" class="f-skin${c}"/>`),
      ) +
      `<circle cx="0" cy="2" r="8" class="f-top${c}"/>`,
  );
}

function sideLeg(k, far) {
  const c = far ? ' far' : '';
  return j(
    `j-thigh${k}`,
    0,
    0,
    `<line x1="0" y1="0" x2="0" y2="40" class="f-thigh${c}"/>` +
      j(
        `j-shin${k}`,
        0,
        40,
        `<line x1="0" y1="0" x2="0" y2="49" class="f-shin${c}"/>` + j(`j-foot${k}`, 0, 50, `<ellipse cx="6" cy="2" rx="11" ry="5.5" class="f-shoe${c}"/>`),
      ),
  );
}

const SIDE_HEAD =
  `<rect x="-4" y="-13" width="9" height="16" rx="4" class="f-skin-shade"/>` +
  `<circle cx="-14" cy="-44" r="8.5" class="f-hair"/>` +
  `<ellipse cx="0" cy="-29" rx="21" ry="22" class="f-hair"/>` +
  `<circle cx="5" cy="-27" r="17.5" class="f-skin"/>` +
  `<circle cx="-1" cy="-25" r="3.6" class="f-skin-shade"/>` +
  `<ellipse cx="14" cy="-27" rx="2" ry="2.8" class="f-eye"/>` +
  `<circle cx="14" cy="-19" r="3.3" class="f-blush"/>` +
  `<path d="M16.5 -16.5 Q19 -15 21 -17.5" class="f-mouth"/>` +
  `<path d="M22 -24.5 Q24.6 -22.2 22 -20.6" class="f-nose"/>` +
  `<path class="f-hair" d="M-9 -44 C1 -50 16 -47 22.5 -32 C16 -36.5 10 -38.5 4 -37.5 C0 -40.5 -6 -41.5 -10 -38 Z"/>` +
  `<path class="f-hair" d="M-6 -36 Q-9 -20 -4 -12 Q-14 -16 -16 -30 Z"/>` +
  `<path class="f-crown" d="M-5 -44 L-6.5 -53.5 L-1.5 -49 L3 -55.5 L7.5 -49 L12.5 -53.5 L11 -44 Z"/>` +
  `<circle cx="3" cy="-48" r="1.7" class="f-jewel"/>`;

function sideSvg() {
  return (
    `<ellipse cx="92" cy="226" rx="62" ry="5" class="f-shadow"/>` +
    `<g class="f-chair">` +
    `<rect x="47" y="84" width="13" height="80" rx="6" class="c-back"/>` +
    `<rect x="85" y="169" width="10" height="44" rx="3" class="c-stem"/>` +
    `<path d="M58 219 L122 219" class="c-base"/>` +
    `<circle cx="60" cy="223" r="4" class="c-wheel"/><circle cx="120" cy="223" r="4" class="c-wheel"/>` +
    `<rect x="49" y="156" width="80" height="13" rx="6" class="c-seat"/>` +
    `</g>` +
    `<g transform="translate(82 158)">` +
    `<g transform="translate(-4 -3)">${sideLeg('F', true)}</g>` +
    sideLeg('N', false) +
    `<g class="j-body">` +
    `<path class="f-top" d="M-15 4 C-17 -8 -15 -20 -11 -29 L12 -29 C15 -18 17 -8 16 4 Z"/>` +
    `<path class="f-pants" d="M-15.5 -9 C-16.5 -2 -15.5 2 -14.5 7 L18 7 C17.5 1 16.5 -4 16 -9 Z"/>` +
    j(
      'j-chest',
      0,
      -28,
      sideArm('F', true) +
        `<path class="f-top" d="M-11.5 1 C-14.5 -10 -13 -22 -9 -29 Q1 -34 10 -29 C15 -21 16 -10 12.5 1 Z"/>` +
        `<path class="f-skin" d="M4 -30.5 Q9 -26 11.5 -29.5 Z"/>` +
        j('j-head', 1, -31, SIDE_HEAD) +
        sideArm('N', false),
    ) +
    `</g></g>`
  );
}

/**
 * @param {{name:string, view:'front'|'side', anim:string}} stretch
 * @param {{ still?: boolean }} opts  still: anahtar karede donmuş, hareketsiz gösterim
 */
export function renderFigure(stretch, { still = false } = {}) {
  ensureCss();
  const def = ANIMS[stretch.anim];
  const view = def?.view || stretch.view || 'front';
  const freeze = def ? -(def.dur * (def.key ?? 50)) / 100 : 0;
  const body = view === 'side' ? sideSvg() : frontSvg();
  return (
    `<svg class="fig fig-${view}${still ? ' fig-still' : ''}" data-anim="${stretch.anim}" ` +
    `style="--freeze:${freeze}s" viewBox="0 0 200 240" role="img" aria-label="${stretch.name} hareketi animasyonu">` +
    body +
    `</svg>`
  );
}

// scripts/preload.js
// Polished minimal sprites (SVG -> data URIs) and simple asset cache.

const svg = (w, h, body) =>
  `data:image/svg+xml;utf8,` +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>${body}</svg>`
  );

// --- ART STYLE (simple but crisp, outlined) ---
const OUT = "#0a0a0a";
const pink = "#f9a8d4";
const white = "#fff";
const navy = "#0ea5e9";
const leaf = "#22c55e";
const red = "#ef4444";

// Usagi (samurai rabbit)
const USAGI = {
  idle: svg(64,64,`
    <rect x='0' y='0' width='64' height='64' rx='8' fill='#0b1220'/>
    <g stroke='${OUT}' stroke-width='2' stroke-linecap='round'>
      <circle cx='32' cy='34' r='16' fill='${white}'/>
      <ellipse cx='24' cy='10' rx='5' ry='10' fill='${white}'/>
      <ellipse cx='40' cy='10' rx='5' ry='10' fill='${white}'/>
      <circle cx='27' cy='34' r='3' fill='${OUT}'/>
      <circle cx='37' cy='34' r='3' fill='${OUT}'/>
      <path d='M23 42 Q32 48 41 42' fill='none'/>
      <rect x='6' y='48' width='52' height='6' rx='3' fill='${navy}'/>
      <rect x='30' y='44' width='24' height='3' rx='1.5' fill='${pink}'/>
      <rect x='10' y='44' width='24' height='3' rx='1.5' fill='${pink}'/>
      <rect x='11' y='46' width='42' height='2' fill='${OUT}' opacity='.35'/>
    </g>`),
  walk: svg(64,64,`
    <rect width='64' height='64' rx='8' fill='#0b1220'/>
    <g stroke='${OUT}' stroke-width='2' stroke-linecap='round'>
      <circle cx='32' cy='32' r='16' fill='${white}'/>
      <ellipse cx='24' cy='8' rx='5' ry='10' fill='${white}' transform='rotate(-10,24,8)'/>
      <ellipse cx='40' cy='8' rx='5' ry='10' fill='${white}' transform='rotate(10,40,8)'/>
      <circle cx='27' cy='30' r='3' fill='${OUT}'/><circle cx='37' cy='30' r='3' fill='${OUT}'/>
      <path d='M18 48 l12 -6' stroke='${pink}'/><path d='M34 42 l12 6' stroke='${pink}'/>
      <rect x='8' y='50' width='20' height='5' rx='2.5' fill='${navy}'/>
      <rect x='36' y='50' width='20' height='5' rx='2.5' fill='${navy}'/>
    </g>`),
  attack: svg(96,64,`
    <rect width='96' height='64' rx='8' fill='#0b1220'/>
    <g stroke='${OUT}' stroke-width='2' stroke-linecap='round'>
      <circle cx='36' cy='32' r='16' fill='${white}'/>
      <ellipse cx='28' cy='8' rx='5' ry='10' fill='${white}'/><ellipse cx='44' cy='8' rx='5' ry='10' fill='${white}'/>
      <circle cx='31' cy='30' r='3' fill='${OUT}'/><circle cx='41' cy='30' r='3' fill='${OUT}'/>
      <path d='M50 24 L92 32 L50 40' stroke='${white}'/>
      <path d='M14 52 h24' stroke='${navy}'/><path d='M36 45 h20' stroke='${pink}'/>
    </g>`),
  jump: svg(64,64,`
    <rect width='64' height='64' rx='8' fill='#0b1220'/>
    <g stroke='${OUT}' stroke-width='2'>
      <circle cx='32' cy='26' r='16' fill='${white}'/>
      <ellipse cx='24' cy='4' rx='5' ry='10' fill='${white}'/><ellipse cx='40' cy='4' rx='5' ry='10' fill='${white}'/>
      <rect x='20' y='48' width='24' height='4' rx='2' fill='${navy}'/>
    </g>`),
  hurt: svg(64,64,`
    <rect width='64' height='64' rx='8' fill='#0b1220'/>
    <g stroke='${OUT}' stroke-width='2'>
      <circle cx='32' cy='32' r='16' fill='${white}'/>
      <path d='M24 24 l8 8 M32 24 l-8 8' stroke='${red}' stroke-width='3'/>
      <rect x='6' y='48' width='52' height='6' rx='3' fill='${navy}'/>
    </g>`),
  death: svg(64,64,`
    <rect width='64' height='64' rx='8' fill='#0b1220'/>
    <g stroke='${OUT}' stroke-width='2'>
      <ellipse cx='32' cy='48' rx='18' ry='8' fill='#0a0f18'/>
      <circle cx='32' cy='40' r='14' fill='${red}'/>
    </g>`)
};

// Ninja enemy
const NINJA = {
  idle: svg(64,64,`
    <rect width='64' height='64' rx='8' fill='#0b1220'/>
    <g stroke='${OUT}' stroke-width='2'>
      <rect x='16' y='16' width='32' height='28' rx='6' fill='#1f2937'/>
      <rect x='16' y='20' width='32' height='8' fill='#111827'/>
      <circle cx='26' cy='24' r='2' fill='${leaf}'/><circle cx='38' cy='24' r='2' fill='${leaf}'/>
      <rect x='10' y='46' width='44' height='6' rx='3' fill='#1e293b'/>
    </g>`),
  walk: svg(64,64,`
    <rect width='64' height='64' rx='8' fill='#0b1220'/>
    <g stroke='${OUT}' stroke-width='2'>
      <rect x='18' y='16' width='30' height='26' rx='6' fill='#1f2937'/>
      <rect x='18' y='20' width='30' height='8' fill='#111827'/>
      <circle cx='28' cy='24' r='2' fill='${leaf}'/><circle cx='38' cy='24' r='2' fill='${leaf}'/>
      <rect x='8' y='50' width='18' height='5' rx='2.5' fill='#1e293b'/>
      <rect x='38' y='50' width='18' height='5' rx='2.5' fill='#1e293b'/>
    </g>`),
  attack: svg(96,64,`
    <rect width='96' height='64' rx='8' fill='#0b1220'/>
    <g stroke='${OUT}' stroke-width='2'>
      <rect x='18' y='16' width='30' height='26' rx='6' fill='#1f2937'/>
      <rect x='18' y='20' width='30' height='8' fill='#111827'/>
      <circle cx='28' cy='24' r='2' fill='${leaf}'/><circle cx='38' cy='24' r='2' fill='${leaf}'/>
      <path d='M52 24 L90 32 L52 40' stroke='${white}'/>
    </g>`),
  jump: USAGI.jump,
  hurt: svg(64,64,`
    <rect width='64' height='64' rx='8' fill='#0b1220'/>
    <g stroke='${OUT}' stroke-width='2'>
      <rect x='16' y='20' width='32' height='24' rx='6' fill='#1f2937'/>
      <path d='M24 24 l8 8 M32 24 l-8 8' stroke='${red}' stroke-width='3'/>
    </g>`),
  death: USAGI.death
};

export const SPRITES = {
  usagi_idle: USAGI.idle,
  usagi_walk: USAGI.walk,
  usagi_attack: USAGI.attack,
  usagi_jump: USAGI.jump,
  usagi_hurt: USAGI.hurt,
  usagi_death: USAGI.death,
  ninja_idle: NINJA.idle,
  ninja_walk: NINJA.walk,
  ninja_attack: NINJA.attack,
  ninja_jump: NINJA.jump,
  ninja_hurt: NINJA.hurt,
  ninja_death: NINJA.death
};

export async function preloadImages() {
  const entries = await Promise.all(
    Object.entries(SPRITES).map(([key, url]) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res([key, img]);
      img.onerror = () => rej(new Error(`Image load failed: ${key}`));
      img.src = url;
    }))
  );
  return Object.fromEntries(entries);
}

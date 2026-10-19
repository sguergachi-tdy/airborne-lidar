// The field guide that wraps the three figures: chapters, equations, tables and a glossary, every number taken from the
// same models that drive the drawings.
import { rangingFig, maxRangeFig, swathFig, spacingFig, densityFig, georefFig, wavelengthFig, patternFig, echoFig } from "./guide-figs.mjs";
import { LASERS } from "./head-model.mjs";

const C = 299792458;

// set acronyms in small capitals, outside tags and outside drawings (a span is not SVG)
const ACRONYMS = /\b(PRF|GNSS|IMU|INS|POS|PPS|APD|SPAD|TDC|TIA|NOHD|GPS|UTC|MPiA|DCU)\b/g;
const smallCaps = (html) => {
  let inSvg = false;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<svg")) inSvg = true;
      else if (part === "</svg>") inSvg = false;
      return part.startsWith("<") || inSvg ? part : part.replace(ACRONYMS, '<span class="sc">$1</span>');
    })
    .join("");
};

// Terms worth reading more about, each to its Wikipedia article (titles checked against the API). The first mention in the
// prose is linked, and each glossary headword again; headings, table heads, figures and links are left alone.
const WIKI = [
  [/\blidar\b/i, "Lidar"],
  [/\bbat\b/, "Animal echolocation"],
  [/\bsonar\b/, "Sonar"],
  [/pulse repetition frequency|\bPRF\b/, "Pulse-repetition frequency"],
  [/\bgalvanometer\b/, "Galvanometer#Modern_uses"],
  [/\bPolygon\b/, "Laser scanning#Scanning_mirrors"],
  [/\bencoder\b/, "Rotary encoder"],
  [/\bGNSS\b/, "Satellite navigation"],
  [/\bbase station\b/, "Differential GNSS"],
  [/\bIMU\b/, "Inertial measurement unit"],
  [/\bgyros\b/, "Gyroscope"],
  [/\baccelerometers\b/, "Accelerometer"],
  [/roll, pitch and heading/, "Aircraft principal axes"],
  [/Kalman filter/, "Kalman filter"],
  [/\bPPS\b/, "Pulse-per-second signal"],
  [/\bGPS\b/, "Global Positioning System"],
  [/\bGalileo\b/, "Galileo (satellite navigation system)"],
  [/\bGLONASS\b/, "GLONASS"],
  [/\bBeiDou\b/, "BeiDou"],
  [/stabilised mount/, "Gimbal"],
  [/\bcrabbed\b/, "Crosswind landing#Crab"],
  [/total station/, "Total station"],
  [/angle of incidence/, "Angle of incidence (optics)"],
  [/point cloud/, "Point cloud"],
  [/near-infrared/, "Infrared#Regions"],
  [/beam expander/i, "Beam expander"],
  [/Galilean telescope/, "Refracting telescope"],
  [/\bcollimator\b/i, "Collimator"],
  [/fibre laser/, "Fiber laser"],
  [/objective lens/, "Objective (optics)"],
  [/field stop/, "Diaphragm (optics)"],
  [/relay lens/, "Relay lens"],
  [/narrowband filter/, "Interference filter"],
  [/avalanche photodiode|\bAPD\b/i, "Avalanche photodiode"],
  [/transimpedance amplifier/, "Transimpedance amplifier"],
  [/single-photon/, "Single-photon avalanche diode"],
  [/Peltier cooler/, "Thermoelectric heat pump"],
  [/\bRisley\b/, "Risley prisms"],
  [/Nd:YAG/, "Nd:YAG laser"],
  [/laser diode/, "Laser diode"],
  [/leap seconds/, "Leap second"],
  [/\bNOHD\b/, "Laser safety"],
  [/\bnadir\b/, "Nadir"],
  [/bathymetric lidar/, "Bathymetry#Airborne_laser_bathymetry"],
  [/refractive index/, "Refractive index"],
  [/bends towards the vertical/, "Snell's law"],
  [/constant-fraction trigger/, "Constant fraction discriminator"],
  [/time-to-digital counter/, "Time-to-digital converter"],
  [/\bspeckle\b/, "Speckle (interference)"],
  [/beam divergence/, "Beam divergence"],
];
const wikiLinks = (html) => {
  const prose = new Set();
  const gloss = new Set();
  let svg = 0, skip = 0, inGloss = false, inDt = false;
  const SKIP = /^<\/?(a|h1|h2|h3|th|figcaption)\b/;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (part.startsWith("<svg")) svg++;
        else if (part === "</svg>") svg--;
        else if (part.startsWith('<dl class="gd-gloss"')) inGloss = true;
        else if (part === "</dl>") inGloss = false;
        else if (/^<dt\b/.test(part)) inDt = true;
        else if (part === "</dt>") inDt = false;
        if (SKIP.test(part)) skip += part[1] === "/" ? -1 : 1;
        return part;
      }
      if (svg || skip || (inDt && !inGloss) || !part.trim()) return part;
      const seen = inGloss && inDt ? gloss : prose;
      const hits = [];
      for (const [re, title] of WIKI) {
        if (seen.has(title)) continue;
        const m = re.exec(part);
        if (m) hits.push({ i: m.index, j: m.index + m[0].length, title });
      }
      hits.sort((a, b) => a.i - b.i);
      let out = "", at = 0;
      for (const h of hits) {
        if (h.i < at || seen.has(h.title)) continue;
        seen.add(h.title);
        const name = h.title.split("#")[0];
        out += part.slice(at, h.i) + `<a class="gd-wiki" href="https://en.wikipedia.org/wiki/${encodeURI(h.title.replace(/ /g, "_"))}" target="_blank" rel="noopener" title="Wikipedia: ${name}">${part.slice(h.i, h.j)}</a>`;
        at = h.j;
      }
      return out + part.slice(at);
    })
    .join("");
};

export function guideHtml({ LIDAR, HM, HF, CAL, fig1, fig2, fig3, scans }) {
  const pat = (id, words) => `<td class="gd-pat-cell">${patternFig(id)}<span>${words}</span></td>`;
  const scan = (id, name) => `<td class="gd-scan">${scans[id]}<span>${name}</span></td>`;
  const f = (v, d = 0) => Number(v).toFixed(d);
  const alt = LIDAR.metres;
  const roundTrip = ((2 * alt) / C) * 1e6;
  const rollError = alt * Math.tan(Math.PI / 180);
  const spotCm = (LIDAR.divergence ?? 0.25e-3) * alt * 100;
  const S = HM.SCANNERS;
  const F = HM.FLIGHT;

  const chapters = [
    ["ranging", "Ranging with light"],
    ["prf", "Pulses and the PRF"],
    ["scanning", "Sweeping the beam"],
    ["position", "Knowing where you are"],
    ["returns", "What comes back"],
    ["head", "Inside the sensor head"],
    ["scanners", "Five ways to scan"],
    ["spacing", "Scan frequency and point spacing"],
    ["wavelength", "Choosing a wavelength"],
    ["receivers", "Listening for echoes"],
    ["boresight", "Putting each point on the map"],
  ];
  const head = (i) => {
    const [id, title] = chapters[i];
    return `<header class="gd-chapter" id="${id}"><span class="gd-num">${String(i + 1).padStart(2, "0")}</span><h2>${title}</h2></header>`;
  };
  const tryIt = (html) => `<aside class="gd-try"><span class="gd-label">Try it</span><p>${html}</p></aside>`;
  const note = (label, html) => `<aside class="gd-note"><span class="gd-label">${label}</span><p>${html}</p></aside>`;
  // a number strip whose inputs are sliders; every [data-k] on the page follows them (guide-live.js)
  const k = (key, v) => `<span data-k="${key}">${v}</span>`;
  const tune = (rows) =>
    `<dl class="gd-stats gd-tune" data-target="maxRange">${rows
      .map(([label, v, u, key, r]) => `<div${Array.isArray(r) ? ` class="gd-in"` : ""}><dt>${label}</dt><dd>${k(key, v)}<small>${u}</small></dd>${Array.isArray(r) ? `<input class="gd-range" type="range" data-in="${key}" min="${r[0]}" max="${r[1]}" step="${r[2]}" value="${v}" aria-label="${r[3]}">` : `<p class="gd-rel">${r}</p>`}</div>`)
      .join("")}</dl>`;
  const eq = (math, gloss, drawing = "", anim = "") => `<figure class="gd-eq${drawing ? " gd-eq-drawn" : ""}"${anim ? ` data-anim="${anim}"` : ""}>${drawing}<div class="gd-eq-math">${math}</div><figcaption>${gloss}</figcaption></figure>`;

  const html = `
<article class="gd">
  <header class="gd-mast gd-col">
    <div class="gd-mast-top"><p class="gd-kicker">A field guide</p><div class="gd-theme" role="group" aria-label="Colour theme" hidden>${["auto", "light", "dark"].map((t) => `<button type="button" data-theme-pick="${t}" aria-pressed="false">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></div>
    <h1>How airborne lidar works</h1>
    <p class="gd-dek">An airborne lidar maps the ground from an aircraft with a laser. It fires short pulses of light downwards, hundreds of thousands a second, and times how long each takes to bounce back, which gives the distance. Add where the aircraft is and which way it points, and every echo becomes a point on the map.</p>
    <p class="gd-meta"><span>About 15 minutes</span></p>
    <nav class="gd-toc" aria-label="Contents">
      <span class="gd-label">Contents</span>
      <ol>${chapters.map(([id, title], i) => `<li><a href="#${id}"><span class="gd-toc-n">${String(i + 1).padStart(2, "0")}</span><span>${title}</span></a></li>`).join("")}<li><a href="#glossary"><span class="gd-toc-n">+</span><span>Glossary</span></a></li></ol>
    </nav>
  </header>

  <section class="gd-col">
    ${head(0)}
    <p class="gd-lede">Lidar (<em>light detection and ranging</em>) measures distance by timing an echo, as a bat or a ship's sonar does, but with light instead of sound. A laser sends a short pulse of light towards the ground. A little of it scatters back to a telescope in the sensor, and a counter measures how long the round trip took.</p>
    <p>Light covers about 30 cm every nanosecond, and the pulse travels there and back, so the range is half the round trip:</p>
    ${eq(`<i>R</i> = <i>c</i> · Δ<i>t</i> / 2`, "one nanosecond of round trip is 15 cm of range; one microsecond, 150 m", rangingFig(LIDAR), "ranging")}
    <p>In Figure 1 the aircraft flies ${alt} m above a small square of country. An echo from straight below comes home about ${f(roundTrip, 2)} µs after the laser fires. The timing board starts its count the instant the laser fires, called T<sub>0</sub>, and stops on each echo. To place a point to a few centimetres, it has to resolve fractions of a nanosecond.</p>
  </section>

  <div class="gd-fig ln">FIG1</div>

  <section class="gd-col">
    ${tryIt("Drag the aircraft across Figure 1 to fly it along the road, or use the arrow keys; hover any part to read what it is. Click, or press Space, to slow time a million-fold: one microsecond then lasts a whole second, and you can watch single pulses go down and their echoes come back. The scope under the drawing is the operator's monitor.")}

    ${head(1)}
    <p>The laser does not shine continuously. It fires short, bright pulses, ${LIDAR.prf / 1000} thousand of them a second in Figure 1. That rate is the <em>pulse repetition frequency</em>, the PRF, and it sets how many points land on the ground.</p>
    ${tune([
      ["PRF", f(LIDAR.prf / 1000), "kHz", "prf", [250, 900, 10, "Pulse repetition frequency, kilohertz"]],
      ["Pulse width", f(LIDAR.pulseWidth * 1e9, 1), "ns", "pw", [1, 9.5, 0.5, "Pulse width, nanoseconds"]],
      ["Light in the air", f(LIDAR.pulseMetres, 1), "m", "metres", "= c × pulse width"],
      ["Pulse period", f(LIDAR.period * 1e6, 2), "µs", "period", "= 1 / PRF"],
    ])}
    <p>Each pulse is ${k("pw", f(LIDAR.pulseWidth * 1e9, 1))} ns long, a ${k("metres", f(LIDAR.pulseMetres, 1))} m slab of light, and the next one follows ${k("period", f(LIDAR.period * 1e6, 2))} µs later. The PRF also sets a limit. An echo from farther away than</p>
    ${eq(`<i>R</i><sub>max</sub> = <i>c</i> / (2 · PRF) = ${k("rmax", f(LIDAR.maxRange))} m`, "the unambiguous range", maxRangeFig(LIDAR), "maxRange")}
    <p>arrives only after the next pulse has fired, and the counter would time it against the wrong T<sub>0</sub>. Here that is far beyond the ground, so only one pulse is ever in the air. At a typical survey height of a kilometre or more, though, any PRF above about 150 kHz puts two or more pulses in the air at once. The system must then work out which pulse each echo belongs to, which is called <em>multiple pulses in air</em>.</p>

    ${head(2)}
    <p>A fixed beam draws a single line along the track. To map a strip of country, a mirror sweeps the beam from side to side across the track while the aircraft's own motion carries the sweeps forward, so the points trace a zigzag.</p>
    <p>In Figure 1 the mirror rides on a <em>galvanometer</em>, a motor built to turn a small mirror back and forth quickly and precisely. It swings ${LIDAR.scanHz} times a second. A mirror turned by θ/2 deflects the reflected beam by θ, so ±9° of shaft gives ±${LIDAR.half}° of scan and a ${f(LIDAR.swath)} m swath across the road. An encoder on the shaft reports the mirror's angle for every pulse.</p>
    ${eq(`swath = 2 · <i>h</i> · tan θ<sub>half</sub>`, `${alt} m × 2 × tan ${LIDAR.half}° ≈ ${f(LIDAR.swath)} m`, swathFig(LIDAR), "swath")}

    ${head(3)}
    <p>A range and a mirror angle give a line of sight from the sensor, not a point on the Earth. To turn one into the other, the system has to know where the aircraft was and which way the head pointed at the instant of each pulse, to a few centimetres and a few thousandths of a degree. That is the job of a <em>position and orientation system</em> (POS).</p>
    <ul class="gd-list">
      <li><b>GNSS antenna</b> on the crown of the fuselage, with a clear view of the sky. Its cable runs down to the GNSS receiver in the POS computer, which fixes the antenna's position several times a second.</li>
      <li><b>IMU</b> bolted rigidly to the sensor head: three gyros and three accelerometers, read 200 times a second. It measures roll, pitch and heading, and carries the position smoothly between GNSS fixes.</li>
      <li><b>POS computer</b> on the cabin floor. A Kalman filter blends the GNSS fixes and the IMU's readings into a trajectory: where the aircraft was and how it was turned, all through the flight. In the air this solution guides the pilot along the flight lines and lets the operator check coverage.</li>
      <li><b>Sensor computer</b> beside it. It runs the laser and scanner, logs every range and scan angle with its time, and draws the live waveform on the operator's monitor. In Figure 1 both computers share one rack.</li>
    </ul>
    <p>The POS and the sensor keep separate clocks. The GNSS receiver puts out a <em>PPS</em>, a pulse on the edge of every GPS second, followed by a message that names the second. The sensor logs when each of those pulses arrives on its own clock, alongside its shots. Afterwards, on the sensor computer, those marks convert every shot's time to GPS time, the trajectory's clock, so each range can be matched to the position and attitude at its instant.</p>
    <p>The trajectory that places the points is also computed after the flight. A GNSS base station on a surveyed point, the tripod at the edge of Figure 1, logs the same satellites all through the flight. Differencing the two receivers removes most of the satellite orbit and atmosphere errors, and the Kalman filter is run forwards and backwards over the whole flight, for a trajectory good to a few centimetres.</p>
    <p>Two calibrations, measured once, tie the sensor to the trajectory. The <em>lever arm</em> is the offset from the antenna to the IMU and on to the scanner, and the <em>boresight</em> is the small set of angles between the IMU and the scanner. The lever arm is measured with a tape or a total station; the boresight is too small to measure that way, and chapter 11 finds it from the data.</p>
    <p>The housing also rides on a stabilised mount. It takes out most of the aircraft's roll and pitch, and turns the head against drift (the yaw of flying crabbed into a crosswind) so the scan line stays square to the track. The IMU on the head measures whatever motion is left, and the mount logs its own angles, because tilting the head under the antenna changes the lever arm.</p>
    ${note("Why it matters", `At ${alt} m, one degree of unmeasured roll moves a point ${f(rollError, 1)} m sideways, dozens of times the few centimetres a survey aims for.`)}
    ${tryIt("Below Figure 2, switch Position and attitude to GNSS only or None. The aircraft is always rolled and pushed by gusts; what changes is what the processing knows about it. Each point is placed where the system thinks its pulse fell, and a white ring, joined by a thread, marks where it really landed. With GNSS only, the system assumes the aircraft was level, so the points still form a clean pattern but sit metres off the ground they came from. With None it also assumes the aircraft flew exactly along its plan, drawn dashed.")}

    ${head(4)}
    <p>A pulse leaves as a narrow beam that spreads very slowly, about ${f(spotCm)} cm across by the time it reaches the ground. What comes back depends on what that small spot meets.</p>
    <ul class="gd-list">
      <li><b>Solid surfaces</b>, such as roads, roofs and lawns, give a single echo. Its strength, the <em>intensity</em>, depends mostly on the material: at 1064 nm grass and concrete return far more light than asphalt. Range and a steep angle of incidence weaken every echo too, so raw intensity is corrected before it is compared across a survey.</li>
      <li><b>Trees</b> let part of a pulse through their gaps. One pulse can give a first return from the canopy, more from branches and shrubs, and a last return from the ground beneath. This is how lidar maps the terrain under a forest.</li>
      <li><b>Buildings</b> cast shadows. Behind a house, where no pulse can reach, the point cloud has a hole.</li>
      <li><b>Calm water</b> acts like a mirror. A near-infrared pulse comes back only when the beam looks almost straight down; elsewhere it glances away and leaves a gap.</li>
    </ul>
    <p>The map in Figure 2 colours every point by how many returns its pulse gave. The ramp follows the laser's own hue, dark for one return and bright for four or more, so tree crowns light up against the single-return ground.</p>

    ${head(5)}
    <p>Loupe A in Figure 1 is a lens over the sensor housing. Figure 2 looks through it at the sensor head on its optical bench. Every control below the figure rebuilds the model, and hovering any part opens a card saying what it does and why the lidar needs it.</p>
  </section>

  <div class="gd-fig gd-fig-wide ln"><div class="hd">FIG2</div></div>

  <section class="gd-col">
    ${tryIt("Turn the zoom ring on the loupe past 2× and the receive path opens in half-section. The time ring on the opposite edge slows the head to a millionth of real time, where single pulses travel as bullets. Click to pause.")}
    <h3>The way out</h3>
    <p>Depending on the laser, the beam first passes a <em>beam expander</em> or a collimator. A solid-state laser such as the Nd:YAG already gives a narrow, nearly parallel beam, and a beam expander, a small Galilean telescope, makes it several times wider. A wider beam spreads less, so it lights a smaller footprint on the ground. A fibre laser's light leaves the tip of its fibre spreading quickly, so a fibre collimator first makes it parallel; in Figure 2 an expander then widens it as well. A small mirror turns the beam into the scanner and out through the window.</p>
    <h3>The way back</h3>
    <p>The echo returns through the same scanner to the receiving telescope. Its objective lens focuses the light onto a <em>pinhole field stop</em>, which blocks light from anywhere but the lit spot. A relay lens makes the light parallel again for a <em>narrowband filter</em> that rejects sunlight. The light then reaches the detector, either an avalanche photodiode (APD) in a TO can wired to a transimpedance amplifier, or a microlensed single-photon (SPAD) array on a Peltier cooler.</p>
    <h3>Sharing one path</h3>
    <p>The outgoing beam is narrow and the echo is wide, so where they share a path the two must be separated. Either a small <em>injection mirror</em> sits in the middle of the returning bundle and the telescope gathers the ring of light around it, or a <em>holed (scraper) mirror</em> lets the pulse out through its centre and turns the echo aside with its rim. In both cases the few percent of echo that hits the small mirror or the hole is lost.</p>
    <p>Not every sensor shares a path. In a <em>biaxial</em> design the transmitter and the receiver look out side by side, each through its own optics, so no echo is lost to a shared mirror. The price is alignment: the beam and the receiver's field of view only overlap beyond a certain range, and must stay aligned across the whole scan and through temperature changes. Teledyne Optech's Titan, Echo and Pegasus were biaxial.</p>

    ${head(6)}
    <p>The scanner decides the pattern on the ground, and each design trades something. Choose one below Figure 2 and watch the top-down view redraw at ${F.alt} m and ${F.speed} m/s. The small drawings in the table trace the same model, flying to the right; the aircraft's advance between lines is exaggerated so the lines separate.</p>
    <div class="gd-table-wrap"><table class="gd-table">
      <thead><tr><th>Scanner</th><th>What moves</th><th>Pattern on the ground</th><th>Trade-off</th></tr></thead>
      <tbody>
        <tr>${scan("galvo", "Galvo")}<td>A mirror swinging back and forth, ±${S.galvo.half}° of beam</td>${pat("galvo", "Zigzag")}<td>A field of view set in software, but points bunch at the edges where the mirror slows to turn</td></tr>
        <tr>${scan("polygon", "Polygon")}<td>A spinning mirror with 3 to 8 facets; a facet turned by φ deflects the beam by 2φ</td>${pat("polygon", "Parallel lines, evenly spaced")}<td>Fewer facets give longer lines; pulses that hit a corner between facets are lost</td></tr>
        <tr>${scan("palmer", "Palmer")}<td>A mirror tilted ${S.palmer.tilt}° on a spinning shaft, so its normal sweeps a cone</td>${pat("palmer", "Overlapping ellipses")}<td>Every spot is seen twice, once looking forward and once looking back, which helps fill shadows</td></tr>
        <tr>${scan("risley", "Risley")}<td>Two ${S.risley.wedge}° wedge prisms turning on the beam</td>${pat("risley", "A line, a circle, a spiral or, as drawn, a rosette")}<td>Compact, with no mirror; the pattern depends on the two prisms' speeds and directions and their phase</td></tr>
        <tr>${scan("flash", "Flash")}<td>Nothing</td>${pat("flash", `A ${S.flash.grid} × ${S.flash.grid} grid per frame`)}<td>No moving parts, at up to ${HM.FLASH_RATE} frames a second, but each pulse's energy is shared by every pixel</td></tr>
      </tbody>
    </table></div>

    ${head(7)}
    <p>Scan frequency is how fast the scanner runs: swings a second for a galvo, and turns a second for a polygon, a Palmer mirror or the first Risley prism. It sets how many scan lines are drawn each second while the aircraft flies on at ${F.speed} m/s, so successive lines land</p>
    ${eq(`spacing<sub>along</sub> = ground speed / lines per second`, "a faster scan closes the gaps between lines", spacingFig(LIDAR), "spacing")}
    <p>At a fixed PRF, however, a faster scan leaves fewer pulses on each line, so they land farther apart across the track. The overall density does not change; only how the points are spread along and across the track does:</p>
    ${eq(`density ≈ PRF / (ground speed × swath)`, `${LIDAR.prf / 1000} kHz / (${LIDAR.speed} m/s × ${f(LIDAR.swath)} m) ≈ ${f(LIDAR.density)} points per m²`, densityFig(LIDAR), "density")}
    <p>Surveyors tune the two together so the spacing is about equal in both directions, an even grid rather than dense lines with gaps between them.</p>

    ${head(8)}
    <p>The laser's colour decides what it sees. The four common choices behave very differently over leaves, snow and water.</p>
    <figure class="gd-eq gd-eq-drawn gd-chart">${wavelengthFig(LASERS)}<figcaption>typical reflectance; dot area ∝ light returned · ○ no usable echo · under the bed, the depth in which clear water halves the light</figcaption></figure>
    <div class="gd-table-wrap"><table class="gd-table">
      <thead><tr><th>Laser</th><th>Leaves and ground</th><th>Water</th><th>Eye safety</th></tr></thead>
      <tbody>
        <tr><td>532 nm green</td><td>Weaker</td><td>Passes through clear water to the bed: bathymetric lidar</td><td>The least eye-safe: it passes through the eye to the retina, and needs the longest safe distance (NOHD)</td></tr>
        <tr><td>905 nm diode</td><td>Bright off vegetation</td><td>Stops at the surface; returns only near nadir</td><td>Reaches the retina too, but the low pulse energy of a diode keeps most sensors eye-safe</td></tr>
        <tr><td>1064 nm Nd:YAG</td><td>Bright off vegetation</td><td>Stops at the surface; returns only near nadir</td><td>Reaches the retina; needs a safe distance (NOHD), so flying height is planned around it</td></tr>
        <tr><td>1550 nm Er fibre</td><td>Moderate</td><td>Absorbed: water shows as gaps</td><td>Absorbed by the water in the front of the eye before it reaches the retina, so eye-safe at far higher power</td></tr>
      </tbody>
    </table></div>
    <p>Water slows light by about a quarter (its refractive index is about 1.33), so each metre of depth adds a third more travel time than a metre of air. The beam also bends towards the vertical as it enters, so the echo from a pond bed must be corrected for both before the depth is right.</p>
    <p>Eye safety comes down to where the light stops. The eye's clear fluids pass green and near-infrared light, and its lens focuses that light to a tiny, intense spot on the retina. At 1550 nm the water in the cornea and the fluid behind it absorbs the light first, spread over a much larger area, so a far stronger pulse is still safe.</p>
    <p>The 905 nm laser is a pulsed laser diode: cheap, small and efficient. It is what most automotive and mobile lidars use, from makers such as Velodyne and Hesai. Its pulses are weak, though, which limits its range, so survey sensors flown at a kilometre or more use the brighter solid-state and fibre lasers.</p>

    ${head(9)}
    <p>The detector turns a few nanoseconds of light into numbers. There are three common ways to listen. Each drawing is one pulse through the same 12 m tree, with range increasing to the right: canopy, branches, a shrub 80 cm tall, then the ground. The faint curve is the light reaching the detector, and red is what the receiver keeps.</p>
    <dl class="gd-defs gd-rx">
      <dt>${echoFig("discrete")}Discrete returns</dt><dd>A constant-fraction trigger fires on each peak above the threshold (dashed), and a time-to-digital counter (TDC) times it. It keeps several returns per pulse, typically four to eight, and is fast and compact. After each trigger it is blind for about a pulse length, so here the shrub merges into the ground and only three returns are kept.</dd>
      <dt>${echoFig("waveform")}Full waveform</dt><dd>The whole echo is sampled a billion times a second, one sample per 15 cm of range. The returns are found later in processing, which can pull apart echoes too close together for a discrete receiver, such as the shrub's shoulder just before the ground.</dd>
      <dt>${echoFig("photon")}Single photon</dt><dd>A SPAD array registers single photons, only a few per shot. That takes very little energy per pulse, so it can run at very high PRF and altitude. Sunlight adds stray photons at every range; a surface shows up where detections from many shots line up, and the lone ones are filtered out. The drawing stacks 400 shots.</dd>
    </dl>
    <p>The scope beside Figure 2 shows both views: the pulse train over 3 µs, with every T<sub>0</sub> and the echo that belongs to it, and below it one pulse's echo laid out in range. It reads whatever surface the last pulse hit on the map, marked there with a cross. Nothing repeats exactly: speckle, gaps in a tree's crown and receiver noise change every echo.</p>
  </section>

  <section class="gd-col">
    ${head(10)}
    <p class="gd-lede">Every point in the cloud is placed by one equation. It starts at the antenna, turns by the aircraft's attitude, steps along the lever arm to the scanner, and follows the pulse out along its range:</p>
    ${eq(`<b>p</b> = <b>g</b> + <i>R</i><sub>nav</sub> · ( <b>l</b> + <i>R</i><sub>bore</sub> · ρ · <b>u</b>(θ) )`, "position from GNSS, attitude from the IMU, the lever arm, the boresight, the range and the scan angle", georefFig(LIDAR), "georef")}
    <ul class="gd-list">
      <li><b>g</b> and <i>R</i><sub>nav</sub>: where the antenna was and how the aircraft was turned, from the POS trajectory.</li>
      <li><b>l</b>: the lever arm from the antenna, through the IMU, to the scanner's origin, measured once on the ground.</li>
      <li><i>R</i><sub>bore</sub>: the boresight, three small angles from the IMU's axes to the scanner's.</li>
      <li>ρ and <b>u</b>(θ): the range from the timing board and the direction the mirror sent the pulse.</li>
    </ul>
    <p>The equation is the outline; real processing works in two stages. First a <em>sensor model</em> of the scanner's optics, calibrated for each instrument, corrects its own small errors: an encoder that reads slightly off zero or off scale, a mirror that sits tilted or wobbles on its shaft, a beam that meets the mirror slightly off axis. It turns each range and encoder reading into a true vector in the scanner's frame. Only then is that vector merged with the trajectory from the POS, through the lever arm and boresight.</p>
    <p>The boresight is the hard one. The IMU and the scanner are bolted to the same plate, but machining and assembly leave them a few tenths of a degree apart, and a tenth of a degree is ${f(CAL.H * Math.tan(Math.PI / 1800) * 100)} cm on the ground from ${CAL.H} m. No ruler can see it, so it is found from the data, by flying over buildings and asking the strips to agree.</p>
    <h3>How each angle shows itself</h3>
    <ul class="gd-list">
      <li><b>Roll</b> tilts the scan line. Two strips flown in opposite directions tilt opposite ways, so a flat field comes out as a shallow X: one strip high on the left, the other high on the right.</li>
      <li><b>Pitch</b> leans the scan forwards or back, shifting every point along the track. Fly the other way and the shift reverses, so a gable seen from both strips is drawn twice, apart.</li>
      <li><b>Heading</b> twists the scan line about the vertical. Points far out on one side move forwards and the other side back, so the shift along the track grows with distance from the flight line.</li>
    </ul>
  </section>

  <div class="gd-fig gd-fig-wide ln"><div class="hd cb">\u0001FIG3\u0001</div></div>

  <section class="gd-col">
    ${tryIt("Press Solve with the opposite pair. The strips come to agree to a few centimetres, yet the table shows pitch and heading still wrong and the readout says the points are off. Switch to + Cross line and Solve again: now both numbers fall. Turn the screws, or press Misalign, and do it again.")}
    <h3>Why one pair is not enough</h3>
    <p>Over a pair of opposite lines, pitch and heading do much the same thing to the roofs in between: both slide them along the track, and both reverse with the flight direction. A wrong pitch can be hidden by a wrong heading, and the two strips then agree perfectly while both are in the wrong place. Matching strips is only proof that the processing is self-consistent.</p>
    <p>A third line flown across the others looks at the same roofs from 90°. Its pitch error slides them along its own track, which runs across the pair's, and its heading error does the same by an amount that grows with distance from its line. The pitch and heading that let the pair agree now push the cross line's roofs off theirs, so only the true angles make all three strips agree. Real calibration flights use exactly this pattern: opposite pairs at two heights and a cross line, over a site with pitched roofs facing different ways, solved by fitting planes to every surface the strips share.</p>
    ${note("In practice", "The solve is run once after installation and checked on every project. A knock to the mount, a new lens or a removed and refitted scanner means flying the calibration pattern again.")}
    <h3>When the clocks disagree</h3>
    <p>Every shot finds its position and attitude by its time, so the sensor's clock and the trajectory's must agree. If the shot times are off, each shot is placed with the aircraft's position and attitude from a slightly different instant. At ${F.speed} m/s, 1 ms of error moves every point ${f(F.speed * 0.1, 1)} cm along the track, which looks like a steady shift. Attitude is less forgiving: in a 10°/s roll, 1 ms is 0.01°, or ${f(1000 * Math.tan(0.01 * Math.PI / 180) * 100)} cm on the ground from 1000 m, and the error reverses as the aircraft rolls back. Flat ground then comes out wavy where the air was rough and true where it was calm, and no boresight can fix it.</p>
    <p>Typical causes are a missing or noisy PPS, a time message matched to the wrong pulse, the 18 leap seconds between GPS time and UTC, and fixed delays in the IMU's or the scanner's data path. The check is to fly over flat ground with deliberate rolls and look for ripples that follow the roll rate.</p>
  </section>

  <section class="gd-col gd-end">
    <header class="gd-chapter" id="glossary"><span class="gd-num">APPENDIX</span><h2>Glossary</h2></header>
    <dl class="gd-gloss">
      <dt>APD</dt><dd>Avalanche photodiode: a detector that multiplies each photoelectron into a measurable current.</dd>
      <dt>Beam expander</dt><dd>A small telescope that widens a laser's beam so it diverges less.</dd>
      <dt>Biaxial</dt><dd>A design in which the transmitter and the receiver look out through separate optics, side by side; the alternative to a coaxial design that shares one path.</dd>
      <dt>Boresight</dt><dd>The small angles between the IMU's axes and the scanner's, measured once in calibration.</dd>
      <dt>Boresight calibration</dt><dd>Finding the boresight from overlapping strips, by adjusting it until surfaces seen from several lines agree.</dd>
      <dt>Collimator</dt><dd>A lens that makes spreading light parallel, such as the one at the tip of a fibre laser's delivery fibre.</dd>
      <dt>Footprint</dt><dd>The patch of ground one pulse lights, set by beam divergence and range.</dd>
      <dt>GNSS</dt><dd>Satellite positioning: GPS, Galileo, GLONASS, BeiDou.</dd>
      <dt>IMU</dt><dd>Inertial measurement unit: gyros and accelerometers that measure rotation and acceleration.</dd>
      <dt>Kalman filter</dt><dd>The estimator that blends GNSS fixes and IMU readings into one smooth trajectory: in real time in the air, and again after the flight with base-station data, run forwards and backwards.</dd>
      <dt>Lever arm</dt><dd>The measured offset from the GNSS antenna to the IMU, and from the IMU to the scanner.</dd>
      <dt>Multiple pulses in air</dt><dd>Firing again before the last echo is home; each echo must be matched to its pulse.</dd>
      <dt>POS</dt><dd>Position and orientation system: the GNSS receiver, IMU and computer that together give the trajectory.</dd>
      <dt>PPS</dt><dd>Pulse per second: a pulse from the GNSS receiver on the edge of each GPS second, which ties the sensor's clock to GPS time.</dd>
      <dt>PRF</dt><dd>Pulse repetition frequency: laser shots per second.</dd>
      <dt>Return</dt><dd>One echo above threshold. A pulse can give several: first, intermediate and last.</dd>
      <dt>Swath</dt><dd>The width of ground covered across the track in one pass.</dd>
      <dt>T<sub>0</sub></dt><dd>The instant the laser fires, where the timing count starts.</dd>
      <dt>Unambiguous range</dt><dd>c / (2 · PRF): the farthest range timed before the next pulse fires.</dd>
    </dl>

    <aside class="gd-colophon">
      <span class="gd-label">About the drawings</span>
      <p>All three figures are drawn from the same models that compute their readouts. Figure 1 flies ${f(LIDAR.slow)}× slower and scans ${f(LIDAR.scanSlow)}× slower than the real thing, and it shows one scan line in ${f(LIDAR.sweepDecimation)} and one pulse in ${f(LIDAR.pulseDecimation)}. In Figure 2 the pulse fan and the map run 100× slower than real time, and the map stretches the distance flown 12× so scan lines separate, showing one pulse in 20. Both heads are drawn far larger than they are, the spot larger than its true few centimetres, and the mirror's turnarounds are left out. Figure 3 draws the scanner's mount turned ${CAL.EXAG}× as far as its screws set it, so that tenths of a degree can be seen, and processes one pulse in ${CAL.shown}.</p>
      <p>This page was made with Claude Opus 5.5.</p>
    </aside>
  </section>
</article>`;
  return smallCaps(wikiLinks(html)).replace("\u0001FIG1\u0001", () => fig1).replace("\u0001FIG2\u0001", () => fig2).replace("\u0001FIG3\u0001", () => fig3);
}

"use strict";

const COLORS = {
  ink: "#17211d",
  grid: "#d9dfdc",
  muted: "#66716c",
  bus1: "#e9653b",
  bus2: "#367fa9",
};

function simulate(gamma, s1, s2, numTrips = 2000) {
  let pending0 = 1.0, pending1 = 2.5;
  let trip0 = 0, trip1 = 0, lastArrival = 0;
  const arrivals = [[], []], headways = [[], []], events = [];

  while (trip0 <= numTrips || trip1 <= numTrips) {
    const bus = pending0 <= pending1 ? 0 : 1;
    const time = bus === 0 ? pending0 : pending1;
    const trip = bus === 0 ? trip0 : trip1;
    const speedup = bus === 0 ? s1 : s2;
    const headway = Math.max(time - lastArrival, 0);
    const loadDelay = gamma * headway;
    const travelTime = 1 / (1 + speedup * headway);

    arrivals[bus].push(time);
    headways[bus].push(headway);
    events.push({ time, bus, trip, headway, loadDelay, travelTime });
    lastArrival = time;

    if (trip === numTrips) {
      if (bus === 0) { pending0 = Infinity; trip0 += 1; }
      else { pending1 = Infinity; trip1 += 1; }
      continue;
    }

    const next = time + loadDelay + travelTime;
    if (!Number.isFinite(next) || next > 1e12) break;
    if (bus === 0) { pending0 = next; trip0 += 1; }
    else { pending1 = next; trip1 += 1; }
  }

  return {
    arrivals,
    headways,
    events,
    tours: arrivals.map(values => values.slice(1).map((value, i) => value - values[i])),
  };
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const rms = values => {
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
};

function classify(values) {
  if (rms(values) < 1e-7) return "Regular";
  const period = new Set(values.slice(-500).map(value => value.toFixed(7))).size;
  return period <= 40 ? `Period ${period}` : "Chaotic";
}

const elements = Object.fromEntries(
  [
    "gamma", "s1", "s2", "animation-speed", "gamma-output", "s1-output", "s2-output",
    "speed-output", "play-pause", "step", "reset", "trip-scrubber", "trip-output",
    "regime", "model-time", "waiting-count", "last-headway", "bus1-trip", "bus2-trip",
    "event-label", "next-tour-value", "bus-1", "bus-2", "passengers", "headway-chart",
    "return-map", "tour-chart", "h1-mean", "h1-rms", "h2-mean", "h2-rms",
    "t1-mean", "t1-rms", "t2-mean", "t2-rms",
  ].map(id => [id, document.getElementById(id)])
);

let result;
let playing = true;
let cursor = 0;
let eventProgress = 0;
let lastFrame = performance.now();
let renderedPassengerCount = -1;
let resizeTimer;

function rebuild() {
  const gamma = Number(elements.gamma.value);
  const s1 = Number(elements.s1.value);
  const s2 = Number(elements.s2.value);
  result = simulate(gamma, s1, s2);
  elements["gamma-output"].value = gamma.toFixed(3);
  elements["s1-output"].value = s1.toFixed(2);
  elements["s2-output"].value = s2.toFixed(2);
  elements.regime.textContent = classify(result.headways[0].slice(1000, 2000));
  updateStatistics();
  cursor = Math.min(cursor, result.events.length - 2);
  eventProgress = 0;
  renderPlots();
  renderAnimation();
}

function updateStatistics() {
  const values = {
    h1: result.headways[0].slice(1000, 2000),
    h2: result.headways[1].slice(1000, 2000),
    t1: result.tours[0].slice(1000, 2000),
    t2: result.tours[1].slice(1000, 2000),
  };
  for (const name of ["h1", "h2", "t1", "t2"]) {
    elements[`${name}-mean`].textContent = mean(values[name]).toFixed(5);
    elements[`${name}-rms`].textContent = rms(values[name]).toFixed(5);
  }
}

function eventPhase(progress, event) {
  const loadingFraction = Math.min(0.28, 0.08 + event.loadDelay * 0.18);
  const outwardEnd = loadingFraction + (1 - loadingFraction) * 0.5;
  if (progress < loadingFraction) return { name: "loading", position: 0 };
  if (progress < outwardEnd) {
    return { name: "outbound", position: (progress - loadingFraction) / (outwardEnd - loadingFraction) };
  }
  return { name: "return", position: 1 - (progress - outwardEnd) / (1 - outwardEnd) };
}

function setBusPosition(busElement, phase) {
  const left = 9 + phase.position * 82;
  const top = phase.name === "return" ? 66 : 38;
  busElement.style.left = `${left}%`;
  busElement.style.top = `${top}%`;
  busElement.style.opacity = "1";
}

function renderAnimation() {
  if (!result || !result.events.length) return;
  const event = result.events[cursor];
  const next = result.events[Math.min(cursor + 1, result.events.length - 1)];
  const activeBus = event.bus === 0 ? elements["bus-1"] : elements["bus-2"];
  const otherBus = event.bus === 0 ? elements["bus-2"] : elements["bus-1"];
  const phase = eventPhase(eventProgress, event);
  setBusPosition(activeBus, phase);

  const otherEvents = result.events.slice(0, cursor + 1).filter(item => item.bus !== event.bus);
  const otherLast = otherEvents.at(-1);
  const otherNext = result.events.slice(cursor + 1).find(item => item.bus !== event.bus);
  let otherProgress = 0;
  if (otherLast && otherNext && otherNext.time > otherLast.time) {
    const modelTime = event.time + eventProgress * Math.max(next.time - event.time, 0.001);
    otherProgress = Math.max(0, Math.min(0.999, (modelTime - otherLast.time) / (otherNext.time - otherLast.time)));
  }
  setBusPosition(otherBus, eventPhase(otherProgress, otherLast || event));

  const modelTime = event.time + eventProgress * Math.max(next.time - event.time, 0);
  const waiting = eventProgress < 0.08 ? 0 : Math.max(0, gamma() * (modelTime - event.time));
  renderPassengers(waiting);

  elements["model-time"].textContent = modelTime.toFixed(3);
  elements["waiting-count"].textContent = waiting.toFixed(2);
  elements["last-headway"].textContent = event.headway.toFixed(4);
  elements["bus1-trip"].textContent = currentTrip(0);
  elements["bus2-trip"].textContent = currentTrip(1);
  elements["trip-output"].value = event.trip;
  elements["trip-scrubber"].value = Math.min(event.trip, 1999);
  elements["next-tour-value"].textContent = `${event.loadDelay.toFixed(3)} + ${event.travelTime.toFixed(3)}`;

  const phaseText = {
    loading: `Bus ${event.bus + 1} loading after H=${event.headway.toFixed(3)}`,
    outbound: `Bus ${event.bus + 1} going to destination`,
    return: `Bus ${event.bus + 1} returning to origin`,
  };
  elements["event-label"].textContent = phaseText[phase.name];
}

function currentTrip(bus) {
  for (let i = cursor; i >= 0; i -= 1) {
    if (result.events[i].bus === bus) return result.events[i].trip;
  }
  return 0;
}

function renderPassengers(waiting) {
  const count = Math.min(36, Math.round(waiting * 18));
  if (count === renderedPassengerCount) return;
  renderedPassengerCount = count;
  elements.passengers.replaceChildren();
  for (let i = 0; i < count; i += 1) {
    const person = document.createElement("span");
    person.className = "person";
    elements.passengers.appendChild(person);
  }
}

function gamma() { return Number(elements.gamma.value); }

function tick(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  if (playing && result) {
    eventProgress += delta * Number(elements["animation-speed"].value) * 0.33;
    while (eventProgress >= 1) {
      eventProgress -= 1;
      cursor = (cursor + 1) % Math.max(result.events.length - 1, 1);
    }
    renderAnimation();
    renderPlots();
  }
  requestAnimationFrame(tick);
}

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(rect.width, 260), height = Math.max(rect.height, 190);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function formatTick(value) {
  return value >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function axes(canvas, xDomain, yDomain, labels) {
  const { ctx, width, height } = setupCanvas(canvas);
  const margin = { left: 45, right: 13, top: 12, bottom: 31 };
  const plot = { x: margin.left, y: margin.top, width: width - margin.left - margin.right, height: height - margin.top - margin.bottom };
  const x = value => plot.x + (value - xDomain[0]) / (xDomain[1] - xDomain[0]) * plot.width;
  const y = value => plot.y + plot.height - (value - yDomain[0]) / (yDomain[1] - yDomain[0]) * plot.height;
  ctx.clearRect(0, 0, width, height);
  ctx.font = "10px Inter, sans-serif";
  ctx.strokeStyle = COLORS.grid;
  ctx.fillStyle = COLORS.muted;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const xv = xDomain[0] + (xDomain[1] - xDomain[0]) * i / 4;
    const yv = yDomain[0] + (yDomain[1] - yDomain[0]) * i / 4;
    ctx.beginPath(); ctx.moveTo(x(xv), plot.y); ctx.lineTo(x(xv), plot.y + plot.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(plot.x, y(yv)); ctx.lineTo(plot.x + plot.width, y(yv)); ctx.stroke();
    ctx.textAlign = "center"; ctx.fillText(formatTick(xv), x(xv), height - 11);
    ctx.textAlign = "right"; ctx.fillText(formatTick(yv), plot.x - 6, y(yv) + 3);
  }
  ctx.textAlign = "right"; ctx.fillText(labels.x, width - 10, height - 11);
  ctx.save(); ctx.translate(12, 17); ctx.rotate(-Math.PI / 2); ctx.fillText(labels.y, 0, 0); ctx.restore();
  return { ctx, x, y, plot };
}

function domain(series) {
  const values = series.flat().filter(Number.isFinite);
  let low = Math.min(...values), high = Math.max(...values);
  if (!Number.isFinite(low)) return [0, 1];
  if (low === high) { low -= .05; high += .05; }
  const pad = (high - low) * .08;
  return [Math.max(0, low - pad), high + pad];
}

function lineChart(canvas, series, end, yLabel) {
  const windowSize = 140;
  const start = Math.max(0, end - windowSize);
  const sliced = series.map(item => ({ ...item, values: item.values.slice(start, end) }));
  const yDomain = domain(sliced.map(item => item.values));
  const chart = axes(canvas, [start, Math.max(end - 1, start + 1)], yDomain, { x: "trip", y: yLabel });
  sliced.forEach(item => {
    chart.ctx.beginPath();
    chart.ctx.strokeStyle = item.color;
    chart.ctx.lineWidth = 1.5;
    item.values.forEach((value, index) => {
      const px = chart.x(start + index), py = chart.y(value);
      if (index === 0) chart.ctx.moveTo(px, py); else chart.ctx.lineTo(px, py);
    });
    chart.ctx.stroke();
  });
}

function returnMap(canvas, values, end) {
  const visible = values.slice(Math.max(0, end - 500), end);
  const d = domain([visible]);
  d[0] = 0;
  const chart = axes(canvas, d, d, { x: "H₁(m)", y: "H₁(m+1)" });
  chart.ctx.strokeStyle = "#9ba7a1";
  chart.ctx.beginPath(); chart.ctx.moveTo(chart.x(d[0]), chart.y(d[0])); chart.ctx.lineTo(chart.x(d[1]), chart.y(d[1])); chart.ctx.stroke();
  chart.ctx.fillStyle = "rgba(233,101,59,.65)";
  for (let i = 0; i < visible.length - 1; i += 1) {
    chart.ctx.beginPath();
    chart.ctx.arc(chart.x(visible[i]), chart.y(visible[i + 1]), 2, 0, Math.PI * 2);
    chart.ctx.fill();
  }
}

function renderPlots() {
  if (!result) return;
  const trip = Math.max(10, Math.min(currentTrip(0), 2000));
  lineChart(elements["headway-chart"], [
    { values: result.headways[0], color: COLORS.bus1 },
    { values: result.headways[1], color: COLORS.bus2 },
  ], trip, "H");
  returnMap(elements["return-map"], result.headways[0], trip);
  lineChart(elements["tour-chart"], [
    { values: result.tours[0], color: COLORS.bus1 },
    { values: result.tours[1], color: COLORS.bus2 },
  ], trip, "ΔT");
}

function jumpToTrip(trip) {
  const index = result.events.findIndex(event => event.trip >= trip);
  cursor = index >= 0 ? index : result.events.length - 2;
  eventProgress = 0;
  renderAnimation();
  renderPlots();
}

document.querySelectorAll(".preset-grid button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".preset-grid button").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    elements.gamma.value = button.dataset.gamma;
    elements.s1.value = button.dataset.s1;
    elements.s2.value = button.dataset.s2;
    cursor = 0;
    rebuild();
  });
});

[elements.gamma, elements.s1, elements.s2].forEach(input => {
  input.addEventListener("input", () => {
    document.querySelectorAll(".preset-grid button").forEach(item => item.classList.remove("active"));
    rebuild();
  });
});

elements["animation-speed"].addEventListener("input", () => {
  elements["speed-output"].value = `${Number(elements["animation-speed"].value).toFixed(2).replace(/0$/, "")}×`;
});

elements["play-pause"].addEventListener("click", () => {
  playing = !playing;
  elements["play-pause"].textContent = playing ? "Pause" : "Play";
});

elements.step.addEventListener("click", () => {
  playing = false;
  elements["play-pause"].textContent = "Play";
  cursor = Math.min(cursor + 1, result.events.length - 2);
  eventProgress = 0;
  renderAnimation();
  renderPlots();
});

elements.reset.addEventListener("click", () => {
  cursor = 0;
  eventProgress = 0;
  renderAnimation();
  renderPlots();
});

elements["trip-scrubber"].addEventListener("input", event => jumpToTrip(Number(event.target.value)));

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderPlots, 100);
});

rebuild();
requestAnimationFrame(tick);

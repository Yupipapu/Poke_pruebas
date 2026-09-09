let activeTrainerIds = new Set();
let lastWinnerId = null;
let probabilities = [];
let loadedAvatars = {};

const tickSound = new Audio('https://cdnjs.cloudflare.com/ajax/libs/blockly/1.0.0/media/disconnect.mp3');
const bellSound = new Audio('https://cdnjs.cloudflare.com/ajax/libs/ion-sound/3.0.7/sounds/bell_ring.mp3');

// Función de easing para una aceleración y desaceleración suave
function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// Resto de tus funciones anteriores (renderRouletteCheckboxes, toggleTrainerRoulette, etc.) se mantienen igual...
function renderRouletteCheckboxes() {
  const query = document.getElementById("roulette-search").value.toLowerCase();
  const list = document.getElementById("roulette-checklist");
  if (!list) return;

  list.innerHTML = trainersList
    .filter(t => t.name.toLowerCase().includes(query) || String(t.discord_id).includes(query))
    .map(t => `
      <label class="flex items-center gap-2 text-xs bg-slate-800 p-1.5 rounded cursor-pointer">
        <input type="checkbox" ${activeTrainerIds.has(t.id) ? 'checked' : ''} onchange="toggleTrainerRoulette(${t.id})">
        <span class="truncate">${t.name}</span>
      </label>
    `).join("");
}

function toggleTrainerRoulette(id) {
  if (activeTrainerIds.has(id)) activeTrainerIds.delete(id);
  else activeTrainerIds.add(id);
  updateProbabilities();
}

function calculateScores() {
  const weightM = parseFloat(document.getElementById("weight-m").value);
  const weightP = parseFloat(document.getElementById("weight-p").value);
  document.getElementById("val-weight-m").innerText = weightM.toFixed(1);
  document.getElementById("val-weight-p").innerText = weightP.toFixed(1);

  const activeTrainers = trainersList.filter(t => activeTrainerIds.has(t.id));
  if (activeTrainers.length === 0) return [];

  const rawScores = activeTrainers.map(t => ({
    ...t,
    score: 1 / (1 + (t.medals * weightM) + (t.participations * weightP))
  }));

  const total = rawScores.reduce((a, b) => a + b.score, 0);
  return rawScores.map(t => ({ ...t, probability: total > 0 ? t.score / total : 0 }));
}

function updateProbabilities() {
  probabilities = calculateScores();
  const probList = document.getElementById("prob-list");
  if (!probList) return;
  probList.innerHTML = probabilities.map(p => `
    <div class="flex justify-between text-xs p-2 bg-slate-900 rounded border border-slate-700">
      <span class="font-medium truncate">${p.name}</span>
      <span class="text-indigo-400 font-bold">${(p.probability * 100).toFixed(1)}%</span>
    </div>
  `).join("");
  preloadAvatarsAndDraw();
}

function preloadAvatarsAndDraw() {
  let loaded = 0;
  if (probabilities.length === 0) return drawRoulette(0);

  probabilities.forEach(p => {
    if (!loadedAvatars[p.id]) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = p.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
      img.onload = img.onerror = () => { loaded++; if (loaded === probabilities.length) drawRoulette(0); };
      loadedAvatars[p.id] = img;
    } else { loaded++; }
  });
  if (loaded === probabilities.length) drawRoulette(0);
}

function drawRoulette(rotationAngle) {
  const canvas = document.getElementById("roulette-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const cx = canvas.width / 2, cy = canvas.height / 2, radius = cx - 20;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (probabilities.length === 0) return;

  const colors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4'];

  if (probabilities.length === 1) {
    const p = probabilities[0];
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.fillStyle = colors[0];
    ctx.fill();

    if (loadedAvatars[p.id]) {
      const avatarSize = 50; 
      const rSize = avatarSize / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rSize, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(loadedAvatars[p.id], cx - rSize, cy - rSize, avatarSize, avatarSize);
      ctx.restore();
    }
    
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(cx + radius - 30, cy);
    ctx.lineTo(cx + radius + 10, cy - 12);
    ctx.lineTo(cx + radius + 10, cy + 12);
    ctx.fill();
    return;
  }

  let startAngle = rotationAngle;
  probabilities.forEach((p, idx) => {
    const sliceAngle = p.probability * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.fillStyle = colors[idx % colors.length];
    ctx.fill();
    ctx.stroke();

    if (sliceAngle > 0.15 && loadedAvatars[p.id]) {
      const mid = startAngle + sliceAngle / 2;
      const ax = cx + Math.cos(mid) * (radius * 0.65);
      const ay = cy + Math.sin(mid) * (radius * 0.65);
      
      const avatarSize = 36; 
      const rSize = avatarSize / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, ay, rSize, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(loadedAvatars[p.id], ax - rSize, ay - rSize, avatarSize, avatarSize);
      ctx.restore();
    }
    startAngle = endAngle;
  });

  ctx.fillStyle = "#ef4444";
  ctx.beginPath();
  ctx.moveTo(cx + radius - 30, cy);
  ctx.lineTo(cx + radius + 10, cy - 12);
  ctx.lineTo(cx + radius + 10, cy + 12);
  ctx.fill();
}

function getActiveItemIndex(rotationAngle) {
  const normRot = ((rotationAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const targetA = (2 * Math.PI - normRot) % (2 * Math.PI);
  
  let currentAngleAcc = 0;
  for (let i = 0; i < probabilities.length; i++) {
    const sliceAngle = probabilities[i].probability * 2 * Math.PI;
    const start = currentAngleAcc;
    const end = currentAngleAcc + sliceAngle;
    if (targetA >= start && targetA < end) {
      return i;
    }
    currentAngleAcc = end;
  }
  return 0;
}

function spinRoulette() {
  if (probabilities.length === 0) return;
  const btn = document.getElementById("btn-spin");
  btn.disabled = true;

  const rand = Math.random();
  let cumulative = 0, winner = probabilities[0];
  for (const p of probabilities) {
    cumulative += p.probability;
    if (rand <= cumulative) { winner = p; break; }
  }

  let cumulativeAngle = 0;
  for (const p of probabilities) {
    if (p.id === winner.id) {
      // Cálculo aleatorio dentro del segmento para que no caiga siempre al centro
      const sliceAngle = p.probability * 2 * Math.PI;
      const targetOffset = Math.random() * (sliceAngle * 0.8) + (sliceAngle * 0.1); 
      const targetAngle = cumulativeAngle + targetOffset;
      
      const totalRotation = 10 * Math.PI * 2 + (2 * Math.PI - targetAngle);
      let start = null;
      let lastHoverIndex = -1;

      function animate(time) {
        if (!start) start = time;
        const progress = Math.min((time - start) / 5000, 1); // 5 segundos de duración
        
        // Aplicar curva de aceleración/deceleración suave
        const easedProgress = easeInOutCubic(progress);
        const currentAngle = (easedProgress * totalRotation) % (2 * Math.PI);

        // Sonido de "Tick" (sólo si no se está reproduciendo ya)
        const currentIndex = getActiveItemIndex(currentAngle);
        if (lastHoverIndex !== -1 && lastHoverIndex !== currentIndex) {
          if (tickSound.paused) { // Solo reproduce si el anterior ha terminado
            tickSound.play();
          }
        }
        lastHoverIndex = currentIndex;

        drawRoulette(currentAngle);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          btn.disabled = false;
          bellSound.currentTime = 0;
          bellSound.play();
          showWinner(winner);
        }
      }
      requestAnimationFrame(animate);
      break;
    }
    cumulativeAngle += p.probability * 2 * Math.PI;
  }
}

function showWinner(w) {
  lastWinnerId = w.id;
  document.getElementById("winner-avatar").src = w.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
  document.getElementById("winner-name").innerText = w.name;
  document.getElementById("winner-discord").innerText = `ID: ${w.discord_id}`;
  document.getElementById("winner-medals").innerText = w.medals;
  document.getElementById("winner-participations").innerText = w.participations;
  document.getElementById("modal-winner").classList.remove("hidden");
}

async function notifyWinnerDiscord() {
  if (!lastWinnerId) return;
  const res = await fetch("/api/ganador/notificar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_usuario: lastWinnerId })
  });
  if (res.ok) alert("¡Mensaje Privado (DM) enviado al ganador!");
  else alert((await res.json()).error);
}

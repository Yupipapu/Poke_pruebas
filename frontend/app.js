let trainersList = [];
let availableMedals = [];
let pokemonCache = [];
let currentCardTrainer = null;
let activeTrainerIds = new Set();
let selectedPokemonSlots = Array(8).fill(null);
let lastWinnerId = null;

let groupedCharacters = [];
const URL_TRAINER_JSON = "https://tcm-assets.pokecharms.com/export/modern-trainers/1.json";

function formatName(name) {
  return name
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
}

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  await loadMedals();
  await loadTrainers();
  buildPokemonInputs();
  await loadConfig();
  
  await Promise.all([
    loadCategoryBackgrounds(1),
    loadTrainersCatalog()
  ]);

  document.getElementById('categorySelect').addEventListener('change', (e) => {
    loadCategoryBackgrounds(e.target.value);
  });

  document.getElementById('trainerSearchInput').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = groupedCharacters.filter(c => c.name.toLowerCase().includes(query));
    renderCharacterGrid(filtered);
  });
});

function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  
  sidebar.classList.toggle('-translate-x-full');
  overlay.classList.toggle('hidden');
}

function switchTab(tab) {
  // Ocultar menú lateral en móvil al cambiar de pestaña
  if (window.innerWidth < 768) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar.classList.contains('-translate-x-full')) {
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    }
  }

  ['trainers', 'roulette', 'medals', 'config'].forEach(t => {
    const section = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`btn-nav-${t}`);
    if (section) section.classList.toggle("hidden", t !== tab);
    if (btn) {
      btn.className = t === tab
        ? "w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-600 font-medium transition"
        : "w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 font-medium text-slate-400 hover:text-white transition";
    }
  });

  if (tab === 'roulette') {
    renderRouletteCheckboxes();
    updateProbabilities();
  }
}

async function loadMedals() {
  try {
    const res = await fetch("/api/medallas");
    availableMedals = await res.json();
    renderMedalsTab();
  } catch (e) { console.error("Error cargando medallas:", e); }
}

async function loadTrainers() {
  try {
    const res = await fetch("/api/usuarios");
    trainersList = await res.json();
    if (activeTrainerIds.size === 0) {
      trainersList.forEach(t => activeTrainerIds.add(t.id));
    }
    renderTrainers();
  } catch (e) { console.error("Error cargando entrenadores:", e); }
}

function renderTrainers() {
  const grid = document.getElementById("trainers-grid");
  const searchInput = document.getElementById("search-input");
  const query = searchInput ? searchInput.value.toLowerCase() : "";

  const filtered = trainersList.filter(t => 
    t.name.toLowerCase().includes(query) || String(t.discord_id).includes(query)
  );

  grid.innerHTML = filtered.map(t => `
    <div onclick="openCard(${t.id})" class="bg-slate-800 border border-slate-700 hover:border-indigo-500 rounded-xl p-5 cursor-pointer flex items-center gap-4 transition shadow-md">
      <img src="${t.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-16 h-16 rounded-full border-2 border-indigo-400 object-cover pointer-events-none">
      <div class="flex-1 min-w-0 pointer-events-none">
        <h3 class="font-bold text-lg truncate">${t.name}</h3>
        <p class="text-xs text-slate-400 font-mono truncate">ID: ${t.discord_id}</p>
        <div class="flex gap-4 mt-2 text-xs">
          <span class="text-amber-400 font-medium">🏅 ${t.medals || 0} medallas</span>
          <span class="text-indigo-400 font-medium">🏆 ${t.participations || 0} part.</span>
        </div>
      </div>
    </div>
  `).join("");
}

async function openCard(id) {
  try {
    const res = await fetch(`/api/usuarios/${id}`);
    if (!res.ok) throw new Error("No se pudo obtener el entrenador.");
    
    currentCardTrainer = await res.json();

    document.getElementById("card-avatar").src = currentCardTrainer.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
    document.getElementById("card-name").innerText = currentCardTrainer.name;
    document.getElementById("card-discord").innerText = `Discord ID: ${currentCardTrainer.discord_id}`;
    document.getElementById("card-participations").innerText = currentCardTrainer.participations;
    document.getElementById("card-medals-count").innerText = currentCardTrainer.medals ? currentCardTrainer.medals.length : 0;

    const medalsList = document.getElementById("card-medals-list");
    if (currentCardTrainer.medals && currentCardTrainer.medals.length > 0) {
      medalsList.innerHTML = currentCardTrainer.medals.map(m => `
        <span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
          ${m.imagen_url ? `<img src="${m.imagen_url}" class="w-4 h-4 object-contain">` : ''} ${m.name}
        </span>
      `).join("");
    } else {
      medalsList.innerHTML = '<span class="text-xs text-slate-500">Sin medallas</span>';
    }

    renderCardPokemonList();

    document.getElementById("btn-edit-trainer").onclick = () => openModalForm(currentCardTrainer);
    document.getElementById("btn-delete-trainer").onclick = () => deleteTrainer(currentCardTrainer.id);

    document.getElementById("card-placeholder").classList.add("hidden");
    document.getElementById("modal-card").classList.remove("hidden");
    closeTrainerCardModal();

    // Adaptación móvil: Oculta la barra de búsqueda/nuevo y expande el detalle a pantalla completa
    if (window.innerWidth < 1024) {
      document.getElementById("trainers-top-bar").classList.add("hidden");
      document.getElementById("trainers-list-container").classList.add("hidden");
      document.getElementById("trainers-detail-container").classList.remove("hidden");
      document.getElementById("trainers-detail-container").classList.add("flex", "col-span-12");
    }

    lucide.createIcons();
  } catch (e) { alert(`Error al abrir ficha: ${e.message}`); }
}

function closeCardModal() { 
  document.getElementById("modal-card").classList.add("hidden"); 
  document.getElementById("card-placeholder").classList.remove("hidden");
  closeTrainerCardModal();
}

function closeCardMobile() {
  document.getElementById("trainers-top-bar").classList.remove("hidden");
  document.getElementById("trainers-list-container").classList.remove("hidden");
  document.getElementById("trainers-detail-container").classList.remove("col-span-12", "flex");
  document.getElementById("trainers-detail-container").classList.add("hidden");
  closeCardModal();
}

function renderCardPokemonList() {
  const container = document.getElementById("card-pokemon-list");
  if (!currentCardTrainer || !currentCardTrainer.pokemon) {
    container.innerHTML = '<span class="text-xs text-slate-500">Sin equipo registrado</span>';
    return;
  }

  container.innerHTML = currentCardTrainer.pokemon.map((p, idx) => `
    <div draggable="true" ondragstart="handleDragStart(event, ${idx})" ondragover="handleDragOver(event)" ondrop="handleDrop(event, ${idx})"
         class="bg-slate-900 border border-slate-700 p-2.5 rounded-lg flex items-center gap-3 cursor-grab">
      <span class="text-xs font-bold text-slate-500">${p.position}</span>
      <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png" class="w-10 h-10 pointer-events-none">
      <div class="min-w-0 flex-1 pointer-events-none">
        <div class="text-sm font-semibold truncate">${formatName(p.name)}</div>
        <div class="text-xs text-slate-400 font-mono">#${String(p.id).padStart(3, '0')}</div>
      </div>
    </div>
  `).join("");
}

let draggedIdx = null;
function handleDragStart(e, idx) { draggedIdx = idx; }
function handleDragOver(e) { e.preventDefault(); }

async function handleDrop(e, targetIdx) {
  e.preventDefault();
  if (draggedIdx === null || draggedIdx === targetIdx) return;

  const item = currentCardTrainer.pokemon.splice(draggedIdx, 1)[0];
  currentCardTrainer.pokemon.splice(targetIdx, 0, item);
  currentCardTrainer.pokemon.forEach((p, i) => p.position = i + 1);
  renderCardPokemonList();

  await fetch(`/api/usuarios/${currentCardTrainer.id}/pokemon/orden`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pokemon: currentCardTrainer.pokemon.map(p => ({ id: p.id, position: p.position })) })
  });
}

function buildPokemonInputs() {
  const container = document.getElementById("pokemon-inputs-container");
  container.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    container.innerHTML += `
      <div class="relative bg-slate-900 border border-slate-700 p-2 rounded-lg flex items-center gap-2">
        <span class="text-xs font-bold text-slate-500 w-4">${i + 1}</span>
        <img id="poke-img-${i}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" class="w-8 h-8 opacity-0">
        <div class="flex-1 relative">
          <input type="text" id="poke-input-${i}" placeholder="Buscar Pokémon..." oninput="searchPokemon(${i})" class="w-full bg-transparent text-sm text-white focus:outline-none">
          <input type="hidden" id="poke-id-${i}">
          <div id="poke-results-${i}" class="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg max-h-40 overflow-y-auto hidden z-20"></div>
        </div>
      </div>
    `;
  }
}

async function searchPokemon(slotIdx) {
  const query = document.getElementById(`poke-input-${slotIdx}`).value.toLowerCase().trim();
  const resultsDiv = document.getElementById(`poke-results-${slotIdx}`);

  if (query.length < 2) return resultsDiv.classList.add("hidden");

  if (pokemonCache.length === 0) {
    const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=100000");
    const data = await res.json();
    pokemonCache = data.results.map(p => {
      const id = Number(p.url.split("/").filter(Boolean).pop());
      return { id, name: formatName(p.name) };
    });
  }

  const selectedIds = selectedPokemonSlots.filter((id, idx) => id !== null && idx !== slotIdx);
  const matches = pokemonCache
    .filter(p => p.name.toLowerCase().includes(query) && !selectedIds.includes(p.id))
    .slice(0, 15);

  resultsDiv.innerHTML = matches.map(p => `
    <div onclick="selectPokemon(${slotIdx}, ${p.id}, '${p.name}')" class="p-2 hover:bg-slate-800 flex items-center gap-2 cursor-pointer text-xs">
      <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png" class="w-6 h-6" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
      <span class="font-medium text-white">${p.name}</span>
    </div>
  `).join("");

  resultsDiv.classList.remove("hidden");
}

function selectPokemon(slotIdx, id, name) {
  selectedPokemonSlots[slotIdx] = id;
  document.getElementById(`poke-id-${slotIdx}`).value = id;
  document.getElementById(`poke-input-${slotIdx}`).value = name;
  const img = document.getElementById(`poke-img-${slotIdx}`);
  img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  img.classList.remove("opacity-0");
  document.getElementById(`poke-results-${slotIdx}`).classList.add("hidden");
}

function openModalOverlay(modalId) {
  document.getElementById(modalId).classList.add('active');
  if (modalId === 'trainerModalOverlay') showCharacterView();
}

function closeModalOverlay(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function closeModalOnOverlay(e, modalId) {
  if (e.target.id === modalId) closeModalOverlay(modalId);
}

async function loadCategoryBackgrounds(categoryId) {
  const grid = document.getElementById('bgGrid');
  grid.innerHTML = '<div style="font-size:12px; color:#888; grid-column: span 3; text-align:center;">Cargando fondos...</div>';
  const jsonUrl = `https://tcm-assets.pokecharms.com/export/modern-backgrounds/${categoryId}.json`;

  try {
    const res = await fetch(jsonUrl);
    const data = await res.json();
    grid.innerHTML = '';
    const items = Array.isArray(data) ? data : Object.values(data);

    items.forEach((item, index) => {
      const bgObject = { name: item.name || `Fondo ${index + 1}`, src: item.src || "", author: item.author || 'Pokécharms' };
      const card = document.createElement('div');
      card.className = 'item-card bg-card';
      card.innerHTML = `
        <img src="${bgObject.src}" alt="${bgObject.name}">
        <div class="title" title="${bgObject.name}">${bgObject.name}</div>
        <div class="author">by ${bgObject.author}</div>
      `;
      card.onclick = () => {
        document.querySelectorAll('.bg-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        document.getElementById('form-fondo').value = bgObject.src;
        document.getElementById('currentBgLabel').textContent = bgObject.name;
        closeModalOverlay('bgModalOverlay');
      };
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = '<div style="font-size:12px; color:#e54242; grid-column: span 3; text-align:center;">Error al cargar fondos.</div>';
  }
}

async function loadTrainersCatalog() {
  const grid = document.getElementById('characterGrid');
  grid.innerHTML = '<div style="font-size:12px; color:#888; grid-column: span 6; text-align:center;">Cargando entrenadores...</div>';

  try {
    const res = await fetch(URL_TRAINER_JSON);
    const data = await res.json();
    const rawList = Array.isArray(data) ? data : Object.values(data);
    const groupsMap = {};

    rawList.forEach((item, index) => {
      const charId = item.character_id || (item.character && item.character.id) || item.character_name || item.name || `char_${index}`;
      const charName = item.character_name || (item.character && item.character.name) || item.name || `Entrenador ${index + 1}`;
      const outfitName = item.name || item.title || charName;
      const src = item.src || item.file || item.image || "";

      if (!src) return;
      if (!groupsMap[charId]) {
        groupsMap[charId] = { id: charId, name: charName, role: item.role || 'PROTAGONISTS', outfits: [] };
      }
      groupsMap[charId].outfits.push({ id: item.id || index, name: outfitName, src: src, author: item.author || 'Game Freak', game: item.game || item.source || 'Pokémon' });
    });

    groupedCharacters = Object.values(groupsMap);
    renderCharacterGrid(groupedCharacters);
  } catch (err) {
    grid.innerHTML = '<div style="font-size:12px; color:#e54242; grid-column: span 6; text-align:center;">Error al cargar entrenadores.</div>';
  }
}

function renderCharacterGrid(characters) {
  const grid = document.getElementById('characterGrid');
  grid.innerHTML = '';
  characters.forEach(char => {
    const coverOutfit = char.outfits[0];
    const card = document.createElement('div');
    card.className = 'item-card trainer-card';
    card.innerHTML = `
      <img src="${coverOutfit.src}" alt="${char.name}">
      <div class="title" title="${char.name}">${char.name}</div>
      <div class="variant-count">${char.outfits.length}</div>
    `;
    card.onclick = () => showOutfitView(char);
    grid.appendChild(card);
  });
}

function showOutfitView(character) {
  document.getElementById('trainerLevel1View').style.display = 'none';
  document.getElementById('trainerLevel2View').style.display = 'block';

  const banner = document.getElementById('characterBanner');
  const coverOutfit = character.outfits[0];
  banner.innerHTML = `
    <img src="${coverOutfit.src}" alt="${character.name}" style="width:48px;height:48px;object-fit:contain;">
    <div>
      <h3 class="font-bold text-sm text-white">${character.name}</h3>
      <span class="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 uppercase">${character.role || 'RIVALS'}</span>
    </div>
  `;

  const grid = document.getElementById('outfitGrid');
  grid.innerHTML = '';

  character.outfits.forEach(outfit => {
    const card = document.createElement('div');
    card.className = 'item-card outfit-card';
    card.innerHTML = `
      <img src="${outfit.src}" alt="${outfit.name}">
      <div class="title" title="${outfit.name}">${outfit.name}</div>
      <div class="author">by ${outfit.author}</div>
    `;
    card.onclick = () => {
      document.querySelectorAll('.outfit-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      document.getElementById('form-personaje').value = outfit.src;
      document.getElementById('currentTrainerLabel').textContent = outfit.name;
      closeModalOverlay('trainerModalOverlay');
    };
    grid.appendChild(card);
  });
}

function showCharacterView() {
  document.getElementById('trainerLevel1View').style.display = 'block';
  document.getElementById('trainerLevel2View').style.display = 'none';
}

function openModalForm(trainer = null) {
  document.getElementById("modal-form-title").innerText = trainer ? "Editar Entrenador" : "Nuevo Entrenador";
  document.getElementById("form-id").value = trainer ? trainer.id : "";
  document.getElementById("form-name").value = trainer ? trainer.name : "";
  document.getElementById("form-discord").value = trainer ? trainer.discord_id : "";
  document.getElementById("form-participations").value = trainer ? trainer.participations : 0;
  
  document.getElementById("form-fondo").value = trainer ? (trainer.fondo_url || '') : '';
  document.getElementById("currentBgLabel").textContent = trainer && trainer.fondo_url ? "Fondo personalizado seleccionado" : "Seleccionar fondo...";

  document.getElementById("form-personaje").value = trainer ? (trainer.personaje_url || '') : '';
  document.getElementById("currentTrainerLabel").textContent = trainer && trainer.personaje_url ? "Personaje seleccionado" : "Seleccionar personaje...";

  const medalsContainer = document.getElementById("form-medals");
  const trainerMedalIds = trainer && trainer.medals ? trainer.medals.map(m => m.id) : [];

  medalsContainer.innerHTML = availableMedals.map(m => `
    <label class="flex items-center gap-2 bg-slate-900 border border-slate-700 p-2 rounded-lg cursor-pointer text-xs">
      <input type="checkbox" name="medals" value="${m.id_medalla}" ${trainerMedalIds.includes(m.id_medalla) ? 'checked' : ''}>
      <span>${m.nombre}</span>
    </label>
  `).join("");

  buildPokemonInputs();

  selectedPokemonSlots = Array(8).fill(null);
  for (let i = 0; i < 8; i++) {
    if (trainer && trainer.pokemon && trainer.pokemon[i]) {
      selectPokemon(i, trainer.pokemon[i].id, formatName(trainer.pokemon[i].name));
    } else {
      document.getElementById(`poke-id-${i}`).value = "";
      document.getElementById(`poke-input-${i}`).value = "";
      document.getElementById(`poke-img-${i}`).classList.add("opacity-0");
    }
  }
  document.getElementById("modal-form").classList.remove("hidden");
}

function closeFormModal() { document.getElementById("modal-form").classList.add("hidden"); }

async function saveTrainer(e) {
  e.preventDefault();
  const id = document.getElementById("form-id").value;
  const pokemonIds = Array.from({ length: 8 }, (_, i) => parseInt(document.getElementById(`poke-id-${i}`).value, 10));

  if (pokemonIds.some(isNaN)) return alert("Debes seleccionar los 8 Pokémon.");

  const payload = {
    name: document.getElementById("form-name").value,
    discord_id: document.getElementById("form-discord").value,
    participations: parseInt(document.getElementById("form-participations").value, 10),
    fondo_url: document.getElementById("form-fondo").value,
    personaje_url: document.getElementById("form-personaje").value,
    pokemon: pokemonIds,
    medals: Array.from(document.querySelectorAll('input[name="medals"]:checked')).map(cb => parseInt(cb.value, 10))
  };

  const res = await fetch(id ? `/api/usuarios/${id}` : "/api/usuarios", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (res.ok) { closeFormModal(); await loadTrainers(); }
  else { alert((await res.json()).error); }
}

async function deleteTrainer(id) {
  if (!confirm("¿Eliminar entrenador?")) return;
  await fetch(`/api/usuarios/${id}`, { method: "DELETE" });
  closeCardModal();
  await loadTrainers();
}

function openTrainerCardModal() {
  if (!currentCardTrainer) return;
  document.getElementById("trainer-card-panel").classList.remove("translate-x-full");
  renderTrainerCardCanvas();
}

function closeTrainerCardModal() {
  document.getElementById("trainer-card-panel").classList.add("translate-x-full");
}

function openCardPreviewModal() {
  const canvas = document.getElementById("cardCanvas");
  const modalImg = document.getElementById("preview-modal-img");
  modalImg.src = canvas.toDataURL('image/png');
  document.getElementById("card-preview-modal").classList.remove("hidden");
  lucide.createIcons();
}

function closeCardPreviewModal() {
  document.getElementById("card-preview-modal").classList.add("hidden");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

async function renderTrainerCardCanvas() {
  const canvas = document.getElementById("cardCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Fondo
  if (currentCardTrainer.fondo_url) {
    try {
      const bgImg = await loadImage(currentCardTrainer.fondo_url);
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. Nombre del entrenador
  ctx.font = 'bold 32px sans-serif';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeText(currentCardTrainer.name || "Trainer", 40, 45);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(currentCardTrainer.name || "Trainer", 40, 45);

  // 3. Personaje
  if (currentCardTrainer.personaje_url) {
    try {
      const trainerImg = await loadImage(currentCardTrainer.personaje_url);
      const aspectRatio = trainerImg.width / trainerImg.height;
      const targetHeight = 420;
      const targetWidth = targetHeight * aspectRatio;
      ctx.drawImage(trainerImg, canvas.width - targetWidth, 20, targetWidth, targetHeight);
    } catch (e) {}
  }

  // 4. Medallas
  if (currentCardTrainer.medals && currentCardTrainer.medals.length > 0) {
    const boxSize = 62;
    const medalSize = 50;
    const startMedalX = 260;
    const startY1 = 12;
    const startY2 = 68;
    const medalGapX = 60;

    for (let i = 0; i < currentCardTrainer.medals.length; i++) {
      const m = currentCardTrainer.medals[i];
      const mx = startMedalX + (i * medalGapX);
      const my = (i % 2 === 0) ? startY1 : startY2;

      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.roundRect(mx, my, boxSize, boxSize, 10);
      ctx.fill();
      ctx.stroke();

      if (m.imagen_url) {
        try {
          const medalImg = await loadImage(m.imagen_url);
          const offset = (boxSize - medalSize) / 2;
          ctx.drawImage(medalImg, mx + offset, my + offset, medalSize, medalSize);
        } catch (e) {}
      }
    }
  }

  // --- 🖼️ 5. TU IMAGEN PERSONALIZADA (AQUÍ QUEDA DETRÁS DE LOS POKÉMON) ---
  try {
    const customImg = await loadImage("https://i.imgur.com/vyccVOp.png");
    ctx.drawImage(customImg, 477, 39); 
  } catch (e) {
    console.error("Error al cargar la imagen personalizada:", e);
  }
  // -------------------------------------------------------------------

  // 6. Equipo Pokémon (Se dibuja DESPUÉS de tu imagen, por lo que ahora tu imagen estará detrás de ellos)
  const pokeSize = 130;
  const startX = 20;
  const startY = 127;
  const gapX = 160;
  const gapY = 152;

  if (currentCardTrainer.pokemon) {
    for (let i = 0; i < currentCardTrainer.pokemon.length; i++) {
      const p = currentCardTrainer.pokemon[i];
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = startX + (col * gapX);
      const y = startY + (row * gapY);

      try {
        const pokeImg = await loadImage(`https://raw.githubusercontent.com/PokeAPI/sprites/refs/heads/master/sprites/pokemon/versions/generation-ix/champions/${p.id}.png`);
        ctx.drawImage(pokeImg, x, y, pokeSize, pokeSize);

        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.fillText(p.name.toUpperCase(), x + (pokeSize / 2), y + pokeSize + 17);
        ctx.textAlign = 'left';
      } catch (e) {}
    }
  }
}

function downloadCard() {
  const canvas = document.getElementById("cardCanvas");
  try {
    const link = document.createElement('a');
    link.download = `TrainerCard_${currentCardTrainer ? currentCardTrainer.name : 'Pokemon'}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    alert("Error exportando la tarjeta.");
  }
}

function renderRouletteCheckboxes() {
  const query = document.getElementById("roulette-search").value.toLowerCase();
  const list = document.getElementById("roulette-checklist");

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

let probabilities = [];
let loadedAvatars = {};

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
  document.getElementById("prob-list").innerHTML = probabilities.map(p => `
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
  const ctx = canvas.getContext("2d");
  const cx = canvas.width / 2, cy = canvas.height / 2, radius = cx - 20;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (probabilities.length === 0) return;

  let startAngle = rotationAngle;
  const colors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4'];

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
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, ay, 18, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(loadedAvatars[p.id], ax - 18, ay - 18, 36, 36);
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
      const targetMid = cumulativeAngle + (p.probability * 2 * Math.PI) / 2;
      const totalRotation = 10 * Math.PI * 2 + (2 * Math.PI - targetMid);
      let start = null;

      function animate(time) {
        if (!start) start = time;
        const progress = Math.min((time - start) / 4000, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        drawRoulette((easeOut * totalRotation) % (Math.PI * 2));
        if (progress < 1) requestAnimationFrame(animate);
        else { btn.disabled = false; showWinner(winner); }
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

function renderMedalsTab() {
  const grid = document.getElementById("medals-grid");
  grid.innerHTML = "";

  availableMedals.forEach(m => {
    const card = document.createElement("div");
    card.className = "bg-slate-800 border border-slate-700 p-4 rounded-xl space-y-3 flex flex-col justify-between";
    
    let usersHtml = '<span class="text-xs text-slate-500">Nadie tiene esta medalla aún</span>';
    if (m.users && m.users.length > 0) {
      usersHtml = `
        <div class="flex flex-wrap gap-1.5 items-center">
          ${m.users.map(u => `
            <img src="${u.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                 title="${u.name}" 
                 class="w-7 h-7 rounded-full border border-indigo-400 object-cover cursor-pointer hover:scale-110 transition">
          `).join("")}
        </div>
      `;
    }

    card.innerHTML = `
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          ${m.imagen_url ? `<img src="${m.imagen_url}" class="w-10 h-10 object-contain">` : ''}
          <div>
            <h3 class="font-bold text-white">${m.nombre}</h3>
            <span class="text-xs text-amber-400 font-semibold">${m.tipo}</span>
          </div>
        </div>
        <p class="text-xs text-slate-400">${m.descripcion || ''}</p>
      </div>

      <div class="space-y-2 pt-2 border-t border-slate-700/50">
        <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Entrenadores con esta medalla:</div>
        ${usersHtml}
      </div>

      <div class="flex justify-end gap-2 pt-2 border-t border-slate-700/50">
        <button class="btn-edit-m text-xs text-indigo-400 hover:underline">Editar</button>
        <button class="btn-del-m text-xs text-rose-400 hover:underline">Eliminar</button>
      </div>
    `;

    card.querySelector(".btn-edit-m").onclick = () => openMedalModal(m);
    card.querySelector(".btn-del-m").onclick = () => deleteMedal(m.id_medalla);

    grid.appendChild(card);
  });
}

function openMedalModal(m = null) {
  document.getElementById("medal-modal-title").innerText = m ? "Editar Medalla" : "Nueva Medalla";
  document.getElementById("medal-form-id").value = m ? m.id_medalla : "";
  document.getElementById("medal-form-name").value = m ? m.nombre : "";
  document.getElementById("medal-form-type").value = m ? m.tipo : "";
  document.getElementById("medal-form-url").value = m ? (m.imagen_url || '') : "";
  document.getElementById("medal-form-desc").value = m ? (m.descripcion || '') : "";
  document.getElementById("modal-medal-form").classList.remove("hidden");
}

function closeMedalModal() { document.getElementById("modal-medal-form").classList.add("hidden"); }

async function saveMedal(e) {
  e.preventDefault();
  const id = document.getElementById("medal-form-id").value;
  const payload = {
    nombre: document.getElementById("medal-form-name").value,
    tipo: document.getElementById("medal-form-type").value,
    imagen_url: document.getElementById("medal-form-url").value,
    descripcion: document.getElementById("medal-form-desc").value
  };

  await fetch(id ? `/api/medallas/${id}` : "/api/medallas", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  closeMedalModal();
  await loadMedals();
}

async function deleteMedal(id) {
  if (!confirm("¿Eliminar medalla?")) return;
  await fetch(`/api/medallas/${id}`, { method: "DELETE" });
  await loadMedals();
}

async function loadConfig() {
  try {
    const res = await fetch("/api/configuracion");
    const config = await res.json();
    if (config) {
      document.getElementById("config-channel-id").value = config.canal_id || '';
      document.getElementById("config-template").value = config.plantilla_mensaje || '';
    }
  } catch (e) { console.error("Error cargando configuración:", e); }
}

async function saveConfig() {
  const payload = {
    canal_id: document.getElementById("config-channel-id").value,
    plantilla_mensaje: document.getElementById("config-template").value
  };

  const res = await fetch("/api/configuracion", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (res.ok) alert("Configuración guardada correctamente");
}

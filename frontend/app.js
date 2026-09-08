// ==========================================
// CONFIGURACIÓN GLOBAL DE SPRITES POKÉMON
// ==========================================
const POKE_SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
const POKE_SPRITE_AUX = "https://raw.githubusercontent.com/PokeAPI/sprites/refs/heads/master/sprites/pokemon/versions/generation-ix/scarlet-violet/";

function getPokemonSpriteUrl(id) {
  return `${POKE_SPRITE_BASE}${id}.png`;
}

function getAuxPokemonSpriteUrl(id) {
  return `${POKE_SPRITE_AUX}${id}.png`;
}

function setPokemonImageWithFallback(imgElement, id) {
  imgElement.src = getPokemonSpriteUrl(id);
  imgElement.onerror = () => {
    imgElement.src = getAuxPokemonSpriteUrl(id);
    imgElement.onerror = null;
  };
}

// ==========================================
// CACHÉS Y ESTADO GLOBAL
// ==========================================
const backgroundNamesCache = {};
const trainerOutfitNamesCache = {};

let trainersList = [];
let availableMedals = [];
let pokemonCache = [];
let currentCardTrainer = null;

let fixedTrainerId = null;
let currentPanelMode = 'details';

let groupedCharacters = [];
let activeLoadingTrainerId = null;
let catalogsLoaded = false; // Bandera para saber si los catálogos ya terminaron de descargar
const URL_TRAINER_JSON = "https://tcm-assets.pokecharms.com/export/modern-trainers/1.json";

function formatName(name) {
  return name.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join("-");
}

function getBackgroundName(url) {
  if (!url) return "Seleccionar fondo...";
  if (backgroundNamesCache[url]) return backgroundNamesCache[url];

  // Si es un hash de archivo técnico de Pokécharms y no se encontró en caché:
  if (url.includes('pokecharms.com') || url.length > 40) {
    return "Fondo personalizado / Externo";
  }

  try {
    const filename = url.split('/').pop().split('?')[0];
    return filename ? decodeURIComponent(filename) : "Seleccionar fondo...";
  } catch (e) {
    return "Seleccionar fondo...";
  }
}

function getTrainerOutfitName(url) {
  if (!url) return "Seleccionar personaje...";
  if (trainerOutfitNamesCache[url]) return trainerOutfitNamesCache[url];

  for (const char of groupedCharacters) {
    const outfit = char.outfits.find(o => o.src === url);
    if (outfit) {
      const displayName = `${char.name} (${outfit.name})`;
      trainerOutfitNamesCache[url] = displayName;
      return displayName;
    }
  }

  // Si es un sprite externo o no encontrado en el catálogo de la API 1.json:
  if (url.includes('pokecharms.com') || url.length > 40) {
    return "Entrenador personalizado / Otro catálogo";
  }

  try {
    const filename = url.split('/').pop().split('?')[0];
    return filename ? decodeURIComponent(filename) : "Seleccionar personaje...";
  } catch (e) {
    return "Seleccionar personajeப்பொரு..."
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();

  // 1. Cargamos primero los catálogos globales y los fondos para evitar nombres técnicos vacíos
  await Promise.all([
    preloadAllBackgrounds(),
    loadTrainersCatalog()
  ]);
  catalogsLoaded = true;

  // 2. Cargamos datos de la base de datos y medallas
  await loadMedals();
  await loadTrainers();
  buildInlinePokemonInputs();
  await loadConfig();

  await loadCategoryBackgrounds(1);

  document.getElementById('categorySelect').addEventListener('change', (e) => {
    loadCategoryBackgrounds(e.target.value);
  });

  document.getElementById('trainerSearchInput').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = groupedCharacters.filter(c => c.name.toLowerCase().includes(query));
    renderCharacterGrid(filtered);
  });
});

async function preloadAllBackgrounds() {
  for (let i = 1; i <= 12; i++) {
    try {
      const res = await fetch(`https://tcm-assets.pokecharms.com/export/modern-backgrounds/${i}.json`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : Object.values(data);
      items.forEach(item => {
        if (item.src && item.name) {
          backgroundNamesCache[item.src] = item.name;
        }
      });
    } catch (e) { }
  }
}

function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('-translate-x-full');
  overlay.classList.toggle('hidden');
}

function switchTab(tab) {
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
    const res = await fetch(`/api/usuarios?t=${Date.now()}`);
    trainersList = await res.json();
    if (typeof activeTrainerIds !== 'undefined' && activeTrainerIds.size === 0) {
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
    <div onmouseenter="previewCard(${t.id})" onclick="fixCard(${t.id})" 
         class="bg-slate-800 border ${fixedTrainerId === t.id ? 'border-indigo-500 shadow-indigo-500/20' : 'border-slate-700'} hover:border-indigo-400 rounded-xl p-5 cursor-pointer flex items-center gap-4 transition shadow-md">
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

async function previewCard(id) {
  await loadTrainerDataIntoPanel(id);
}

async function fixCard(id) {
  fixedTrainerId = id;
  await loadTrainerDataIntoPanel(id);
  renderTrainers();
}

let leaveTimeout = null;

function onListMouseEnter() {
  // Si el mouse vuelve a entrar rápidamente, cancelamos cualquier intento de cierre pendiente
  if (leaveTimeout) {
    clearTimeout(leaveTimeout);
    leaveTimeout = null;
  }
}

async function onListMouseLeave(event) {
  // Si el cursor se mueve directamente hacia el panel de detalles, no revertimos la vista
  if (event && event.relatedTarget) {
    const detailContainer = document.getElementById("trainers-detail-container");
    if (detailContainer && detailContainer.contains(event.relatedTarget)) {
      return;
    }
  }

  // Margen de tiempo (150ms) para evitar que saltos rápidos de cursor en los bordes reseteen la tarjeta
  if (leaveTimeout) clearTimeout(leaveTimeout);

  leaveTimeout = setTimeout(async () => {
    if (fixedTrainerId !== null) {
      await loadTrainerDataIntoPanel(fixedTrainerId);
    } else {
      closeCardModal();
    }
  }, 150);
}

async function loadTrainerDataIntoPanel(id) {
  activeLoadingTrainerId = id;
  try {
    const res = await fetch(`/api/usuarios/${id}`);
    if (!res.ok) throw new Error("No se pudo obtener el entrenador.");

    const trainerData = await res.json();
    if (activeLoadingTrainerId !== id) return; // Evita conflictos si el usuario cambia rápido de entrenador

    currentCardTrainer = trainerData;

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
    document.getElementById("btn-delete-trainer").onclick = () => deleteTrainer(currentCardTrainer.id);

    populateInlineEditForm(currentCardTrainer);

    document.getElementById("panel-tabs-bar").classList.remove("hidden");
    document.getElementById("card-placeholder").classList.add("hidden");

    applyPanelMode();

    if (window.innerWidth < 1024) {
      document.getElementById("trainers-top-bar").classList.add("hidden");
      document.getElementById("trainers-list-container").classList.add("hidden");
      document.getElementById("trainers-detail-container").classList.remove("hidden");
      document.getElementById("trainers-detail-container").classList.add("flex", "col-span-12");
    }

    lucide.createIcons();
  } catch (e) { console.error(e); }
}

function switchPanelMode(mode) {
  currentPanelMode = mode;
  applyPanelMode();
}

function applyPanelMode() {
  const detailsContent = document.getElementById("panel-content-details");
  const cardContent = document.getElementById("panel-content-card");
  const editContent = document.getElementById("panel-content-edit");

  const tabDetails = document.getElementById("tab-mode-details");
  const tabCard = document.getElementById("tab-mode-card");
  const tabEdit = document.getElementById("tab-mode-edit");

  [tabDetails, tabCard, tabEdit].forEach(t => t.className = "book-tab px-4 py-2 rounded-t-lg text-xs font-bold bg-slate-900 text-slate-400 border-t border-x border-slate-700 transition");
  [detailsContent, cardContent, editContent].forEach(c => c.classList.add("hidden"));

  if (currentPanelMode === 'details') {
    detailsContent.classList.remove("hidden");
    tabDetails.className = "book-tab active-tab px-4 py-2 rounded-t-lg text-xs font-bold bg-slate-800 text-indigo-400 border-t border-x border-slate-700 transition";
  } else if (currentPanelMode === 'card') {
    cardContent.classList.remove("hidden");
    tabCard.className = "book-tab active-tab px-4 py-2 rounded-t-lg text-xs font-bold bg-slate-800 text-indigo-400 border-t border-x border-slate-700 transition";
    if (currentCardTrainer && typeof renderTrainerCardCanvas === 'function') renderTrainerCardCanvas();
  } else if (currentPanelMode === 'edit') {
    editContent.classList.remove("hidden");
    tabEdit.className = "book-tab active-tab px-4 py-2 rounded-t-lg text-xs font-bold bg-slate-800 text-indigo-400 border-t border-x border-slate-700 transition";
  }
}

function closeCardModal() {
  fixedTrainerId = null;
  currentCardTrainer = null;
  document.getElementById("panel-tabs-bar").classList.add("hidden");
  document.getElementById("panel-content-details").classList.add("hidden");
  document.getElementById("panel-content-card").classList.add("hidden");
  document.getElementById("panel-content-edit").classList.add("hidden");
  document.getElementById("card-placeholder").classList.remove("hidden");
  renderTrainers();
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
      <img src="${getPokemonSpriteUrl(p.id)}" onerror="this.src='${getAuxPokemonSpriteUrl(p.id)}'" class="w-10 h-10 pointer-events-none">
      <div class="min-w-0 flex-1 pointer-events-none">
        <div class="text-sm font-semibold truncate text-white">${formatName(p.name)}</div>
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

function buildInlinePokemonInputs() {
  const container = document.getElementById("inline-pokemon-inputs-container");
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    container.innerHTML += `
      <div class="relative bg-slate-900 border border-slate-700 p-2.5 rounded-lg flex items-center gap-3">
        <span class="text-xs font-bold text-slate-500">${i + 1}</span>
        <img id="inline-poke-img-${i}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" class="w-10 h-10 opacity-0 pointer-events-none">
        <div class="flex-1 relative min-w-0">
          <input type="text" id="inline-poke-input-${i}" placeholder="Buscar Pokémon..." oninput="searchInlinePokemon(${i})" class="w-full bg-transparent text-sm font-semibold text-white focus:outline-none truncate">
          <input type="hidden" id="inline-poke-id-${i}">
          <div id="inline-poke-results-${i}" class="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg max-h-40 overflow-y-auto hidden z-20 shadow-xl"></div>
        </div>
        <div id="inline-poke-pokedex-${i}" class="text-xs text-slate-400 font-mono">#---</div>
      </div>
    `;
  }
}

async function searchInlinePokemon(slotIdx) {
  const query = document.getElementById(`inline-poke-input-${slotIdx}`).value.toLowerCase().trim();
  const resultsDiv = document.getElementById(`inline-poke-results-${slotIdx}`);
  if (query.length < 2) return resultsDiv.classList.add("hidden");

  if (pokemonCache.length === 0) {
    const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=100000");
    const data = await res.json();
    pokemonCache = data.results.map(p => {
      const id = Number(p.url.split("/").filter(Boolean).pop());
      return { id, name: formatName(p.name) };
    });
  }

  const matches = pokemonCache.filter(p => p.name.toLowerCase().includes(query)).slice(0, 15);
  resultsDiv.innerHTML = matches.map(p => `
    <div onclick="selectInlinePokemon(${slotIdx}, ${p.id}, '${p.name}')" class="p-2 hover:bg-slate-800 flex items-center gap-2 cursor-pointer text-xs">
      <img src="${getPokemonSpriteUrl(p.id)}" onerror="this.src='${getAuxPokemonSpriteUrl(p.id)}'" class="w-6 h-6">
      <span class="font-medium text-white">${p.name}</span>
    </div>
  `).join("");
  resultsDiv.classList.remove("hidden");
}

function selectInlinePokemon(slotIdx, id, name) {
  document.getElementById(`inline-poke-id-${slotIdx}`).value = id;
  document.getElementById(`inline-poke-input-${slotIdx}`).value = name;

  const img = document.getElementById(`inline-poke-img-${slotIdx}`);
  setPokemonImageWithFallback(img, id);
  img.classList.remove("opacity-0");

  const pokedexDiv = document.getElementById(`inline-poke-pokedex-${slotIdx}`);
  pokedexDiv.innerText = `#${String(id).padStart(3, '0')}`;

  document.getElementById(`inline-poke-results-${slotIdx}`).classList.add("hidden");
}

function populateInlineEditForm(trainer) {
  document.getElementById("inline-form-id").value = trainer.id;
  document.getElementById("inline-form-name").value = trainer.name;
  document.getElementById("inline-form-discord").value = trainer.discord_id;
  document.getElementById("inline-form-participations").value = trainer.participations;

  document.getElementById("inline-form-fondo").value = trainer.fondo_url || '';
  document.getElementById("inlineCurrentBgLabel").textContent = getBackgroundName(trainer.fondo_url);

  document.getElementById("inline-form-personaje").value = trainer.personaje_url || '';
  document.getElementById("inlineCurrentTrainerLabel").textContent = getTrainerOutfitName(trainer.personaje_url);

  const medalsContainer = document.getElementById("inline-form-medals");
  const trainerMedalIds = trainer.medals ? trainer.medals.map(m => m.id) : [];

  medalsContainer.innerHTML = availableMedals.map(m => `
    <label class="flex items-center gap-2 bg-slate-900 border border-slate-700 p-2 rounded-lg cursor-pointer text-xs">
      <input type="checkbox" name="inline_medals" value="${m.id_medalla}" ${trainerMedalIds.includes(m.id_medalla) ? 'checked' : ''}>
      <span>${m.nombre}</span>
    </label>
  `).join("");

  buildInlinePokemonInputs();
  for (let i = 0; i < 8; i++) {
    if (trainer.pokemon && trainer.pokemon[i]) {
      selectInlinePokemon(i, trainer.pokemon[i].id, formatName(trainer.pokemon[i].name));
    }
  }
}

async function saveInlineTrainer(e) {
  e.preventDefault();
  const id = document.getElementById("inline-form-id").value;
  const pokemonIds = Array.from({ length: 8 }, (_, i) => parseInt(document.getElementById(`inline-poke-id-${i}`).value, 10));

  if (pokemonIds.some(isNaN)) return alert("Debes seleccionar los 8 Pokémon.");

  const payload = {
    name: document.getElementById("inline-form-name").value,
    discord_id: document.getElementById("inline-form-discord").value,
    participations: parseInt(document.getElementById("inline-form-participations").value, 10),
    fondo_url: document.getElementById("inline-form-fondo").value,
    personaje_url: document.getElementById("inline-form-personaje").value,
    pokemon: pokemonIds,
    medals: Array.from(document.querySelectorAll('input[name="inline_medals"]:checked')).map(cb => parseInt(cb.value, 10))
  };

  const res = await fetch(`/api/usuarios/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    alert("Entrenador actualizado correctamente");
    await loadTrainers();
    fixCard(id);
    switchPanelMode('details');
  } else {
    alert((await res.json()).error);
  }
}

function openModalForm() {
  document.getElementById("form-name").value = "";
  document.getElementById("form-discord").value = "";
  document.getElementById("form-participations").value = 0;
  document.getElementById("form-fondo").value = "";
  document.getElementById("form-personaje").value = "";
  document.getElementById("currentBgLabel").textContent = "Seleccionar fondo...";
  document.getElementById("currentTrainerLabel").textContent = "Seleccionar personaje...";

  const medalsContainer = document.getElementById("form-medals");
  medalsContainer.innerHTML = availableMedals.map(m => `
    <label class="flex items-center gap-2 bg-slate-900 border border-slate-700 p-2 rounded-lg cursor-pointer text-xs">
      <input type="checkbox" name="medals" value="${m.id_medalla}">
      <span>${m.nombre}</span>
    </label>
  `).join("");

  const container = document.getElementById("pokemon-inputs-container");
  container.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    container.innerHTML += `
      <div class="relative bg-slate-900 border border-slate-700 p-2.5 rounded-lg flex items-center gap-3">
        <span class="text-xs font-bold text-slate-500">${i + 1}</span>
        <img id="poke-img-${i}" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" class="w-10 h-10 opacity-0 pointer-events-none">
        <div class="flex-1 relative min-w-0">
          <input type="text" id="poke-input-${i}" placeholder="Buscar Pokémon..." oninput="searchModalPokemon(${i})" class="w-full bg-transparent text-sm font-semibold text-white focus:outline-none truncate">
          <input type="hidden" id="poke-id-${i}">
          <div id="poke-results-${i}" class="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg max-h-40 overflow-y-auto hidden z-20 shadow-xl"></div>
        </div>
        <div id="poke-pokedex-${i}" class="text-xs text-slate-400 font-mono">#---</div>
      </div>
    `;
  }

  document.getElementById("modal-form").classList.remove("hidden");
}

function closeFormModal() { document.getElementById("modal-form").classList.add("hidden"); }

async function searchModalPokemon(slotIdx) {
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

  const matches = pokemonCache.filter(p => p.name.toLowerCase().includes(query)).slice(0, 15);
  resultsDiv.innerHTML = matches.map(p => `
    <div onclick="selectModalPokemon(${slotIdx}, ${p.id}, '${p.name}')" class="p-2 hover:bg-slate-800 flex items-center gap-2 cursor-pointer text-xs">
      <img src="${getPokemonSpriteUrl(p.id)}" onerror="this.src='${getAuxPokemonSpriteUrl(p.id)}'" class="w-6 h-6">
      <span class="font-medium text-white">${p.name}</span>
    </div>
  `).join("");
  resultsDiv.classList.remove("hidden");
}

function selectModalPokemon(slotIdx, id, name) {
  document.getElementById(`poke-id-${slotIdx}`).value = id;
  document.getElementById(`poke-input-${slotIdx}`).value = name;

  const img = document.getElementById(`poke-img-${slotIdx}`);
  setPokemonImageWithFallback(img, id);
  img.classList.remove("opacity-0");

  const pokedexDiv = document.getElementById(`poke-pokedex-${slotIdx}`);
  pokedexDiv.innerText = `#${String(id).padStart(3, '0')}`;

  document.getElementById(`poke-results-${slotIdx}`).classList.add("hidden");
}

async function saveNewTrainer(e) {
  e.preventDefault();
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

  const res = await fetch("/api/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    closeFormModal();
    await loadTrainers();
  } else {
    alert((await res.json()).error);
  }
}

async function deleteTrainer(id) {
  if (!confirm("¿Eliminar entrenador?")) return;
  await fetch(`/api/usuarios/${id}`, { method: "DELETE" });
  closeCardModal();
  await loadTrainers();
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

      // Guardar también en caché individual al explorar categorías
      if (bgObject.src && bgObject.name) {
        backgroundNamesCache[bgObject.src] = bgObject.name;
      }

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

        backgroundNamesCache[bgObject.src] = bgObject.name;

        if (document.getElementById("inline-form-id").value) {
          document.getElementById('inline-form-fondo').value = bgObject.src;
          document.getElementById('inlineCurrentBgLabel').textContent = bgObject.name;
        } else {
          document.getElementById('form-fondo').value = bgObject.src;
          document.getElementById('currentBgLabel').textContent = bgObject.name;
        }
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
      const outfitItem = { id: item.id || index, name: outfitName, src: src, author: item.author || 'Game Freak', game: item.game || item.source || 'Pokémon' };
      groupsMap[charId].outfits.push(outfitItem);

      // Precargar en caché global de entrenadores
      trainerOutfitNamesCache[src] = `${charName} (${outfitName})`;
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

      const displayName = `${character.name} (${outfit.name})`;
      trainerOutfitNamesCache[outfit.src] = displayName;

      if (document.getElementById("inline-form-id").value) {
        document.getElementById('inline-form-personaje').value = outfit.src;
        document.getElementById('inlineCurrentTrainerLabel').textContent = displayName;
      } else {
        document.getElementById('form-personaje').value = outfit.src;
        document.getElementById('currentTrainerLabel').textContent = displayName;
      }
      closeModalOverlay('trainerModalOverlay');
    };
    grid.appendChild(card);
  });
}

function showCharacterView() {
  document.getElementById('trainerLevel1View').style.display = 'block';
  document.getElementById('trainerLevel2View').style.display = 'none';
}

function backupDatabase() {
  window.location.href = '/api/backup';
}

function renderMedalsTab() {
  const grid = document.getElementById("medals-grid");
  if (!grid) return;
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

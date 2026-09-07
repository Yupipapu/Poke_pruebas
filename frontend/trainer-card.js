// trainer-card.js

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
  if (!canvas || !currentCardTrainer) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  ctx.font = 'bold 32px sans-serif';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeText(currentCardTrainer.name || "Trainer", 40, 45);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(currentCardTrainer.name || "Trainer", 40, 45);

  if (currentCardTrainer.personaje_url) {
    try {
      const trainerImg = await loadImage(currentCardTrainer.personaje_url);
      const aspectRatio = trainerImg.width / trainerImg.height;
      const targetHeight = 420;
      const targetWidth = targetHeight * aspectRatio;
      ctx.drawImage(trainerImg, canvas.width - targetWidth, 20, targetWidth, targetHeight);
    } catch (e) {}
  }

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

  try {
    const customImg = await loadImage("https://i.imgur.com/vyccVOp.png");
    ctx.drawImage(customImg, 477, 39); 
  } catch (e) {}

  const pokeSize = 130;
  const startX = 22;
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

      // 1. Dibuja la imagen del Pokémon de manera independiente
      try {
        const pokeImg = await loadImage(`https://raw.githubusercontent.com/PokeAPI/sprites/refs/heads/master/sprites/pokemon/versions/generation-ix/champions/${p.id}.png`);
        ctx.drawImage(pokeImg, x, y, pokeSize, pokeSize);
      } catch (e) {}

      // ==========================================
      // 2. POSICIONES INDEPENDIENTES PARA LOS NOMBRES
      // ==========================================
      const nameXOffset = 65; // Desplazamiento horizontal fijo

      // Modifica estos valores por separado para subir o bajar cada fila:
      const nameYOffsetRow1 = 150; // Altura del texto para la Fila 1 (Pokémons 1 al 4)
      const nameYOffsetRow2 = 145; // Altura del texto para la Fila 2 (Pokémons 5 al 8) - ¡Ajústalo aquí!

      const currentYOffset = (row === 0) ? nameYOffsetRow1 : nameYOffsetRow2;

      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.fillText(p.name.toUpperCase(), x + nameXOffset, y + currentYOffset);
      ctx.textAlign = 'left';
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
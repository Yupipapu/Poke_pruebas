require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { db, runAsync, getAsync, allAsync, initDatabase } = require('./database');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

function formatName(name) {
  return name
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
}

async function syncPokemonsFromPokeAPI() {
  try {
    const existing = await getAsync("SELECT COUNT(*) as count FROM POKEMON");
    if (existing && existing.count > 10000) return;

    console.log("Inicializando base de datos completa de PokéAPI...");
    const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=100000");
    const data = await res.json();

    await runAsync("BEGIN TRANSACTION");
    for (const p of data.results) {
      const pokedexNum = Number(p.url.split("/").filter(Boolean).pop());
      const formattedName = formatName(p.name);

      await runAsync(
        "INSERT OR IGNORE INTO POKEMON (id_pokemon, nombre, numero_pokedex) VALUES (?, ?, ?)",
        [pokedexNum, formattedName, pokedexNum]
      );
    }
    await runAsync("COMMIT");
    console.log(`✅ PokéAPI sincronizada (${data.results.length} Pokémon).`);
  } catch (err) {
    await runAsync("ROLLBACK").catch(() => {});
    console.error("Error cargando PokéAPI:", err.message);
  }
}

async function getDiscordUserData(discordId) {
  try {
    const user = await client.users.fetch(discordId);
    return {
      id: user.id,
      username: user.username,
      avatar: user.displayAvatarURL({ extension: 'png', size: 256 })
    };
  } catch (error) {
    const avatarIndex = Number(BigInt(discordId) % 5n);
    return {
      id: discordId,
      username: 'Entrenador',
      avatar: `https://cdn.discordapp.com/embed/avatars/${avatarIndex}.png`
    };
  }
}

// ENDPOINTS MEDALLAS
app.get('/api/medallas', async (req, res) => {
  try {
    const medallas = await allAsync("SELECT * FROM MEDALLA") || [];
    res.json(medallas);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/medallas', async (req, res) => {
  const { nombre, tipo, descripcion, imagen_url } = req.body;
  if (!nombre || !tipo) return res.status(400).json({ error: "Nombre y Tipo obligatorios" });
  try {
    const r = await runAsync("INSERT INTO MEDALLA (nombre, tipo, descripcion, imagen_url) VALUES (?, ?, ?, ?)", [nombre, tipo, descripcion || '', imagen_url || '']);
    res.status(201).json({ id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/medallas/:id', async (req, res) => {
  const { nombre, tipo, descripcion, imagen_url } = req.body;
  try {
    await runAsync("UPDATE MEDALLA SET nombre = ?, tipo = ?, descripcion = ?, imagen_url = ? WHERE id_medalla = ?", [nombre, tipo, descripcion || '', imagen_url || '', req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/medallas/:id', async (req, res) => {
  try {
    await runAsync("DELETE FROM MEDALLA WHERE id_medalla = ?", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ENDPOINTS CONFIGURACIÓN BOT
app.get('/api/configuracion', async (req, res) => {
  try {
    const config = await getAsync("SELECT * FROM CONFIGURACION_BOT WHERE id = 1");
    res.json(config || { canal_id: '', plantilla_mensaje: '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/configuracion', async (req, res) => {
  const { canal_id, plantilla_mensaje } = req.body;
  try {
    await runAsync("UPDATE CONFIGURACION_BOT SET canal_id = ?, plantilla_mensaje = ? WHERE id = 1", [canal_id || '', plantilla_mensaje || '']);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ganador/notificar', async (req, res) => {
  const { id_usuario } = req.body;
  try {
    const config = await getAsync("SELECT * FROM CONFIGURACION_BOT WHERE id = 1");
    const user = await getAsync("SELECT * FROM USUARIO WHERE id_usuario = ?", [id_usuario]);

    if (!user) return res.status(404).json({ error: "Entrenador no encontrado" });

    let msg = (config ? config.plantilla_mensaje : '')
      .replace(/{entrenador}/g, user.nombre)
      .replace(/{discord_id}/g, user.discord_id)
      .replace(/{sala}/g, config ? (config.canal_id || '') : '');

    const discordUser = await client.users.fetch(user.discord_id);
    if (discordUser) {
      await discordUser.send(msg);
      return res.json({ success: true });
    }
    res.status(400).json({ error: "No se pudo contactar al usuario por mensaje privado." });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ENDPOINTS USUARIOS
app.get('/api/usuarios', async (req, res) => {
  try {
    const rows = await allAsync(`
      SELECT u.id_usuario as id, u.discord_id, u.nombre as name, u.avatar_url, u.fondo_url, u.personaje_url, u.numero_participaciones as participations,
      COUNT(um.id_medalla) as medals
      FROM USUARIO u
      LEFT JOIN USUARIO_MEDALLA um ON u.id_usuario = um.id_usuario
      GROUP BY u.id_usuario
    `) || [];
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/usuarios/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const u = await getAsync("SELECT * FROM USUARIO WHERE id_usuario = ?", [id]);
    
    if (!u) return res.status(404).json({ error: "Entrenador no encontrado" });

    let eq = await getAsync("SELECT * FROM EQUIPO WHERE id_usuario = ?", [id]);
    if (!eq) {
      const teamName = `Equipo de ${u.nombre}`;
      const eRes = await runAsync("INSERT INTO EQUIPO (id_usuario, nombre) VALUES (?, ?)", [id, teamName]);
      eq = { id_equipo: eRes.lastID, nombre: teamName };
    }

    const medals = await allAsync(`
      SELECT m.id_medalla as id, m.nombre as name, m.tipo as type, m.descripcion as description, m.imagen_url
      FROM MEDALLA m
      JOIN USUARIO_MEDALLA um ON m.id_medalla = um.id_medalla
      WHERE um.id_usuario = ?
    `, [id]) || [];

    const pokemonRows = await allAsync(`
      SELECT p.id_pokemon as id, p.nombre as name, p.numero_pokedex, ep.posicion as position
      FROM EQUIPO_POKEMON ep
      LEFT JOIN POKEMON p ON ep.id_pokemon = p.id_pokemon
      WHERE ep.id_equipo = ?
      ORDER BY ep.posicion ASC
    `, [eq.id_equipo]) || [];

    const validPokemon = pokemonRows
      .filter(p => p && p.id)
      .map(p => ({
        id: p.id,
        name: formatName(p.name || 'Desconocido'),
        position: p.position
      }));

    res.json({
      id: u.id_usuario,
      discord_id: u.discord_id,
      name: u.nombre,
      avatar_url: u.avatar_url,
      fondo_url: u.fondo_url || '',
      personaje_url: u.personaje_url || '',
      participations: u.numero_participaciones,
      team: { id: eq.id_equipo, name: eq.nombre },
      medals: medals,
      pokemon: validPokemon
    });
  } catch (e) {
    console.error("Error en GET /api/usuarios/:id ->", e);
    res.status(500).json({ error: `Error en el servidor: ${e.message}` });
  }
});

app.post('/api/usuarios', async (req, res) => {
  const { discord_id, name, participations, pokemon, medals, fondo_url, personaje_url } = req.body;
  if (!discord_id || !name || !pokemon || pokemon.length !== 8) {
    return res.status(400).json({ error: "Datos incompletos o equipo fuera de 8 Pokémon." });
  }

  try {
    const discordUser = await getDiscordUserData(discord_id);
    await runAsync("BEGIN TRANSACTION");

    const uRes = await runAsync(
      "INSERT INTO USUARIO (discord_id, nombre, numero_participaciones, avatar_url, fondo_url, personaje_url) VALUES (?, ?, ?, ?, ?, ?)",
      [String(discord_id), name, participations || 0, discordUser.avatar, fondo_url || '', personaje_url || '']
    );
    const userId = uRes.lastID;

    const teamName = `Equipo de ${name}`;
    const eRes = await runAsync("INSERT INTO EQUIPO (id_usuario, nombre) VALUES (?, ?)", [userId, teamName]);
    const teamId = eRes.lastID;

    for (let i = 0; i < pokemon.length; i++) {
      await runAsync("INSERT INTO EQUIPO_POKEMON (id_equipo, id_pokemon, posicion) VALUES (?, ?, ?)", [teamId, pokemon[i], i + 1]);
    }

    if (medals && Array.isArray(medals)) {
      for (const mId of medals) {
        await runAsync("INSERT INTO USUARIO_MEDALLA (id_usuario, id_medalla) VALUES (?, ?)", [userId, mId]);
      }
    }

    await runAsync("COMMIT");
    res.status(201).json({ success: true, id: userId });
  } catch (e) {
    await runAsync("ROLLBACK").catch(() => {});
    if (e.message && e.message.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "El Discord ID ya está registrado." });
    }
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/usuarios/:id', async (req, res) => {
  const id = req.params.id;
  const { discord_id, name, participations, pokemon, medals, fondo_url, personaje_url } = req.body;
  if (!discord_id || !name || !pokemon || pokemon.length !== 8) {
    return res.status(400).json({ error: "Datos inválidos o equipo no contiene 8 Pokémon." });
  }

  try {
    const current = await getAsync("SELECT * FROM USUARIO WHERE id_usuario = ?", [id]);
    if (!current) return res.status(404).json({ error: "Entrenador no encontrado" });

    let avatarUrl = current.avatar_url;
    if (current.discord_id !== String(discord_id)) {
      const dUser = await getDiscordUserData(discord_id);
      avatarUrl = dUser.avatar;
    }

    await runAsync("BEGIN TRANSACTION");
    await runAsync(
      "UPDATE USUARIO SET discord_id = ?, nombre = ?, numero_participaciones = ?, avatar_url = ?, fondo_url = ?, personaje_url = ? WHERE id_usuario = ?",
      [String(discord_id), name, participations, avatarUrl, fondo_url || '', personaje_url || '', id]
    );

    let eq = await getAsync("SELECT id_equipo FROM EQUIPO WHERE id_usuario = ?", [id]);
    const teamName = `Equipo de ${name}`;

    if (!eq) {
      const eRes = await runAsync("INSERT INTO EQUIPO (id_usuario, nombre) VALUES (?, ?)", [id, teamName]);
      eq = { id_equipo: eRes.lastID };
    } else {
      await runAsync("UPDATE EQUIPO SET nombre = ? WHERE id_equipo = ?", [teamName, eq.id_equipo]);
    }

    await runAsync("DELETE FROM EQUIPO_POKEMON WHERE id_equipo = ?", [eq.id_equipo]);
    for (let i = 0; i < pokemon.length; i++) {
      await runAsync("INSERT INTO EQUIPO_POKEMON (id_equipo, id_pokemon, posicion) VALUES (?, ?, ?)", [eq.id_equipo, pokemon[i], i + 1]);
    }

    await runAsync("DELETE FROM USUARIO_MEDALLA WHERE id_usuario = ?", [id]);
    if (medals && Array.isArray(medals)) {
      for (const mId of medals) {
        await runAsync("INSERT INTO USUARIO_MEDALLA (id_usuario, id_medalla) VALUES (?, ?)", [id, mId]);
      }
    }

    await runAsync("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await runAsync("ROLLBACK").catch(() => {});
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/usuarios/:id/pokemon/orden', async (req, res) => {
  const id = req.params.id;
  const { pokemon } = req.body;
  if (!pokemon || pokemon.length !== 8) {
    return res.status(400).json({ error: "Debe reordenar exactamente 8 Pokémon." });
  }

  try {
    const eq = await getAsync("SELECT id_equipo FROM EQUIPO WHERE id_usuario = ?", [id]);
    if (!eq) return res.status(404).json({ error: "Equipo no encontrado" });

    await runAsync("BEGIN TRANSACTION");
    await runAsync("DELETE FROM EQUIPO_POKEMON WHERE id_equipo = ?", [eq.id_equipo]);
    for (const p of pokemon) {
      await runAsync("INSERT INTO EQUIPO_POKEMON (id_equipo, id_pokemon, posicion) VALUES (?, ?, ?)", [eq.id_equipo, p.id, p.position]);
    }
    await runAsync("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await runAsync("ROLLBACK").catch(() => {});
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    await runAsync("DELETE FROM USUARIO WHERE id_usuario = ?", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/discord/:discordId', async (req, res) => {
  const data = await getDiscordUserData(req.params.discordId);
  res.json(data);
});

const PORT = process.env.PORT || 3000;

async function start() {
  await initDatabase();
  await syncPokemonsFromPokeAPI();

  if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN)
      .then(() => console.log("Discord conectado"))
      .catch((err) => console.warn("Modo fallback Discord activado:", err.message));
  } else {
    console.warn("Token de Discord no configurado.");
  }

  app.listen(PORT, () => console.log(`Servidor iniciado en http://localhost:${PORT}`));
}

start();
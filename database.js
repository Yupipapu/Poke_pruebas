const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const dbPath = path.join(dbDir, 'database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error al abrir la base de datos:", err.message);
  } else {
    console.log("Base de datos conectada en:", dbPath);
  }
});

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDatabase() {
  await runAsync("PRAGMA foreign_keys = ON;");

  await runAsync(`
    CREATE TABLE IF NOT EXISTS USUARIO (
      id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      numero_participaciones INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      fondo_url TEXT,
      personaje_url TEXT
    );
  `);

  // Migraciones para bases de datos existentes
  try { await runAsync("ALTER TABLE USUARIO ADD COLUMN fondo_url TEXT;"); } catch (e) {}
  try { await runAsync("ALTER TABLE USUARIO ADD COLUMN personaje_url TEXT;"); } catch (e) {}

  await runAsync(`
    CREATE TABLE IF NOT EXISTS EQUIPO (
      id_equipo INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
    );
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS POKEMON (
      id_pokemon INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL,
      numero_pokedex INTEGER NOT NULL UNIQUE
    );
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS EQUIPO_POKEMON (
      id_equipo INTEGER NOT NULL,
      id_pokemon INTEGER NOT NULL,
      posicion INTEGER NOT NULL,
      PRIMARY KEY (id_equipo, id_pokemon),
      UNIQUE (id_equipo, posicion),
      FOREIGN KEY (id_equipo) REFERENCES EQUIPO(id_equipo) ON DELETE CASCADE,
      FOREIGN KEY (id_pokemon) REFERENCES POKEMON(id_pokemon)
    );
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS MEDALLA (
      id_medalla INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT,
      imagen_url TEXT
    );
  `);

  try { await runAsync("ALTER TABLE MEDALLA ADD COLUMN imagen_url TEXT;"); } catch (e) {}

  await runAsync(`
    CREATE TABLE IF NOT EXISTS USUARIO_MEDALLA (
      id_usuario INTEGER NOT NULL,
      id_medalla INTEGER NOT NULL,
      PRIMARY KEY (id_usuario, id_medalla),
      FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
      FOREIGN KEY (id_medalla) REFERENCES MEDALLA(id_medalla) ON DELETE CASCADE
    );
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS CONFIGURACION_BOT (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      canal_id TEXT NOT NULL DEFAULT '',
      plantilla_mensaje TEXT NOT NULL DEFAULT '¡Felicidades {entrenador}! Has ganado el torneo en {sala}.'
    );
  `);

  await runAsync(`
    INSERT OR IGNORE INTO CONFIGURACION_BOT (id, canal_id, plantilla_mensaje)
    VALUES (1, 'Sala Principal', '¡Felicidades {entrenador}! Has ganado el torneo en {sala}.');
  `);

  console.log("Tablas verificadas");
}

module.exports = { db, runAsync, getAsync, allAsync, initDatabase };

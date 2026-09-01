const fs = require("fs");
const path = require("path");

function mysqlConfigured() {
  return ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"].every((key) => String(process.env[key] || "").trim());
}

function createStorage({ dataFile, createEmptyState, normalizeState }) {
  const useMysql = mysqlConfigured();
  let pool = null;

  function ensureJsonFile() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    if (!fs.existsSync(dataFile)) {
      fs.writeFileSync(dataFile, JSON.stringify(createEmptyState(), null, 2));
    }
  }

  async function init() {
    if (!useMysql) {
      ensureJsonFile();
      return;
    }

    const mariadb = require("mariadb");
    pool = mariadb.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: "utf8mb4",
      connectionLimit: 5,
      acquireTimeout: 10000,
      connectTimeout: 5000,
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_state (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        payload LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_state_backups (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        payload LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await pool.query(
      "INSERT IGNORE INTO crm_state (id, payload) VALUES (1, ?)",
      [JSON.stringify(createEmptyState())],
    );
  }

  async function read() {
    if (!useMysql) {
      ensureJsonFile();
      return normalizeState(JSON.parse(fs.readFileSync(dataFile, "utf8")));
    }

    const rows = await pool.query("SELECT payload FROM crm_state WHERE id = 1");
    if (!rows.length) return normalizeState(createEmptyState());
    return normalizeState(JSON.parse(rows[0].payload));
  }

  function rotateJsonBackups() {
    const backupDir = path.join(path.dirname(dataFile), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    if (fs.existsSync(dataFile)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.copyFileSync(dataFile, path.join(backupDir, `crm-${stamp}.json`));
    }
    const backups = fs.readdirSync(backupDir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .reverse();
    backups.slice(20).forEach((name) => fs.unlinkSync(path.join(backupDir, name)));
  }

  async function write(inputState) {
    const state = normalizeState(inputState);
    state.meta.updatedAt = new Date().toISOString();
    const payload = JSON.stringify(state);

    if (!useMysql) {
      ensureJsonFile();
      rotateJsonBackups();
      const temporaryFile = `${dataFile}.tmp`;
      fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2));
      fs.renameSync(temporaryFile, dataFile);
      return state;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const rows = await connection.query("SELECT payload FROM crm_state WHERE id = 1 FOR UPDATE");
      if (rows.length) {
        await connection.query("INSERT INTO crm_state_backups (payload) VALUES (?)", [rows[0].payload]);
      }
      await connection.query("UPDATE crm_state SET payload = ? WHERE id = 1", [payload]);
      await connection.query(`
        DELETE FROM crm_state_backups
        WHERE id NOT IN (
          SELECT id FROM (
            SELECT id FROM crm_state_backups ORDER BY id DESC LIMIT 25
          ) AS latest_backups
        )
      `);
      await connection.commit();
      return state;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.release();
    }
  }

  function info() {
    return {
      backend: useMysql ? "mysql" : "json",
      persistent: useMysql,
      label: useMysql ? "MySQL database" : "Local JSON file",
    };
  }

  return { init, read, write, info };
}

module.exports = { createStorage };

// server/server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(bodyParser.json());

// Configurações
const PORT       = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const SALT_ROUNDS = 10;

console.log('DATABASE_URL =', process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE'
  );
  next();
});

// Middleware de autenticação JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Garante existência das tabelas e colunas
async function ensureSchema() {
  // 1) users (caso já não exista)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      cpf TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // 2) requests
  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      requested BOOLEAN NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // 3) FK user_id → users(id)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_requests_user'
          AND table_name = 'requests'
      ) THEN
        ALTER TABLE requests
        ADD CONSTRAINT fk_requests_user
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);

  // 4) UNIQUE per user_id
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'unique_user_request'
          AND table_name = 'requests'
      ) THEN
        ALTER TABLE requests
        ADD CONSTRAINT unique_user_request
        UNIQUE(user_id);
      END IF;
    END
    $$;
  `);

  // Atualize a criação da tabela para incluir um ID e corrigir o nome da coluna
  await pool.query(`
    CREATE TABLE IF NOT EXISTS onibus_gps (
      id SERIAL PRIMARY KEY,
      bus_id TEXT NOT NULL,
      latitude DECIMAL(10,6) NOT NULL,
      longitude DECIMAL(10,6) NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

// Nova rota para obter dados do usuário
app.get('/api/user', authenticateToken, async (req, res) => {
console.log('🔐 Usuario autenticado:', req.user);
  try {
    const result = await pool.query(
      'SELECT id, cpf, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Rotas de registro/login
app.post('/api/register', async (req, res) => {
  const { cpf, password } = req.body;
  if (!cpf || !password) {
    return res.status(400).json({ error: 'CPF e senha são obrigatórios' });
  }
  try {
    const exist = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cpf.replace(/\D/g, '')]
    );
    if (exist.rows.length) {
      return res.status(400).json({ error: 'CPF já cadastrado' });
    }
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (cpf, password) VALUES ($1,$2) RETURNING id, cpf`,
      [cpf.replace(/\D/g, ''), hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.post('/api/login', async (req, res) => {
  const { cpf, password } = req.body;
  if (!cpf || !password) {
    return res.status(400).json({ error: 'CPF e senha são obrigatórios' });
  }
  try {
    const result = await pool.query(
      'SELECT id, cpf, password FROM users WHERE cpf = $1',
      [cpf.replace(/\D/g, '')]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: 'CPF ou senha incorretos' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'CPF ou senha incorretos' });
    }
    const token = jwt.sign(
      { id: user.id, cpf: user.cpf },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, userId: user.id });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// POST /api/requests (cria ou atualiza)
app.post('/api/requests', authenticateToken, async (req, res) => {
  console.log('POST /api/requests →', req.user, req.body);
  const { origin, destination, requested } = req.body;
  if (!origin || !destination || requested !== true) {
    return res.status(400).json({ error: 'Payload inválido' });
  }
  try {
    const result = await pool.query(
      `
      INSERT INTO requests (user_id, origin, destination, requested)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (user_id)
      DO UPDATE SET
        origin = EXCLUDED.origin,
        destination = EXCLUDED.destination,
        requested = EXCLUDED.requested,
        created_at = NOW()
      RETURNING id
      `,
      [req.user.id, origin, destination, requested]
    );
    res.status(201).json({
      id: result.rows[0].id,
      message: 'Solicitação processada com sucesso'
    });
  } catch (err) {
    console.error('Erro ao gravar pedido:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// GET /api/requests/current (lê)
app.get('/api/requests/current', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM requests WHERE user_id = $1',
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: 'Nenhuma solicitação encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar pedido:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Rota para atualização de posição de ônibus
app.post('/api/buses/update', async (req, res) => {
  const { bus_id, latitude, longitude } = req.body;

  // Validação básica
  if (!bus_id || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      error: 'bus_id, latitude e longitude são obrigatórios'
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO onibus_gps (bus_id, latitude, longitude)
       VALUES ($1, $2, $3)
       RETURNING bus_id, latitude, longitude, timestamp as recorded_at`,
      [bus_id, latitude, longitude]
    );

    res.status(201).json({
      success: true,
      bus: result.rows[0]
    });
  } catch (err) {
    console.error('Erro ao atualizar ônibus:', err);
    res.status(500).json({
      error: 'Erro ao atualizar posição do ônibus',
      details: err.message
    });
  }
});

// Rota para buscar ônibus próximos (com polling)
// Modifique a rota /api/buses/nearby para incluir cálculo de distância
app.get('/api/buses/nearby', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, radius = 2 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: 'Parâmetros latitude e longitude são obrigatórios'
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rad = parseFloat(radius) * 1000; // Convertendo para metros

    if (isNaN(lat) || isNaN(lng) || isNaN(rad)) {
      return res.status(400).json({
        error: 'Parâmetros devem ser números válidos'
      });
    }

    const result = await pool.query(
      `WITH latest_buses AS (
         SELECT DISTINCT ON (bus_id)
           bus_id, latitude, longitude, timestamp as recorded_at
         FROM onibus_gps
         ORDER BY bus_id, timestamp DESC
       )
       SELECT
         bus_id,
         latitude,
         longitude,
         recorded_at,
         ST_Distance(
           ST_MakePoint(longitude, latitude)::geography,
           ST_MakePoint($1, $2)::geography
         ) as distance
       FROM latest_buses
       WHERE ST_DWithin(
         ST_MakePoint(longitude, latitude)::geography,
         ST_MakePoint($1, $2)::geography,
         $3
       )
       ORDER BY distance ASC
       LIMIT 10`,  // Limite para evitar retornar muitos resultados
      [lng, lat, rad]
    );

    res.json({
      success: true,
      buses: result.rows,
      lastUpdate: new Date().toISOString()
    });

  } catch (err) {
    console.error('Erro ao buscar ônibus:', err);
    res.status(500).json({
      success: false,
      error: 'Erro interno no servidor',
      details: err.message
    });
  }
});



// GET /api/buses/:bus_id/history (sem INTERVAL)
app.get('/api/buses/:bus_id/history', authenticateToken, async (req, res) => {
  try {
    const { bus_id } = req.params;
    const { hours = 1 } = req.query;

    const result = await pool.query(
      `SELECT bus_id, latitude, longitude, timestamp as recorded_at
       FROM onibus_gps
       WHERE bus_id = $1
       AND timestamp > (CURRENT_TIMESTAMP - ($2 || ' hours')::interval)
       ORDER BY timestamp ASC`,
      [bus_id, hours]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    res.status(500).json({
      error: 'Erro ao buscar histórico do ônibus'
    });
  }
});


// ** NOVA ROTA ** PUT /api/requests/current (confirma embarque)
app.put('/api/requests/current', authenticateToken, async (req, res) => {
  try {
    console.log('Recebida requisição PUT'); // Log de debug
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE requests
       SET requested = false
       WHERE user_id = $1
       RETURNING *`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhuma solicitação ativa encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Embarque confirmado com sucesso',
      request: result.rows[0]
    });

  } catch (err) {
    console.error('Erro no servidor:', err);
    res.status(500).json({
      success: false,
      error: 'Erro interno no servidor'
    });
  }
});

// Healthcheck
app.get('/api/test', (req, res) => {
  res.json({
    status: 'API está funcionando',
    timestamp: new Date(),
    routes: {
      register: 'POST /api/register',
      login:    'POST /api/login',
      post:     'POST /api/requests',
      get:      'GET  /api/requests/current',
      put:      'PUT  /api/requests/current'
    }
  });
});

// Sobe o servidor só depois de garantir o schema
ensureSchema()
  .then(() => {
    console.log('Schema garantido — iniciando servidor...');
    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
  })
  .catch(err => {
    console.error('Erro garantindo schema:', err);
    process.exit(1);
  });

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
const PORT = process.env.PORT || 5000;
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
  const token =
    authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Garante existência das tabelas, colunas e constraints
async function ensureSchema() {
  // (1) cria tabela se não existir
  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      requested BOOLEAN NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // (2) adiciona user_id se necessário
  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS user_id INTEGER;
  `);

  // (3) corrige valores nulos em created_at
  await pool.query(`
    UPDATE requests
    SET created_at = NOW()
    WHERE created_at IS NULL;
  `);

  // (4) garante default de created_at
  await pool.query(`
    ALTER TABLE requests
    ALTER COLUMN created_at SET DEFAULT NOW();
  `);

  // (5) cria FK e UNIQUE via DO $$ … $$; conforme já estava
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
}


// Rotas de autenticação
app.post('/api/register', async (req, res) => {
  const { cpf, password } = req.body;

  if (!cpf || !password) {
    return res
      .status(400)
      .json({ error: 'CPF e senha são obrigatórios' });
  }

  try {
    const userExists = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cpf.replace(/\D/g, '')]
    );

    if (userExists.rows.length > 0) {
      return res
        .status(400)
        .json({ error: 'CPF já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      SALT_ROUNDS
    );

    const result = await pool.query(
      `INSERT INTO users (cpf, password)
       VALUES ($1, $2)
       RETURNING id, cpf`,
      [cpf.replace(/\D/g, ''), hashedPassword]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res
      .status(500)
      .json({ error: 'Erro interno no servidor' });
  }
});

app.post('/api/login', async (req, res) => {
  const { cpf, password } = req.body;

  if (!cpf || !password) {
    return res
      .status(400)
      .json({ error: 'CPF e senha são obrigatórios' });
  }

  try {
    const result = await pool.query(
      'SELECT id, cpf, password FROM users WHERE cpf = $1',
      [cpf.replace(/\D/g, '')]
    );

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ error: 'CPF ou senha incorretos' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(
      password,
      user.password
    );
    if (!match) {
      return res
        .status(401)
        .json({ error: 'CPF ou senha incorretos' });
    }

    const token = jwt.sign(
      { id: user.id, cpf: user.cpf },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, userId: user.id });
  } catch (err) {
    console.error('Erro no login:', err);
    res
      .status(500)
      .json({ error: 'Erro interno no servidor' });
  }
});

// Rotas protegidas de requests
app.post(
  '/api/requests',
  authenticateToken,
  async (req, res) => {
    console.log(
      'POST /api/requests →',
      req.user,
      req.body
    );
    const { origin, destination, requested } =
      req.body;

    if (
      !origin ||
      !destination ||
      requested !== true
    ) {
      return res
        .status(400)
        .json({ error: 'Payload inválido' });
    }

    try {
      const result = await pool.query(
        `
        INSERT INTO requests (user_id, origin, destination, requested)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id)
        DO UPDATE SET
          origin = EXCLUDED.origin,
          destination = EXCLUDED.destination,
          requested = EXCLUDED.requested,
          created_at = NOW()
        RETURNING id
      `,
        [
          req.user.id,
          origin,
          destination,
          requested
        ]
      );

      res.status(201).json({
        id: result.rows[0].id,
        message: 'Solicitação processada com sucesso'
      });
    } catch (err) {
      console.error('Erro ao gravar pedido:', err);
      res
        .status(500)
        .json({ error: 'Erro interno no servidor' });
    }
  }
);

app.get(
  '/api/requests/current',
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM requests WHERE user_id = $1',
        [req.user.id]
      );
      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({
            message: 'Nenhuma solicitação encontrada'
          });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Erro ao buscar pedido:', err);
      res
        .status(500)
        .json({ error: 'Erro interno no servidor' });
    }
  }
);

// Healthcheck
app.get('/api/test', (req, res) => {
  res.json({
    status: 'API está funcionando',
    timestamp: new Date(),
    routes: {
      register: 'POST /api/register',
      login: 'POST /api/login',
      requests: 'POST /api/requests'
    }
  });
});

// Só sobe o servidor depois de garantir o schema
ensureSchema()
  .then(() => {
    console.log(
      'Schema garantido — iniciando servidor...'
    );
    app.listen(PORT, () =>
      console.log(`API rodando na porta ${PORT}`)
    );
  })
  .catch(err => {
    console.error('Erro garantindo schema:', err);
    process.exit(1);
  });

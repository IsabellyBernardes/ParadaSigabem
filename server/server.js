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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

// Middleware de autenticação JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Criar tabelas
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      cpf TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      requested BOOLEAN NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_user_request UNIQUE (user_id)
    );
  `);
}

// Rotas de autenticação
app.post('/api/register', async (req, res) => {
  const { cpf, password } = req.body;

  if (!cpf || !password) {
    return res.status(400).json({ error: 'CPF e senha são obrigatórios' });
  }

  try {
    // Verifica se usuário já existe
    const userExists = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cpf.replace(/\D/g, '')]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'CPF já cadastrado' });
    }

    // Criptografa a senha
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Insere novo usuário
    const result = await pool.query(
      `INSERT INTO users (cpf, password)
       VALUES ($1, $2)
       RETURNING id, cpf`,
      [cpf.replace(/\D/g, ''), hashedPassword]
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
    // Busca usuário
    const result = await pool.query(
      'SELECT id, cpf, password FROM users WHERE cpf = $1',
      [cpf.replace(/\D/g, '')]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'CPF ou senha incorretos' });
    }

    const user = result.rows[0];

    // Verifica senha
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'CPF ou senha incorretos' });
    }

    // Gera token JWT
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

// Rotas protegidas
app.post('/api/requests', authenticateToken, async (req, res) => {
  console.log('Recebido POST /api/requests com body:', req.body);
  const { origin, destination, requested } = req.body;

  // Validações básicas
  if (!origin || !destination || requested !== true) {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  try {
    // Usando UPSERT para atualizar ou inserir
    const result = await pool.query(`
      INSERT INTO requests (user_id, origin, destination, requested)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id)
      DO UPDATE SET
        origin = EXCLUDED.origin,
        destination = EXCLUDED.destination,
        requested = EXCLUDED.requested,
        created_at = NOW()
      RETURNING id
    `, [req.user.id, origin, destination, requested]);

    res.status(201).json({
      id: result.rows[0].id,
      message: result.rows[0].id ? 'Solicitação atualizada com sucesso' : 'Nova solicitação criada'
    });
  } catch (err) {
    console.error('Erro ao gravar pedido:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Rota para obter a solicitação atual do usuário
app.get('/api/requests/current', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM requests WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Nenhuma solicitação encontrada' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar pedido:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Adicione esta rota no seu server.js (antes do app.listen)
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

// Inicializa o servidor
ensureSchema()
  .then(() => {
    console.log('Tabelas criadas - iniciando servidor...');
    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
  })
  .catch(err => {
    console.error('Erro garantindo schema:', err);
    process.exit(1);
  });
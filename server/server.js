// server/server.js
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
app.use(bodyParser.json());

console.log('DATABASE_URL =', process.env.DATABASE_URL);
// Configura a conexão com o banco
const pool = new Pool({
   connectionString: process.env.DATABASE_URL,
});

// Habilita CORS para aceitar requisições do app
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Função para criar a tabela se não existir
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      requested BOOLEAN NOT NULL,
      created_at TIMESTAMP NOT NULL
    );
  `);
}

// Rota para receber os pedidos do app
app.post('/api/requests', async (req, res) => {
  console.log('Recebido POST /api/requests com body:', req.body);
  const { origin, destination, requested, timestamp } = req.body;

  // Validações básicas
  if (!origin || !destination || requested !== true) {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO requests (origin, destination, requested, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [origin, destination, requested, timestamp]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('Erro ao gravar pedido:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Inicializa o servidor após garantir o schema
const PORT = process.env.PORT || 5000;
ensureSchema()
  .then(() => {
    console.log('Tabela "requests" ok — iniciando servidor...');
    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
  })
  .catch(err => {
    console.error('Erro garantindo schema:', err);
    process.exit(1);
  });

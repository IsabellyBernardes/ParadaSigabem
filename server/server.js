// server/server.js
require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const { Pool }   = require('pg');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');

const app = express();
app.use(bodyParser.json());

// Configurações
const PORT        = process.env.PORT || 5000;
const JWT_SECRET  = process.env.JWT_SECRET || 'your_jwt_secret';
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

// -------------------------------------------------------------
// Função que garante existência de todas as tabelas (schema)
// -------------------------------------------------------------
async function ensureSchema() {
  // ---------------------------------------------------------
  // 1) Tabela `users`
  // ---------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL      PRIMARY KEY,
      cpf        TEXT        NOT NULL UNIQUE,
      password   TEXT        NOT NULL,
      created_at TIMESTAMP   NOT NULL DEFAULT NOW()
    );
  `);

  // ---------------------------------------------------------
  // 2) Tabela `requests`
  // ---------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id          SERIAL      PRIMARY KEY,
      user_id     INTEGER,
      origin      TEXT        NOT NULL,
      destination TEXT        NOT NULL,
      requested   BOOLEAN     NOT NULL,
      created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
    );
  `);

  // 3) Adicionar FK user_id → users(id), se não existir
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

  // 4) Garantir UNIQUE(user_id) em requests, para permitir ON CONFLICT
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

  // ---------------------------------------------------------
  // 5) Tabela `onibus_gps`
  // ---------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS onibus_gps (
      id            SERIAL          PRIMARY KEY,
      bus_id        TEXT            NOT NULL,
      latitude      DECIMAL(10,6)   NOT NULL,
      longitude     DECIMAL(10,6)   NOT NULL,
      velocidade    REAL            DEFAULT NULL,
      trip_headsign TEXT            DEFAULT NULL,
      timestamp     TIMESTAMP       NOT NULL DEFAULT NOW()
    );
  `);

  // ---------------------------------------------------------
  // 6) Tabela `total_request`
  //
  // • Se não existir, criamos do zero.
  // • Se existir, mas tiver esquema diferente, recriamos e migramos dados.
  // ---------------------------------------------------------
  const tableCheck = await pool.query(
    `SELECT to_regclass('public.total_request') as exists;`
  );
  const existsTotalRequest = tableCheck.rows[0].exists !== null;

  if (!existsTotalRequest) {
    // → NÃO EXISTE: cria do zero
    await pool.query(`
      CREATE TABLE total_request (
        trip_headsign  TEXT    PRIMARY KEY,
        total_requests INTEGER NOT NULL DEFAULT 0
      );
    `);
    console.log('Tabela total_request criada do zero.');

  } else {
    // → EXISTE: checar colunas, tipos e PK
    const colRes = await pool.query(
      `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'total_request'
      ORDER BY ordinal_position;
      `
    );
    const cols = {};
    colRes.rows.forEach(r => {
      cols[r.column_name] = r.data_type;
    });

    let needRecreate = false;
    if (cols['trip_headsign'] !== 'text') {
      console.warn('→ Coluna trip_headsign ausente ou tipo diferente em total_request.');
      needRecreate = true;
    }
    if (cols['total_requests'] !== 'integer') {
      console.warn('→ Coluna total_requests ausente ou tipo diferente em total_request.');
      needRecreate = true;
    }

    // Checar se trip_headsign é PRIMARY KEY
    const pkRes = await pool.query(
      `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tco
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tco.constraint_name
       AND kcu.constraint_schema = tco.constraint_schema
       AND kcu.constraint_name = tco.constraint_name
      WHERE tco.constraint_type = 'PRIMARY KEY'
        AND tco.table_name = 'total_request';
      `
    );
    const pkCols = pkRes.rows.map(r => r.column_name);
    if (!(pkCols.length === 1 && pkCols[0] === 'trip_headsign')) {
      console.warn('→ A PK de total_request não está definida em trip_headsign.');
      needRecreate = true;
    }

    if (needRecreate) {
      console.log('Tabela total_request tem esquema incorreto → recriando.');

      // 1) Renomeia a tabela antiga
      await pool.query(`ALTER TABLE total_request RENAME TO total_request_old;`);

      // 2) Cria nova tabela com o esquema correto
      await pool.query(`
        CREATE TABLE total_request (
          trip_headsign  TEXT    PRIMARY KEY,
          total_requests INTEGER NOT NULL DEFAULT 0
        );
      `);

      // 3) Tenta migrar dados antigos (caso colunas existam)
      const oldCols = Object.keys(cols);
      if (oldCols.includes('trip_headsign') && oldCols.includes('total_requests')) {
        console.log('→ Migrando dados de total_request_old para total_request.');
        await pool.query(`
          INSERT INTO total_request (trip_headsign, total_requests)
          SELECT trip_headsign, total_requests
            FROM total_request_old
          WHERE trip_headsign IS NOT NULL;
        `);
      } else {
        console.log('→ Não foi possível migrar dados (colunas incompatíveis).');
      }

      // 4) Apaga a tabela antiga
      await pool.query(`DROP TABLE total_request_old;`);
      console.log('Tabela total_request recriada com sucesso.');

    } else {
      console.log('Tabela total_request já existe e está com o esquema correto.');
    }
  }


  // ---------------------------------------------------------
  // 7) PASSO NOVO: migrar todos os trip_headsign que já estão em onibus_gps
  //    para dentro de total_request (com total_requests = 0), antes de criar a FK.
  // ---------------------------------------------------------
  //   Se houver linhas em onibus_gps onde trip_headsign NÃO É NULL, mas
  //   aquele valor ainda não existe em total_request, salvamos com 0.
  //
  //   Exemplo: se onibus_gps tiver trip_headsign = 'Linha X', mas
  //   total_request não tem 'Linha X' → inserir 'Linha X', 0 →
  //   assim, ao criar a FK, não haverá violação.
  // ---------------------------------------------------------
  await pool.query(`
    INSERT INTO total_request(trip_headsign, total_requests)
      SELECT DISTINCT trip_headsign, 0
        FROM onibus_gps
       WHERE trip_headsign IS NOT NULL
    ON CONFLICT (trip_headsign) DO NOTHING;
  `);
  console.log('Migração de trip_headsign de onibus_gps → total_request concluída.');

  // ---------------------------------------------------------
  // 8) Finalmente, adicionamos a FK em onibus_gps(trip_headsign)
  //    → total_request(trip_headsign), se ainda não existir
  // ---------------------------------------------------------
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM information_schema.table_constraints
         WHERE constraint_name = 'fk_onibus_trip_headsign'
           AND table_name = 'onibus_gps'
      ) THEN
        ALTER TABLE onibus_gps
          ADD CONSTRAINT fk_onibus_trip_headsign
            FOREIGN KEY(trip_headsign)
            REFERENCES total_request(trip_headsign)
            ON DELETE SET NULL
            ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `);
  console.log('Chave estrangeira fk_onibus_trip_headsign adicionada em onibus_gps.');

  // ---------------------------------------------------------
  // (Fim de ensureSchema)
  // ---------------------------------------------------------
}




// -------------------------------------------------------------
// NOVA ROTA: retorna dados do usuário atual
// -------------------------------------------------------------
app.get('/api/user', authenticateToken, async (req, res) => {
  console.log('🔐 Usuário autenticado:', req.user);
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


// -------------------------------------------------------------
// POST /api/register  (cria novo usuário)
// -------------------------------------------------------------
app.post('/api/register', async (req, res) => {
  const { cpf, password } = req.body;
  if (!cpf || !password) {
    return res.status(400).json({ error: 'CPF e senha são obrigatórios' });
  }
  try {
    // Verifica se já existe
    const exist = await pool.query(
      'SELECT id FROM users WHERE cpf = $1',
      [cpf.replace(/\D/g, '')]
    );
    if (exist.rows.length) {
      return res.status(400).json({ error: 'CPF já cadastrado' });
    }
    // Hash da senha
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


// -------------------------------------------------------------
// POST /api/login  (autentica e retorna JWT)
// -------------------------------------------------------------
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
    // Cria token de 24h
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


// -------------------------------------------------------------
// POST /api/requests (cria ou atualiza pedido de embarque)
// -------------------------------------------------------------
app.post('/api/requests', authenticateToken, async (req, res) => {
  console.log('POST /api/requests →', req.user, req.body);
  const { origin, destination, requested } = req.body;
  // Só aceitamos requested === true aqui
  if (!origin || !destination || requested !== true) {
    return res.status(400).json({ error: 'Payload inválido' });
  }
  try {
    const result = await pool.query(
      `
      INSERT INTO requests (user_id, origin, destination, requested)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id)
      DO UPDATE SET
        origin      = EXCLUDED.origin,
        destination = EXCLUDED.destination,
        requested   = EXCLUDED.requested,
        created_at  = NOW()
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


// -------------------------------------------------------------
// GET /api/requests/current (retorna pedido ativo do usuário)
// -------------------------------------------------------------
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


// -------------------------------------------------------------
// POST /api/buses/update  (insere uma nova posição de ônibus)
// -------------------------------------------------------------
app.post('/api/buses/update', async (req, res) => {
  const { bus_id, latitude, longitude, velocidade, trip_headsign } = req.body;

  if (!bus_id || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      error: 'bus_id, latitude e longitude são obrigatórios'
    });
  }

  try {
    // 1) Se veio trip_headsign !== null, garantir que ele exista em total_request
    if (trip_headsign) {
      await pool.query(
        `
        INSERT INTO total_request (trip_headsign, total_requests)
        VALUES ($1, 0)
        ON CONFLICT (trip_headsign) DO NOTHING;
        `,
        [trip_headsign]
      );
    }

    // 2) Agora sim gravar a posição em onibus_gps:
    const result = await pool.query(
      `
      INSERT INTO onibus_gps
        (bus_id, latitude, longitude, velocidade, trip_headsign)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING
        bus_id,
        latitude,
        longitude,
        velocidade,
        trip_headsign,
        timestamp as recorded_at;
      `,
      [bus_id, latitude, longitude, velocidade || null, trip_headsign || null]
    );

    return res.status(201).json({
      success: true,
      bus: result.rows[0]
    });
  } catch (err) {
    console.error('Erro ao atualizar ônibus:', err);
    return res.status(500).json({
      error: 'Erro ao atualizar posição do ônibus',
      details: err.message
    });
  }
});



// -------------------------------------------------------------
// GET /api/buses/nearby  (busca ônibus mais próximos da localização)
// -------------------------------------------------------------
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
    const rad = parseFloat(radius) * 1000; // convertendo km→m

    if (isNaN(lat) || isNaN(lng) || isNaN(rad)) {
      return res.status(400).json({
        error: 'Parâmetros devem ser números válidos'
      });
    }

    const result = await pool.query(
      `
      WITH latest_buses AS (
        SELECT DISTINCT ON (bus_id)
          bus_id,
          latitude,
          longitude,
          velocidade,
          trip_headsign,
          timestamp as recorded_at
        FROM onibus_gps
        ORDER BY bus_id, timestamp DESC
      )
      SELECT
        bus_id,
        latitude,
        longitude,
        velocidade,
        trip_headsign,
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
      LIMIT 10;
      `,
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


// -------------------------------------------------------------
// GET /api/buses/:bus_id/history  (histórico de posição de um ônibus)
// -------------------------------------------------------------
app.get('/api/buses/:bus_id/history', authenticateToken, async (req, res) => {
  try {
    const { bus_id } = req.params;
    const { hours = 1 } = req.query;

    const result = await pool.query(
      `
      SELECT
        bus_id,
        latitude,
        longitude,
        velocidade,
        trip_headsign,
        timestamp as recorded_at
      FROM onibus_gps
      WHERE bus_id = $1
        AND timestamp > (CURRENT_TIMESTAMP - ($2 || ' hours')::interval)
      ORDER BY timestamp ASC
      `,
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


// -------------------------------------------------------------
// ** ALTERAÇÃO AQUI ** : PUT /api/requests/current  (confirma embarque)
// -------------------------------------------------------------
app.put('/api/requests/current', authenticateToken, async (req, res) => {
  try {
    console.log('Recebida requisição PUT /api/requests/current');
    console.log('   Usuário id =', req.user.id);
    console.log('   Body recebido:', req.body);

    const userId = req.user.id;
    const { trip_headsign } = req.body;
    if (!trip_headsign) {
      console.log('   ⚠ trip_headsign NÃO informado');
      return res.status(400).json({
        success: false,
        error: 'É obrigatório informar o trip_headsign do ônibus escolhido'
      });
    }
    console.log('   ✔ trip_headsign:', trip_headsign);

    // 1) Desmarca a requisição no requests
    console.log('   → Executando UPDATE requests...');
    const result = await pool.query(
      `
      UPDATE requests
        SET requested = false
      WHERE user_id = $1
      RETURNING *;
      `,
      [userId]
    );
    console.log('   ← UPDATE requests retornou rowCount =', result.rowCount);
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhuma solicitação ativa encontrada para esse usuário'
      });
    }

    // 2) Incrementa/Insere na total_request
    console.log('   → Inserindo/Atualizando total_request para trip_headsign =', trip_headsign);
    await pool.query(
      `
      INSERT INTO total_request (trip_headsign, total_requests)
      VALUES ($1, 1)
      ON CONFLICT (trip_headsign)
      DO UPDATE
        SET total_requests = total_request.total_requests + 1;
      `,
      [trip_headsign]
    );
    console.log('   ← INSERT/ON CONFLICT total_request OK');

    return res.json({
      success: true,
      message: 'Embarque confirmado com sucesso',
      request: result.rows[0]
    });

  } catch (err) {
    console.error('❌ ERRO NO SERVIDOR (PUT /api/requests/current):', err);
    return res.status(500).json({
      success: false,
      error: 'Erro interno no servidor',
      details: err.message
    });
  }
});

app.post('/api/dev-login', async (req, res) => {
  try {
    const DEV_USER_ID = 2; // ajuste para o ID que você inseriu no passo anterior

    // Busca cpf e id daquele usuário
    const result = await pool.query(
      'SELECT id, cpf FROM users WHERE id = $2',
      [DEV_USER_ID]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Usuário de teste não encontrado' });
    }
    const user = result.rows[0];

    // Gera o token da mesma forma que a rota /api/login faria
    const token = jwt.sign(
      { id: user.id, cpf: user.cpf },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({ token, userId: user.id });
  } catch (err) {
    console.error('Erro no dev-login:', err);
    return res.status(500).json({ error: 'Erro interno no servidor (dev-login)' });
  }
});


// -------------------------------------------------------------
// Healthcheck
// -------------------------------------------------------------
app.get('/api/test', (req, res) => {
  res.json({
    status: 'API está funcionando',
    timestamp: new Date(),
    routes: {
      register:   'POST  /api/register',
      login:      'POST  /api/login',
      post:       'POST  /api/requests',
      get:        'GET   /api/requests/current',
      put:        'PUT   /api/requests/current',
      busUpdate:  'POST  /api/buses/update',
      busesNearby:'GET   /api/buses/nearby',
      busHistory: 'GET   /api/buses/:bus_id/history'
    }
  });
});


// -------------------------------------------------------------
// Sobe o servidor (após garantir o schema)
// -------------------------------------------------------------
ensureSchema()
  .then(() => {
    console.log('Schema garantido — iniciando servidor...');
    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
  })
  .catch(err => {
    console.error('Erro garantindo schema:', err);
    process.exit(1);
  });

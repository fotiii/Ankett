const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const PORT = 3000;

const app = express();
app.use(cors({
  origin: `http://localhost:${PORT}`
  }));
app.use(express.json());

const pool = new Pool({
  connectionString: 'postgres://postgres:24683579Mm@localhost:5432/anketa',
});

// Получить все вопросы с вариантами
app.get('/questions', async (req, res) => {
  const { rows: questions } = await pool.query('SELECT * FROM questions ORDER BY id');
  const { rows: options } = await pool.query('SELECT * FROM answer_options');

  const grouped = questions.map(q => ({
    ...q,
    options: options.filter(opt => opt.question_id === q.id)
  }));

  res.json(grouped);
});

// Сохранить анкету
app.post('/submit', async (req, res) => {
  const { name, answers } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const userRes = await client.query(
      'INSERT INTO users(name) VALUES($1) RETURNING id',
      [name]
    );
    const userId = userRes.rows[0].id;

    for (const answer of answers) {
      const { question_id, type, answer_text, answer_option_ids } = answer;

      await client.query(
        'INSERT INTO responses(user_id, question_id, answer_text, answer_option_ids) VALUES($1, $2, $3, $4)',
        [userId, question_id, answer_text || null, answer_option_ids || null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Анкета сохранена' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка при сохранении анкеты' });
  } finally {
    client.release();
  }
});

// Получить все анкеты (история)
app.get('/users', async (req, res) => {
  const result = await pool.query('SELECT * FROM users ORDER BY submitted_at DESC');
  res.json(result.rows);
});

// Получить анкету конкретного пользователя
app.get('/users/:id', async (req, res) => {
  const userId = req.params.id;
  const user = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const answers = await pool.query(
    `SELECT r.*, q.text as question_text 
     FROM responses r
     JOIN questions q ON q.id = r.question_id
     WHERE r.user_id = $1`,
    [userId]
  );
  res.json({ user: user.rows[0], answers: answers.rows });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

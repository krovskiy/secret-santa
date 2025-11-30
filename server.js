require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASS_HASH;
if (!ADMIN_PASSWORD_HASH) {
  console.warn('Warning: ADMIN_PASS_HASH is not set. Admin login will fail unless ADMIN_PASS_HASH is provided in environment or .env file.');
}

const PARTICIPANT_NAMES = ['Britten', 'Manivald', 'Dima', 'Sasha', 'Henrik', 'Andreas'];

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per IP
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const db = new sqlite3.Database('./secret_santa.db', (err) => {
  if (err) console.error(err.message);
  console.log('Connected to SQLite database.');
});

db.serialize(() => {
  db.run("PRAGMA journal_mode = WAL;");
  db.run(`CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    gives_to_id INTEGER,
    hint1 TEXT,
    hint2 TEXT,
    hint3 TEXT,
    FOREIGN KEY (gives_to_id) REFERENCES participants(id)
  )`);
});


function generateCode() {
  return crypto.randomBytes(3).toString('hex');
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  
  if (!password || typeof password !== 'string' || password.length > 100) {
    return res.status(400).json({ error: 'Invalid password format' });
  }
  
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  
  if (hash === ADMIN_PASSWORD_HASH) {
    res.cookie('admin_session', crypto.randomBytes(32).toString('hex'), {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
    secure: (process.env.NODE_ENV === 'production')
    });
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Invalid password' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.json({ success: true });
});

app.get('/api/admin/check-session', (req, res) => {
  const isAuthenticated = !!req.cookies.admin_session;
  res.json({ authenticated: isAuthenticated });
});

app.get('/api/admin/participants', (req, res) => {
  if (!req.cookies.admin_session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  db.all(`SELECT p1.id, p1.name, p1.code, p2.name as gives_to_name, p1.hint1, p1.hint2, p1.hint3
          FROM participants p1 
          LEFT JOIN participants p2 ON p1.gives_to_id = p2.id
          ORDER BY p1.name`, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/admin/regenerate', (req, res) => {
  if (!req.cookies.admin_session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  db.serialize(() => {
    db.run('DELETE FROM participants', (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      const codes = PARTICIPANT_NAMES.map(() => generateCode());
      const insertPromises = PARTICIPANT_NAMES.map((name, index) => {
        return new Promise((resolve, reject) => {
          db.run('INSERT INTO participants (name, code) VALUES (?, ?)', 
            [name, codes[index]], 
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });
      });
      
      Promise.all(insertPromises).then(ids => {
        const shuffledIds = shuffleArray(ids);
        const updatePromises = shuffledIds.map((id, index) => {
          const givesToId = shuffledIds[(index + 1) % shuffledIds.length];
          return new Promise((resolve, reject) => {
            db.run('UPDATE participants SET gives_to_id = ? WHERE id = ?',
              [givesToId, id],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        });
        
        return Promise.all(updatePromises);
      }).then(() => {
        db.all(`SELECT p1.name, p1.code, p2.name as gives_to_name 
                FROM participants p1
                JOIN participants p2 ON p1.gives_to_id = p2.id
                ORDER BY p1.name`, [], (err, rows) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          res.json({ success: true, participants: rows });
        });
      }).catch(err => {
        res.status(500).json({ error: err.message });
      });
    });
  });
});

app.post('/api/verify-code', (req, res) => {
  const { code } = req.body;
  
  if (!code || typeof code !== 'string' || code.length > 50) {
    return res.status(400).json({ error: 'Invalid code format' });
  }
  
  db.get(`SELECT p1.id, p1.name, p1.code, p2.name as gives_to_name, p2.id as gives_to_id
          FROM participants p1
          JOIN participants p2 ON p1.gives_to_id = p2.id
          WHERE p1.code = ?`, [code], (err, giveData) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!giveData) {
      res.json({ success: false, message: 'Invalid code' });
      return;
    }
    db.get(`SELECT p1.name as santa_name, p1.hint1, p1.hint2, p1.hint3, p1.code as santa_code
            FROM participants p1
            JOIN participants p2 ON p1.gives_to_id = p2.id
            WHERE p2.code = ?`, [code], (err, receiveData) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.cookie('user_code', code, { 
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: (process.env.NODE_ENV === 'production'),     
        sameSite: 'strict',    
        path: '/'
      });
      
      res.json({ 
        success: true, 
        giveData: giveData,
        receiveData: receiveData || {}
      });
    });
  });
});

app.get('/api/check-session', (req, res) => {
  const code = req.cookies.user_code;
  if (!code) {
    res.json({ authenticated: false });
    return;
  }
  
  db.get(`SELECT p1.id, p1.name, p1.code, p2.name as gives_to_name, p2.id as gives_to_id
          FROM participants p1
          JOIN participants p2 ON p1.gives_to_id = p2.id
          WHERE p1.code = ?`, [code], (err, giveData) => {
    if (err || !giveData) {
      res.json({ authenticated: false });
      return;
    }
    
    db.get(`SELECT p1.name as santa_name, p1.hint1, p1.hint2, p1.hint3, p1.code as santa_code
            FROM participants p1
            JOIN participants p2 ON p1.gives_to_id = p2.id
            WHERE p2.code = ?`, [code], (err, receiveData) => {
      if (err) {
        res.json({ authenticated: false });
        return;
      }
      
      res.json({ 
        authenticated: true,
        giveData: giveData,
        receiveData: receiveData || {}
      });
    });
  });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('user_code');
  res.json({ success: true });
});

app.post('/api/save-hint', (req, res) => {
  const { code, hintNumber, hintText } = req.body;
  
  if (!code || typeof code !== 'string' || code.length > 50) {
    return res.status(400).json({ error: 'Invalid code format' });
  }
  
  if (!hintText || typeof hintText !== 'string' || hintText.length > 500) {
    return res.status(400).json({ error: 'Hint must be between 1 and 500 characters' });
  }

  
  const allowedHints = ['1', '2', '3']; 
  if (!allowedHints.includes(String(hintNumber))) {
    return res.status(400).json({ error: 'Invalid hint number' });
  }
  const column = `hint${hintNumber}`;

  db.run(`UPDATE participants SET ${column} = ? WHERE code = ?`,
    [hintText, code], (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ success: true, message: `Hint ${hintNumber} saved!` });
    });
});

app.post('/api/get-hints', (req, res) => {
  const { code } = req.body;
  db.get(`SELECT p1.name as santa_name, p1.hint1, p1.hint2, p1.hint3, p1.code as santa_code
          FROM participants p1
          JOIN participants p2 ON p1.gives_to_id = p2.id
          WHERE p2.code = ?`, [code], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.json({ success: false, message: 'Invalid code' });
      return;
    }
    res.json({ success: true, data: row });
  });
});

app.post('/api/reveal-santa', (req, res) => {
  const { code } = req.body;
  db.get(`SELECT p1.name as santa_name, p2.name as recipient_name
          FROM participants p1
          JOIN participants p2 ON p1.gives_to_id = p2.id
          WHERE p1.code = ?`, [code], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.json({ success: false, message: 'Invalid code' });
      return;
    }
    res.json({ 
      success: true, 
      santa: row.santa_name,
      recipient: row.recipient_name
    });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Secret Santa server running on port ${PORT}`);
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error(err.message);
    console.log('Database connection closed.');
    process.exit(0);
  });
});
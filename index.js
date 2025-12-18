const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import database pool
const pool = require('./config/database');

const app = express();
const PORT = process.env.PORT || 4002;
const SERVER_HOST = process.env.SERVER_HOST || '91.108.105.168';

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for remote server
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'team-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      sports: '/api/sports',
      managers: '/api/managers',
      students: '/api/students',
      coaches: '/api/coaches'
    }
  });
});

// Test CORS
app.options('/api/sports', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

// Get all team images
app.get('/api/team-images', (req, res) => {
  try {
    const dataPath = path.join(__dirname, 'data', 'team-images.json');
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error reading team images:', error);
    res.status(500).json({ error: 'Failed to fetch team images' });
  }
});

// Upload team image
app.post('/api/team-images/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { teamName, sport } = req.body;
    
    if (!teamName || !sport) {
      // Delete uploaded file if validation fails
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Team name and sport are required' });
    }

    const imageUrl = `http://${SERVER_HOST}:${PORT}/uploads/${req.file.filename}`;
    
    const newImage = {
      id: Date.now().toString(),
      imageUrl: imageUrl,
      teamName: teamName,
      sport: sport,
      filename: req.file.filename,
    };

    // Save to JSON file
    const dataPath = path.join(__dirname, 'data');
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }

    const filePath = path.join(dataPath, 'team-images.json');
    let images = [];
    
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      images = JSON.parse(data);
    }

    images.push(newImage);
    fs.writeFileSync(filePath, JSON.stringify(images, null, 2));

    res.json({ success: true, image: newImage });
  } catch (error) {
    console.error('Error uploading image:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Update team image
app.put('/api/team-images/:id', upload.single('image'), (req, res) => {
  try {
    const { id } = req.params;
    const { teamName, sport, imageUrl } = req.body;

    const dataPath = path.join(__dirname, 'data', 'team-images.json');
    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ error: 'Team images not found' });
    }

    let images = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const imageIndex = images.findIndex(img => img.id === id);

    if (imageIndex === -1) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // If new file uploaded, delete old file
    if (req.file) {
      const oldImage = images[imageIndex];
      if (oldImage.filename) {
        const oldFilePath = path.join(uploadsDir, oldImage.filename);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
      images[imageIndex].imageUrl = `http://${SERVER_HOST}:${PORT}/uploads/${req.file.filename}`;
      images[imageIndex].filename = req.file.filename;
    } else if (imageUrl) {
      images[imageIndex].imageUrl = imageUrl;
    }

    images[imageIndex].teamName = teamName;
    images[imageIndex].sport = sport;

    fs.writeFileSync(dataPath, JSON.stringify(images, null, 2));
    res.json({ success: true, image: images[imageIndex] });
  } catch (error) {
    console.error('Error updating image:', error);
    res.status(500).json({ error: 'Failed to update image' });
  }
});

// Delete team image
app.delete('/api/team-images/:id', (req, res) => {
  try {
    const { id } = req.params;

    const dataPath = path.join(__dirname, 'data', 'team-images.json');
    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ error: 'Team images not found' });
    }

    let images = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const imageIndex = images.findIndex(img => img.id === id);

    if (imageIndex === -1) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Delete file from filesystem
    const image = images[imageIndex];
    if (image.filename) {
      const filePath = path.join(uploadsDir, image.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    images.splice(imageIndex, 1);
    fs.writeFileSync(dataPath, JSON.stringify(images, null, 2));

    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// ==================== MANAGERS API ENDPOINTS ====================

// Get all managers
app.get('/api/managers', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const managers = await conn.query(
      `SELECT m.id, m.name, m.department, m.sport, m.contact, m.email, m.studentCount, m.teamId, m.createdAt, m.updatedAt,
              t.name as teamName, t.department as teamDepartment
       FROM managers m
       LEFT JOIN teams t ON m.teamId = t.id
       ORDER BY m.createdAt DESC`
    );
    res.json(managers);
  } catch (error) {
    console.error('Error fetching managers:', error);
    res.status(500).json({ error: 'Failed to fetch managers' });
  } finally {
    if (conn) conn.release();
  }
});

// Get manager count
app.get('/api/managers/count', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query('SELECT COUNT(*) as count FROM managers');
    res.json({ count: result[0].count });
  } catch (error) {
    console.error('Error fetching manager count:', error);
    res.status(500).json({ error: 'Failed to fetch manager count' });
  } finally {
    if (conn) conn.release();
  }
});

// Get manager by email (for login/authentication)
app.get('/api/managers/email/:email', async (req, res) => {
  let conn;
  try {
    const { email } = req.params;
    conn = await pool.getConnection();
    const managers = await conn.query(
      `SELECT m.id, m.name, m.department, m.sport, m.contact, m.email, m.studentCount, m.teamId,
              t.name as teamName
       FROM managers m
       LEFT JOIN teams t ON m.teamId = t.id
       WHERE m.email = ?`,
      [email]
    );
    
    if (managers.length === 0) {
      return res.status(404).json({ error: 'Manager not found' });
    }
    
    res.json(managers[0]);
  } catch (error) {
    console.error('Error fetching manager by email:', error);
    res.status(500).json({ error: 'Failed to fetch manager' });
  } finally {
    if (conn) conn.release();
  }
});

// Create new manager
app.post('/api/managers', async (req, res) => {
  let conn;
  try {
    const { name, department, sport, contact, email, studentCount, teamId } = req.body;

    // Validation
    if (!name || !department || !sport || !contact || !email || !studentCount) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate student count is a positive integer
    const count = parseInt(studentCount);
    if (isNaN(count) || count <= 0) {
      return res.status(400).json({ error: 'Student count must be a positive number' });
    }

    conn = await pool.getConnection();
    
    // Check if email already exists
    const existing = await conn.query('SELECT id FROM managers WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Insert new manager
    const result = await conn.query(
      `INSERT INTO managers (name, department, sport, contact, email, studentCount, teamId) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), department.trim(), sport.trim(), contact.trim(), email.trim(), count, teamId || null]
    );

    // Fetch the created manager
    const newManager = await conn.query(
      `SELECT m.id, m.name, m.department, m.sport, m.contact, m.email, m.studentCount, m.teamId, m.createdAt,
              t.name as teamName, t.department as teamDepartment
       FROM managers m
       LEFT JOIN teams t ON m.teamId = t.id
       WHERE m.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, manager: newManager[0] });
  } catch (error) {
    console.error('Error creating manager:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create manager' });
    }
  } finally {
    if (conn) conn.release();
  }
});

// Update manager
app.put('/api/managers/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { name, department, sport, contact, email, studentCount, teamId } = req.body;

    // Validation
    if (!name || !department || !sport || !contact || !email || !studentCount) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate student count
    const count = parseInt(studentCount);
    if (isNaN(count) || count <= 0) {
      return res.status(400).json({ error: 'Student count must be a positive number' });
    }

    conn = await pool.getConnection();
    
    // Check if manager exists
    const existing = await conn.query('SELECT id FROM managers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    // Check if email is already used by another manager
    const emailCheck = await conn.query('SELECT id FROM managers WHERE email = ? AND id != ?', [email, id]);
    if (emailCheck.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Update manager
    await conn.query(
      `UPDATE managers 
       SET name = ?, department = ?, sport = ?, contact = ?, email = ?, studentCount = ?, teamId = ? 
       WHERE id = ?`,
      [name.trim(), department.trim(), sport.trim(), contact.trim(), email.trim(), count, teamId || null, id]
    );

    // Fetch updated manager
    const updated = await conn.query(
      `SELECT m.id, m.name, m.department, m.sport, m.contact, m.email, m.studentCount, m.teamId, m.createdAt, m.updatedAt,
              t.name as teamName, t.department as teamDepartment
       FROM managers m
       LEFT JOIN teams t ON m.teamId = t.id
       WHERE m.id = ?`,
      [id]
    );

    res.json({ success: true, manager: updated[0] });
  } catch (error) {
    console.error('Error updating manager:', error);
    res.status(500).json({ error: 'Failed to update manager' });
  } finally {
    if (conn) conn.release();
  }
});

// Delete manager
app.delete('/api/managers/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    
    // Check if manager exists
    const existing = await conn.query('SELECT id FROM managers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    // Delete manager
    await conn.query('DELETE FROM managers WHERE id = ?', [id]);

    res.json({ success: true, message: 'Manager deleted successfully' });
  } catch (error) {
    console.error('Error deleting manager:', error);
    res.status(500).json({ error: 'Failed to delete manager' });
  } finally {
    if (conn) conn.release();
  }
});

// Manager login/authentication (email as userID, contact as password)
app.post('/api/managers/login', async (req, res) => {
  let conn;
  try {
    const { email, contact } = req.body;

    if (!email || !contact) {
      return res.status(400).json({ error: 'Email and contact are required' });
    }

    conn = await pool.getConnection();
    const managers = await conn.query(
      'SELECT id, name, department, sport, contact, email, studentCount FROM managers WHERE email = ? AND contact = ?',
      [email, contact]
    );

    if (managers.length === 0) {
      return res.status(401).json({ error: 'Invalid email or contact number' });
    }

    res.json({ success: true, manager: managers[0] });
  } catch (error) {
    console.error('Error during manager login:', error);
    res.status(500).json({ error: 'Login failed' });
  } finally {
    if (conn) conn.release();
  }
});

// ==================== SPORTS API ENDPOINTS ====================

// Test endpoint
app.get('/api/sports/test', (req, res) => {
  res.json({ message: 'Sports API is working' });
});

// Get all sports
app.get('/api/sports', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const sports = await conn.query(
      'SELECT id, name, description, createdAt, updatedAt FROM sports ORDER BY name ASC'
    );
    res.json(sports);
  } catch (error) {
    console.error('Error fetching sports:', error);
    res.status(500).json({ error: 'Failed to fetch sports' });
  } finally {
    if (conn) conn.release();
  }
});

// Get sport by ID
app.get('/api/sports/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    const sports = await conn.query(
      'SELECT id, name, description, createdAt, updatedAt FROM sports WHERE id = ?',
      [id]
    );
    
    if (sports.length === 0) {
      return res.status(404).json({ error: 'Sport not found' });
    }
    
    res.json(sports[0]);
  } catch (error) {
    console.error('Error fetching sport:', error);
    res.status(500).json({ error: 'Failed to fetch sport' });
  } finally {
    if (conn) conn.release();
  }
});

// Create new sport
app.post('/api/sports', async (req, res) => {
  let conn;
  try {
    const { name, description } = req.body;

    console.log('Received sport data:', { name, description });

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Sport name is required' });
    }

    try {
      conn = await pool.getConnection();
      console.log('Database connection acquired');
    } catch (connError) {
      console.error('Failed to get database connection:', connError);
      return res.status(500).json({ 
        error: 'Database connection failed',
        details: connError.message || 'Unable to connect to database'
      });
    }
    
    // Check if sport name already exists
    const existing = await conn.query('SELECT id FROM sports WHERE name = ?', [name.trim()]);
    if (existing.length > 0) {
      conn.release();
      return res.status(400).json({ error: 'Sport name already exists' });
    }

    // Insert new sport
    const result = await conn.query(
      `INSERT INTO sports (name, description) VALUES (?, ?)`,
      [name.trim(), description ? description.trim() : null]
    );

    console.log('Sport inserted with ID:', result.insertId);

    // Fetch the created sport
    const newSport = await conn.query(
      'SELECT id, name, description, createdAt FROM sports WHERE id = ?',
      [result.insertId]
    );

    conn.release();
    res.status(201).json({ success: true, sport: newSport[0] });
  } catch (error) {
    console.error('Error creating sport:', error);
    console.error('Error details:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      message: error.message,
      sql: error.sql
    });
    
    if (conn) {
      try {
        conn.release();
      } catch (releaseError) {
        console.error('Error releasing connection:', releaseError);
      }
    }
    
    // Ensure we always send JSON response
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Sport name already exists' });
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(500).json({ error: 'Database connection failed. Please check database configuration.' });
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'Sports table not found. Please restart the server to initialize database tables.' });
    } else {
      return res.status(500).json({ 
        error: 'Failed to create sport',
        details: error.message || 'Unknown database error'
      });
    }
  }
});

// Update sport
app.put('/api/sports/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Sport name is required' });
    }

    conn = await pool.getConnection();
    
    // Check if sport exists
    const existing = await conn.query('SELECT id FROM sports WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Sport not found' });
    }

    // Check if name is already used by another sport
    const nameCheck = await conn.query('SELECT id FROM sports WHERE name = ? AND id != ?', [name.trim(), id]);
    if (nameCheck.length > 0) {
      return res.status(400).json({ error: 'Sport name already exists' });
    }

    // Update sport
    await conn.query(
      `UPDATE sports SET name = ?, description = ? WHERE id = ?`,
      [name.trim(), description ? description.trim() : null, id]
    );

    // Fetch updated sport
    const updated = await conn.query(
      'SELECT id, name, description, createdAt, updatedAt FROM sports WHERE id = ?',
      [id]
    );

    res.json({ success: true, sport: updated[0] });
  } catch (error) {
    console.error('Error updating sport:', error);
    res.status(500).json({ error: 'Failed to update sport' });
  } finally {
    if (conn) conn.release();
  }
});

// Delete sport
app.delete('/api/sports/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    
    // Check if sport exists
    const existing = await conn.query('SELECT id FROM sports WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Sport not found' });
    }

    // Check if sport is used by any managers
    const managersUsingSport = await conn.query('SELECT COUNT(*) as count FROM managers WHERE sport = (SELECT name FROM sports WHERE id = ?)', [id]);
    if (managersUsingSport[0].count > 0) {
      return res.status(400).json({ error: 'Cannot delete sport. It is being used by managers.' });
    }

    // Delete sport
    await conn.query('DELETE FROM sports WHERE id = ?', [id]);

    res.json({ success: true, message: 'Sport deleted successfully' });
  } catch (error) {
    console.error('Error deleting sport:', error);
    res.status(500).json({ error: 'Failed to delete sport' });
  } finally {
    if (conn) conn.release();
  }
});

// ==================== STUDENTS API ENDPOINTS ====================

// Get all students for a manager
app.get('/api/students', async (req, res) => {
  let conn;
  try {
    const { managerId } = req.query;
    conn = await pool.getConnection();
    
    let query = 'SELECT id, name, prn_uid, contact, email, address, birthDate, age, managerId, createdAt, updatedAt FROM students';
    let params = [];
    
    if (managerId) {
      query += ' WHERE managerId = ?';
      params.push(managerId);
    }
    
    query += ' ORDER BY createdAt DESC';
    
    const students = await conn.query(query, params);
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  } finally {
    if (conn) conn.release();
  }
});

// Create new student
app.post('/api/students', async (req, res) => {
  let conn;
  try {
    const { name, prn_uid, contact, email, address, birthDate, managerId } = req.body;

    // Validation
    if (!name || !prn_uid || !contact || !birthDate || !managerId) {
      return res.status(400).json({ error: 'Name, PRN/UID, Contact, Birth Date, and Manager ID are required' });
    }

    // Calculate age from birth date
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    conn = await pool.getConnection();
    
    // Check if PRN/UID already exists
    const existing = await conn.query('SELECT id FROM students WHERE prn_uid = ?', [prn_uid.trim()]);
    if (existing.length > 0) {
      conn.release();
      return res.status(400).json({ error: 'PRN/UID already exists' });
    }

    // Insert new student
    const result = await conn.query(
      `INSERT INTO students (name, prn_uid, contact, email, address, birthDate, age, managerId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        prn_uid.trim(),
        contact.trim(),
        email ? email.trim() : null,
        address ? address.trim() : null,
        birthDate,
        age,
        managerId
      ]
    );

    // Fetch the created student
    const newStudent = await conn.query(
      'SELECT id, name, prn_uid, contact, email, address, birthDate, age, managerId, createdAt FROM students WHERE id = ?',
      [result.insertId]
    );

    conn.release();
    res.status(201).json({ success: true, student: newStudent[0] });
  } catch (error) {
    console.error('Error creating student:', error);
    if (conn) conn.release();
    
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'PRN/UID already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create student', details: error.message });
    }
  }
});

// Update student
app.put('/api/students/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { name, prn_uid, contact, email, address, birthDate } = req.body;

    if (!name || !prn_uid || !contact || !birthDate) {
      return res.status(400).json({ error: 'Name, PRN/UID, Contact, and Birth Date are required' });
    }

    // Calculate age
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    conn = await pool.getConnection();
    
    // Check if student exists
    const existing = await conn.query('SELECT id FROM students WHERE id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check if PRN/UID is used by another student
    const prnCheck = await conn.query('SELECT id FROM students WHERE prn_uid = ? AND id != ?', [prn_uid.trim(), id]);
    if (prnCheck.length > 0) {
      conn.release();
      return res.status(400).json({ error: 'PRN/UID already exists' });
    }

    // Update student
    await conn.query(
      `UPDATE students SET name = ?, prn_uid = ?, contact = ?, email = ?, address = ?, birthDate = ?, age = ? WHERE id = ?`,
      [name.trim(), prn_uid.trim(), contact.trim(), email ? email.trim() : null, address ? address.trim() : null, birthDate, age, id]
    );

    // Fetch updated student
    const updated = await conn.query(
      'SELECT id, name, prn_uid, contact, email, address, birthDate, age, managerId, createdAt, updatedAt FROM students WHERE id = ?',
      [id]
    );

    conn.release();
    res.json({ success: true, student: updated[0] });
  } catch (error) {
    console.error('Error updating student:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// Delete student
app.delete('/api/students/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    
    const existing = await conn.query('SELECT id FROM students WHERE id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Student not found' });
    }

    await conn.query('DELETE FROM students WHERE id = ?', [id]);
    conn.release();
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Error deleting student:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// ==================== COACHES API ENDPOINTS ====================

// Get all coaches for a manager
app.get('/api/coaches', async (req, res) => {
  let conn;
  try {
    const { managerId } = req.query;
    conn = await pool.getConnection();
    
    let query = 'SELECT id, name, contact, email, specialization, managerId, createdAt, updatedAt FROM coaches';
    let params = [];
    
    if (managerId) {
      query += ' WHERE managerId = ?';
      params.push(managerId);
    }
    
    query += ' ORDER BY createdAt DESC';
    
    const coaches = await conn.query(query, params);
    res.json(coaches);
  } catch (error) {
    console.error('Error fetching coaches:', error);
    res.status(500).json({ error: 'Failed to fetch coaches' });
  } finally {
    if (conn) conn.release();
  }
});

// Create new coach
app.post('/api/coaches', async (req, res) => {
  let conn;
  try {
    const { name, contact, email, specialization, managerId } = req.body;

    if (!name || !contact || !managerId) {
      return res.status(400).json({ error: 'Name, Contact, and Manager ID are required' });
    }

    conn = await pool.getConnection();
    
    const result = await conn.query(
      `INSERT INTO coaches (name, contact, email, specialization, managerId) VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), contact.trim(), email ? email.trim() : null, specialization ? specialization.trim() : null, managerId]
    );

    const newCoach = await conn.query(
      'SELECT id, name, contact, email, specialization, managerId, createdAt FROM coaches WHERE id = ?',
      [result.insertId]
    );

    conn.release();
    res.status(201).json({ success: true, coach: newCoach[0] });
  } catch (error) {
    console.error('Error creating coach:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to create coach', details: error.message });
  }
});

// Update coach
app.put('/api/coaches/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { name, contact, email, specialization } = req.body;

    if (!name || !contact) {
      return res.status(400).json({ error: 'Name and Contact are required' });
    }

    conn = await pool.getConnection();
    
    const existing = await conn.query('SELECT id FROM coaches WHERE id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Coach not found' });
    }

    await conn.query(
      `UPDATE coaches SET name = ?, contact = ?, email = ?, specialization = ? WHERE id = ?`,
      [name.trim(), contact.trim(), email ? email.trim() : null, specialization ? specialization.trim() : null, id]
    );

    const updated = await conn.query(
      'SELECT id, name, contact, email, specialization, managerId, createdAt, updatedAt FROM coaches WHERE id = ?',
      [id]
    );

    conn.release();
    res.json({ success: true, coach: updated[0] });
  } catch (error) {
    console.error('Error updating coach:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to update coach' });
  }
});

// Delete coach
app.delete('/api/coaches/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    
    const existing = await conn.query('SELECT id FROM coaches WHERE id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Coach not found' });
    }

    await conn.query('DELETE FROM coaches WHERE id = ?', [id]);
    conn.release();
    res.json({ success: true, message: 'Coach deleted successfully' });
  } catch (error) {
    console.error('Error deleting coach:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to delete coach' });
  }
});

// ==================== STUDENT SELECTIONS API ENDPOINTS ====================

// Get student selections for a manager
app.get('/api/student-selections', async (req, res) => {
  let conn;
  try {
    const { managerId } = req.query;
    
    if (!managerId) {
      return res.status(400).json({ error: 'Manager ID is required' });
    }

    conn = await pool.getConnection();
    
    const selections = await conn.query(
      `SELECT ss.id, ss.studentId, ss.managerId, ss.isSelected, ss.createdAt, ss.updatedAt,
              s.name as studentName, s.prn_uid, s.contact, s.email
       FROM student_selections ss
       JOIN students s ON ss.studentId = s.id
       WHERE ss.managerId = ?
       ORDER BY ss.updatedAt DESC`,
      [managerId]
    );
    
    conn.release();
    res.json(selections);
  } catch (error) {
    console.error('Error fetching student selections:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to fetch student selections' });
  }
});

// Get all students with selection status for a manager
app.get('/api/students-with-selections', async (req, res) => {
  let conn;
  try {
    const { managerId } = req.query;
    
    if (!managerId) {
      return res.status(400).json({ error: 'Manager ID is required' });
    }

    conn = await pool.getConnection();
    
    const students = await conn.query(
      `SELECT s.*, 
              COALESCE(ss.isSelected, FALSE) as isSelected,
              ss.id as selectionId
       FROM students s
       LEFT JOIN student_selections ss ON s.id = ss.studentId AND ss.managerId = ?
       WHERE s.managerId = ?
       ORDER BY s.name ASC`,
      [managerId, managerId]
    );
    
    conn.release();
    res.json(students);
  } catch (error) {
    console.error('Error fetching students with selections:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to fetch students with selections' });
  }
});

// Toggle student selection
app.post('/api/student-selections/toggle', async (req, res) => {
  let conn;
  try {
    const { studentId, managerId, isSelected } = req.body;

    if (!studentId || !managerId || typeof isSelected !== 'boolean') {
      return res.status(400).json({ error: 'Student ID, Manager ID, and isSelected (boolean) are required' });
    }

    conn = await pool.getConnection();
    
    // Check if selection exists
    const existing = await conn.query(
      'SELECT id FROM student_selections WHERE studentId = ? AND managerId = ?',
      [studentId, managerId]
    );

    if (existing.length > 0) {
      // Update existing selection
      await conn.query(
        'UPDATE student_selections SET isSelected = ? WHERE studentId = ? AND managerId = ?',
        [isSelected, studentId, managerId]
      );
    } else {
      // Create new selection
      await conn.query(
        'INSERT INTO student_selections (studentId, managerId, isSelected) VALUES (?, ?, ?)',
        [studentId, managerId, isSelected]
      );
    }

    conn.release();
    res.json({ success: true, message: `Student ${isSelected ? 'selected' : 'deselected'} successfully` });
  } catch (error) {
    console.error('Error toggling student selection:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to toggle student selection' });
  }
});

// ==================== TEAMS API ENDPOINTS ====================

// Test teams endpoint
app.get('/api/teams/test', (req, res) => {
  res.json({ message: 'Teams API is working', timestamp: new Date().toISOString() });
});

// Get all teams
app.get('/api/teams', async (req, res) => {
  let conn;
  try {
    console.log('GET /api/teams - Request received');
    conn = await pool.getConnection();
    console.log('Database connection acquired for teams');
    
    const teams = await conn.query(
      'SELECT id, name, department, logo, color, createdAt, updatedAt FROM teams ORDER BY name ASC'
    );
    
    console.log(`Found ${teams.length} teams`);
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    console.error('Error details:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      message: error.message
    });
    
    // If table doesn't exist, return empty array instead of error
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.warn('Teams table does not exist yet. Returning empty array.');
      return res.json([]);
    }
    
    res.status(500).json({ error: 'Failed to fetch teams', details: error.message });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseError) {
        console.error('Error releasing connection:', releaseError);
      }
    }
  }
});

// Get team by ID
app.get('/api/teams/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    const teams = await conn.query(
      'SELECT id, name, department, logo, color, createdAt, updatedAt FROM teams WHERE id = ?',
      [id]
    );
    
    if (teams.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    res.json(teams[0]);
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  } finally {
    if (conn) conn.release();
  }
});

// Create new team (with logo upload)
const teamLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'team-logo-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for team logos!'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

app.post('/api/teams', teamLogoUpload.single('logo'), async (req, res) => {
  let conn;
  try {
    const { name, department, color } = req.body;

    console.log('Received team data:', { name, department, color, hasFile: !!req.file });

    // Validation
    if (!name || !name.trim()) {
      if (req.file) {
        fs.unlinkSync(req.file.path); // Delete uploaded file if validation fails
      }
      return res.status(400).json({ error: 'Team name is required' });
    }

    if (!department || !department.trim()) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Team department is required' });
    }

    conn = await pool.getConnection();
    
    // Check if team name already exists
    const existing = await conn.query('SELECT id FROM teams WHERE name = ?', [name.trim()]);
    if (existing.length > 0) {
      conn.release();
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Team name already exists' });
    }

    // Generate logo URL if file was uploaded
    let logoUrl = null;
    if (req.file) {
      logoUrl = `http://${SERVER_HOST}:${PORT}/uploads/${req.file.filename}`;
    }

    // Insert new team
    const teamColor = color || '#f58002'; // Default color if not provided
    const result = await conn.query(
      `INSERT INTO teams (name, department, logo, color) VALUES (?, ?, ?, ?)`,
      [name.trim(), department.trim(), logoUrl, teamColor]
    );

    console.log('Team inserted with ID:', result.insertId);

    // Fetch the created team
    const newTeam = await conn.query(
      'SELECT id, name, department, logo, color, createdAt FROM teams WHERE id = ?',
      [result.insertId]
    );

    conn.release();
    res.status(201).json({ success: true, team: newTeam[0] });
  } catch (error) {
    console.error('Error creating team:', error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    if (conn) conn.release();
    
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Team name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create team', details: error.message });
    }
  }
});

// Update team (with optional logo upload)
app.put('/api/teams/:id', teamLogoUpload.single('logo'), async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { name, department, color } = req.body;

    if (!name || !name.trim()) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Team name is required' });
    }

    if (!department || !department.trim()) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Team department is required' });
    }

    conn = await pool.getConnection();
    
    // Check if team exists
    const existing = await conn.query('SELECT id, logo FROM teams WHERE id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check if team name is used by another team
    const nameCheck = await conn.query('SELECT id FROM teams WHERE name = ? AND id != ?', [name.trim(), id]);
    if (nameCheck.length > 0) {
      conn.release();
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Team name already exists' });
    }

    // Delete old logo if new one is uploaded
    let logoUrl = existing[0].logo; // Keep existing logo by default
    if (req.file) {
      // Delete old logo file if it exists
      if (existing[0].logo) {
        const oldLogoPath = existing[0].logo.replace(`http://${SERVER_HOST}:${PORT}/uploads/`, '');
        const oldFilePath = path.join(uploadsDir, oldLogoPath);
        try {
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        } catch (unlinkError) {
          console.error('Error deleting old logo:', unlinkError);
        }
      }
      logoUrl = `http://${SERVER_HOST}:${PORT}/uploads/${req.file.filename}`;
    }

    // Update team
    const teamColor = color || existing[0].color || '#f58002'; // Use existing color or default
    await conn.query(
      `UPDATE teams SET name = ?, department = ?, logo = ?, color = ? WHERE id = ?`,
      [name.trim(), department.trim(), logoUrl, teamColor, id]
    );

    // Fetch updated team
    const updated = await conn.query(
      'SELECT id, name, department, logo, color, createdAt, updatedAt FROM teams WHERE id = ?',
      [id]
    );

    conn.release();
    res.json({ success: true, team: updated[0] });
  } catch (error) {
    console.error('Error updating team:', error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// Delete team
app.delete('/api/teams/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    
    const existing = await conn.query('SELECT id, logo FROM teams WHERE id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Team not found' });
    }

    // Delete logo file if it exists
    if (existing[0].logo) {
      const logoPath = existing[0].logo.replace(`http://${SERVER_HOST}:${PORT}/uploads/`, '');
      const filePath = path.join(uploadsDir, logoPath);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (unlinkError) {
        console.error('Error deleting logo file:', unlinkError);
      }
    }

    await conn.query('DELETE FROM teams WHERE id = ?', [id]);
    conn.release();
    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error deleting team:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// ==================== EVENT IMAGES API ENDPOINTS ====================

// Get all event images
app.get('/api/event-images', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const images = await conn.query(
      'SELECT id, title, description, imageUrl, displayOrder, createdAt, updatedAt FROM event_images ORDER BY displayOrder ASC, createdAt DESC'
    );
    res.json(images);
  } catch (error) {
    console.error('Error fetching event images:', error);
    res.status(500).json({ error: 'Failed to fetch event images' });
  } finally {
    if (conn) conn.release();
  }
});

// Get event image by ID
app.get('/api/event-images/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    const images = await conn.query(
      'SELECT id, title, description, imageUrl, displayOrder, createdAt, updatedAt FROM event_images WHERE id = ?',
      [id]
    );
    
    if (images.length === 0) {
      return res.status(404).json({ error: 'Event image not found' });
    }
    
    res.json(images[0]);
  } catch (error) {
    console.error('Error fetching event image:', error);
    res.status(500).json({ error: 'Failed to fetch event image' });
  } finally {
    if (conn) conn.release();
  }
});

// Create new event image (with file upload)
const eventImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'event-image-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for event images!'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

app.post('/api/event-images', eventImageUpload.single('image'), async (req, res) => {
  let conn;
  try {
    const { title, description, displayOrder } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    conn = await pool.getConnection();
    
    const imageUrl = `http://${SERVER_HOST}:${PORT}/uploads/${req.file.filename}`;
    const order = displayOrder ? parseInt(displayOrder) : 0;

    const result = await conn.query(
      `INSERT INTO event_images (title, description, imageUrl, displayOrder) VALUES (?, ?, ?, ?)`,
      [
        title ? title.trim() : null,
        description ? description.trim() : null,
        imageUrl,
        order
      ]
    );

    const newImage = await conn.query(
      'SELECT id, title, description, imageUrl, displayOrder, createdAt FROM event_images WHERE id = ?',
      [result.insertId]
    );

    conn.release();
    res.status(201).json({ success: true, image: newImage[0] });
  } catch (error) {
    console.error('Error creating event image:', error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to create event image', details: error.message });
  }
});

// Update event image
app.put('/api/event-images/:id', eventImageUpload.single('image'), async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { title, description, displayOrder } = req.body;

    conn = await pool.getConnection();
    
    const existing = await conn.query('SELECT id, imageUrl FROM event_images WHERE id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: 'Event image not found' });
    }

    let imageUrl = existing[0].imageUrl;
    
    // If new image uploaded, delete old one and update URL
    if (req.file) {
      // Delete old image file
      if (existing[0].imageUrl) {
        const oldImagePath = existing[0].imageUrl.replace(`http://${SERVER_HOST}:${PORT}/uploads/`, '');
        const oldFilePath = path.join(uploadsDir, oldImagePath);
        try {
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        } catch (unlinkError) {
          console.error('Error deleting old image:', unlinkError);
        }
      }
      imageUrl = `http://${SERVER_HOST}:${PORT}/uploads/${req.file.filename}`;
    }

    const order = displayOrder ? parseInt(displayOrder) : existing[0].displayOrder || 0;

    await conn.query(
      `UPDATE event_images SET title = ?, description = ?, imageUrl = ?, displayOrder = ? WHERE id = ?`,
      [
        title ? title.trim() : null,
        description ? description.trim() : null,
        imageUrl,
        order,
        id
      ]
    );

    const updated = await conn.query(
      'SELECT id, title, description, imageUrl, displayOrder, createdAt, updatedAt FROM event_images WHERE id = ?',
      [id]
    );

    conn.release();
    res.json({ success: true, image: updated[0] });
  } catch (error) {
    console.error('Error updating event image:', error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to update event image' });
  }
});

// Delete event image
app.delete('/api/event-images/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    
    const existing = await conn.query('SELECT id, imageUrl FROM event_images WHERE id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Event image not found' });
    }

    // Delete image file
    if (existing[0].imageUrl) {
      const imagePath = existing[0].imageUrl.replace(`http://${SERVER_HOST}:${PORT}/uploads/`, '');
      const filePath = path.join(uploadsDir, imagePath);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (unlinkError) {
        console.error('Error deleting image file:', unlinkError);
      }
    }

    await conn.query('DELETE FROM event_images WHERE id = ?', [id]);
    conn.release();
    res.json({ success: true, message: 'Event image deleted successfully' });
  } catch (error) {
    console.error('Error deleting event image:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to delete event image' });
  }
});

// ==================== NOTICES API ENDPOINTS ====================

// Configure multer for notice document (PDF) uploads
const noticeUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const fileExtension = path.extname(file.originalname);
      if (file.fieldname === 'document') {
        cb(null, 'notice-doc-' + uniqueSuffix + fileExtension);
      } else if (file.fieldname === 'scheduleImage') {
        cb(null, 'notice-schedule-' + uniqueSuffix + fileExtension);
      } else {
        cb(new Error('Invalid fieldname for upload'));
      }
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'document') {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed for documents'));
      }
    } else if (file.fieldname === 'scheduleImage') {
      const allowedImageTypes = /jpeg|jpg|png/;
      const extname = allowedImageTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedImageTypes.test(file.mimetype);
      if (mimetype && extname) {
        cb(null, true);
      } else {
        cb(new Error('Only JPG/PNG image files are allowed for schedule images'));
      }
    } else {
      cb(new Error('Invalid fieldname for upload'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for each file
});

// Get all notices
app.get('/api/notices', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const notices = await conn.query(
      'SELECT id, title, description, documentUrl, scheduleImageUrl, noticeDate, createdAt, updatedAt FROM notices ORDER BY noticeDate DESC, createdAt DESC'
    );
    res.json(notices);
  } catch (error) {
    console.error('Error fetching notices:', error);
    res.status(500).json({ error: 'Failed to fetch notices' });
  } finally {
    if (conn) conn.release();
  }
});

// Get notice by ID
app.get('/api/notices/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    const notices = await conn.query(
      'SELECT id, title, description, documentUrl, scheduleImageUrl, noticeDate, createdAt, updatedAt FROM notices WHERE id = ?',
      [id]
    );
    
    if (notices.length === 0) {
      return res.status(404).json({ error: 'Notice not found' });
    }
    
    res.json(notices[0]);
  } catch (error) {
    console.error('Error fetching notice:', error);
    res.status(500).json({ error: 'Failed to fetch notice' });
  } finally {
    if (conn) conn.release();
  }
});

// Create new notice (with PDF document upload)
app.post('/api/notices', noticeUpload.fields([
  { name: 'document', maxCount: 1 },
  { name: 'scheduleImage', maxCount: 1 }
]), async (req, res) => {
  let conn;
  try {
    const { title, description, noticeDate } = req.body;

    if (!title || !title.trim()) {
      // Clean up uploaded files if validation fails
      if (req.files) {
        Object.values(req.files).flat().forEach(file => {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (unlinkError) {
            console.error('Error deleting uploaded file:', unlinkError);
          }
        });
      }
      return res.status(400).json({ error: 'Notice title is required' });
    }

    if (!description || !description.trim()) {
      if (req.files) {
        Object.values(req.files).flat().forEach(file => {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (unlinkError) {
            console.error('Error deleting uploaded file:', unlinkError);
          }
        });
      }
      return res.status(400).json({ error: 'Notice description is required' });
    }

    if (!noticeDate) {
      if (req.files) {
        Object.values(req.files).flat().forEach(file => {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (unlinkError) {
            console.error('Error deleting uploaded file:', unlinkError);
          }
        });
      }
      return res.status(400).json({ error: 'Notice date is required' });
    }

    conn = await pool.getConnection();
    
    // Generate URLs for uploaded files
    let documentUrl = null;
    let scheduleImageUrl = null;
    
    if (req.files) {
      if (req.files.document && req.files.document[0]) {
        documentUrl = `http://${SERVER_HOST}:${PORT}/uploads/${req.files.document[0].filename}`;
      }
      if (req.files.scheduleImage && req.files.scheduleImage[0]) {
        scheduleImageUrl = `http://${SERVER_HOST}:${PORT}/uploads/${req.files.scheduleImage[0].filename}`;
      }
    }

    const result = await conn.query(
      `INSERT INTO notices (title, description, documentUrl, scheduleImageUrl, noticeDate) VALUES (?, ?, ?, ?, ?)`,
      [title.trim(), description.trim(), documentUrl, scheduleImageUrl, noticeDate]
    );

    const newNotice = await conn.query(
      'SELECT id, title, description, documentUrl, scheduleImageUrl, noticeDate, createdAt FROM notices WHERE id = ?',
      [result.insertId]
    );

    conn.release();
    res.status(201).json({ success: true, notice: newNotice[0] });
  } catch (error) {
    console.error('Error creating notice:', error);
    // Clean up uploaded files on error
    if (req.files) {
      Object.values(req.files).flat().forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (unlinkError) {
          console.error('Error deleting uploaded file:', unlinkError);
        }
      });
    }
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to create notice', details: error.message });
  }
});

// Update notice
app.put('/api/notices/:id', noticeUpload.fields([
  { name: 'document', maxCount: 1 },
  { name: 'scheduleImage', maxCount: 1 }
]), async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { title, description, noticeDate } = req.body;

    conn = await pool.getConnection();
    
    const existing = await conn.query('SELECT id, documentUrl, scheduleImageUrl FROM notices WHERE id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      // Clean up uploaded files
      if (req.files) {
        Object.values(req.files).flat().forEach(file => {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (unlinkError) {
            console.error('Error deleting uploaded file:', unlinkError);
          }
        });
      }
      return res.status(404).json({ error: 'Notice not found' });
    }

    let documentUrl = existing[0].documentUrl;
    let scheduleImageUrl = existing[0].scheduleImageUrl;
    
    // Handle new document upload
    if (req.files && req.files.document && req.files.document[0]) {
      // Delete old document if exists
      if (existing[0].documentUrl) {
        const oldDocPath = existing[0].documentUrl.replace(`http://${SERVER_HOST}:${PORT}/uploads/`, '');
        const oldFilePath = path.join(uploadsDir, oldDocPath);
        try {
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        } catch (unlinkError) {
          console.error('Error deleting old document:', unlinkError);
        }
      }
      documentUrl = `http://${SERVER_HOST}:${PORT}/uploads/${req.files.document[0].filename}`;
    }
    
    // Handle new schedule image upload
    if (req.files && req.files.scheduleImage && req.files.scheduleImage[0]) {
      // Delete old schedule image if exists
      if (existing[0].scheduleImageUrl) {
        const oldImagePath = existing[0].scheduleImageUrl.replace(`http://${SERVER_HOST}:${PORT}/uploads/`, '');
        const oldFilePath = path.join(uploadsDir, oldImagePath);
        try {
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        } catch (unlinkError) {
          console.error('Error deleting old schedule image:', unlinkError);
        }
      }
      scheduleImageUrl = `http://${SERVER_HOST}:${PORT}/uploads/${req.files.scheduleImage[0].filename}`;
    }

    await conn.query(
      `UPDATE notices SET title = ?, description = ?, documentUrl = ?, scheduleImageUrl = ?, noticeDate = ? WHERE id = ?`,
      [
        title ? title.trim() : null,
        description ? description.trim() : null,
        documentUrl,
        scheduleImageUrl,
        noticeDate || existing[0].noticeDate,
        id
      ]
    );

    const updated = await conn.query(
      'SELECT id, title, description, documentUrl, scheduleImageUrl, noticeDate, createdAt, updatedAt FROM notices WHERE id = ?',
      [id]
    );

    conn.release();
    res.json({ success: true, notice: updated[0] });
  } catch (error) {
    console.error('Error updating notice:', error);
    // Clean up uploaded files on error
    if (req.files) {
      Object.values(req.files).flat().forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (unlinkError) {
          console.error('Error deleting uploaded file:', unlinkError);
        }
      });
    }
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to update notice' });
  }
});

// Delete notice
app.delete('/api/notices/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    
    const existing = await conn.query('SELECT id, documentUrl, scheduleImageUrl FROM notices WHERE id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Notice not found' });
    }

    // Delete document file if exists
    if (existing[0].documentUrl) {
      const docPath = existing[0].documentUrl.replace(`http://${SERVER_HOST}:${PORT}/uploads/`, '');
      const filePath = path.join(uploadsDir, docPath);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (unlinkError) {
        console.error('Error deleting document file:', unlinkError);
      }
    }
    
    // Delete schedule image file if exists
    if (existing[0].scheduleImageUrl) {
      const imagePath = existing[0].scheduleImageUrl.replace(`http://${SERVER_HOST}:${PORT}/uploads/`, '');
      const filePath = path.join(uploadsDir, imagePath);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (unlinkError) {
        console.error('Error deleting schedule image file:', unlinkError);
      }
    }

    await conn.query('DELETE FROM notices WHERE id = ?', [id]);
    conn.release();
    res.json({ success: true, message: 'Notice deleted successfully' });
  } catch (error) {
    console.error('Error deleting notice:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to delete notice' });
  }
});

// ==================== STUDENT LINKS API ENDPOINTS ====================

const crypto = require('crypto');

// Generate a unique token for student link
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate new student link
app.post('/api/student-links', async (req, res) => {
  let conn;
  try {
    const { managerId } = req.body;

    if (!managerId) {
      return res.status(400).json({ error: 'Manager ID is required' });
    }

    conn = await pool.getConnection();
    
    // Verify manager exists
    const managers = await conn.query('SELECT id FROM managers WHERE id = ?', [managerId]);
    if (managers.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Manager not found' });
    }

    // Generate unique token
    let token;
    let isUnique = false;
    while (!isUnique) {
      token = generateToken();
      const existing = await conn.query('SELECT id FROM student_links WHERE token = ?', [token]);
      if (existing.length === 0) {
        isUnique = true;
      }
    }

    // Create link
    const result = await conn.query(
      'INSERT INTO student_links (managerId, token) VALUES (?, ?)',
      [managerId, token]
    );

    const newLink = await conn.query(
      'SELECT id, managerId, token, isActive, createdAt FROM student_links WHERE id = ?',
      [result.insertId]
    );

    conn.release();
    res.status(201).json({ success: true, link: newLink[0] });
  } catch (error) {
    console.error('Error creating student link:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to create student link', details: error.message });
  }
});

// Get all links for a manager
app.get('/api/student-links', async (req, res) => {
  let conn;
  try {
    const { managerId } = req.query;

    if (!managerId) {
      return res.status(400).json({ error: 'Manager ID is required' });
    }

    conn = await pool.getConnection();
    const links = await conn.query(
      `SELECT sl.id, sl.managerId, sl.token, sl.isActive, sl.createdAt, sl.updatedAt,
              COUNT(s.id) as studentCount
       FROM student_links sl
       LEFT JOIN students s ON s.linkToken = sl.token
       WHERE sl.managerId = ?
       GROUP BY sl.id
       ORDER BY sl.createdAt DESC`,
      [managerId]
    );

    conn.release();
    res.json(links);
  } catch (error) {
    console.error('Error fetching student links:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to fetch student links' });
  }
});

// Get link details by token
app.get('/api/student-links/token/:token', async (req, res) => {
  let conn;
  try {
    const { token } = req.params;

    conn = await pool.getConnection();
    const links = await conn.query(
      `SELECT sl.id, sl.managerId, sl.token, sl.isActive, sl.createdAt,
              m.name as managerName, m.sport, m.department
       FROM student_links sl
       JOIN managers m ON sl.managerId = m.id
       WHERE sl.token = ? AND sl.isActive = TRUE`,
      [token]
    );

    if (links.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Link not found or inactive' });
    }

    conn.release();
    res.json(links[0]);
  } catch (error) {
    console.error('Error fetching link by token:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to fetch link' });
  }
});

// Submit student form via link
app.post('/api/student-links/submit', async (req, res) => {
  let conn;
  try {
    const { token, name, prn_uid, contact, email, address, birthDate } = req.body;

    // Validation
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!prn_uid || !prn_uid.trim()) {
      return res.status(400).json({ error: 'PRN/UID is required' });
    }
    if (!contact || !contact.trim()) {
      return res.status(400).json({ error: 'Contact is required' });
    }
    if (!birthDate) {
      return res.status(400).json({ error: 'Birth date is required' });
    }

    conn = await pool.getConnection();

    // Verify link exists and is active
    const links = await conn.query(
      'SELECT id, managerId FROM student_links WHERE token = ? AND isActive = TRUE',
      [token]
    );

    if (links.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Invalid or inactive link' });
    }

    const link = links[0];

    // Check if PRN already exists
    const existing = await conn.query('SELECT id FROM students WHERE prn_uid = ?', [prn_uid.trim()]);
    if (existing.length > 0) {
      conn.release();
      return res.status(400).json({ error: 'PRN/UID already exists' });
    }

    // Calculate age
    const birthDateObj = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const monthDiff = today.getMonth() - birthDateObj.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
      age--;
    }

    // Create student
    const result = await conn.query(
      `INSERT INTO students (name, prn_uid, contact, email, address, birthDate, age, managerId, linkToken)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        prn_uid.trim(),
        contact.trim(),
        email ? email.trim() : null,
        address ? address.trim() : null,
        birthDate,
        age,
        link.managerId,
        token
      ]
    );

    const newStudent = await conn.query(
      'SELECT id, name, prn_uid, contact, email, address, birthDate, age, managerId, linkToken, createdAt FROM students WHERE id = ?',
      [result.insertId]
    );

    conn.release();
    res.status(201).json({ success: true, student: newStudent[0] });
  } catch (error) {
    console.error('Error submitting student form:', error);
    if (conn) conn.release();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'PRN/UID already exists' });
    }
    res.status(500).json({ error: 'Failed to submit student form', details: error.message });
  }
});

// Get students submitted via a specific link
app.get('/api/student-links/:linkId/students', async (req, res) => {
  let conn;
  try {
    const { linkId } = req.params;

    conn = await pool.getConnection();
    
    // Get the link token
    const links = await conn.query('SELECT token FROM student_links WHERE id = ?', [linkId]);
    if (links.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Link not found' });
    }

    const token = links[0].token;

    // Get students submitted via this link
    const students = await conn.query(
      'SELECT id, name, prn_uid, contact, email, address, birthDate, age, managerId, createdAt FROM students WHERE linkToken = ? ORDER BY createdAt DESC',
      [token]
    );

    conn.release();
    res.json(students);
  } catch (error) {
    console.error('Error fetching students for link:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Deactivate/Activate link
app.put('/api/student-links/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    conn = await pool.getConnection();
    
    await conn.query('UPDATE student_links SET isActive = ? WHERE id = ?', [isActive, id]);

    const updated = await conn.query('SELECT * FROM student_links WHERE id = ?', [id]);

    conn.release();
    res.json({ success: true, link: updated[0] });
  } catch (error) {
    console.error('Error updating link:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to update link' });
  }
});

// Delete link
app.delete('/api/student-links/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;

    conn = await pool.getConnection();
    
    await conn.query('DELETE FROM student_links WHERE id = ?', [id]);

    conn.release();
    res.json({ success: true, message: 'Link deleted successfully' });
  } catch (error) {
    console.error('Error deleting link:', error);
    if (conn) conn.release();
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://${SERVER_HOST}:${PORT}`);
  console.log(`Uploads directory: ${uploadsDir}`);
  console.log('Available API endpoints:');
  console.log('  GET    /api/sports');
  console.log('  POST   /api/sports');
  console.log('  GET    /api/sports/:id');
  console.log('  PUT    /api/sports/:id');
  console.log('  DELETE /api/sports/:id');
  console.log('  GET    /api/teams');
  console.log('  POST   /api/teams');
  console.log('  GET    /api/teams/:id');
  console.log('  PUT    /api/teams/:id');
  console.log('  DELETE /api/teams/:id');
  console.log('  GET    /api/event-images');
  console.log('  POST   /api/event-images');
  console.log('  PUT    /api/event-images/:id');
  console.log('  DELETE /api/event-images/:id');
  console.log('  GET    /api/notices');
  console.log('  POST   /api/notices');
  console.log('  GET    /api/notices/:id');
  console.log('  PUT    /api/notices/:id');
  console.log('  DELETE /api/notices/:id');
  console.log('  POST   /api/student-links');
  console.log('  GET    /api/student-links');
  console.log('  GET    /api/student-links/token/:token');
  console.log('  POST   /api/student-links/submit');
  console.log('  GET    /api/student-links/:linkId/students');
  console.log('  PUT    /api/student-links/:id');
  console.log('  DELETE /api/student-links/:id');
});


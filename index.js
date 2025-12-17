const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import database pool
const pool = require('./config/database');

const app = express();
const PORT = process.env.PORT || 4002

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  res.json({ status: 'ok', message: 'Server is running' });
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

    const imageUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
    
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
      images[imageIndex].imageUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
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
      'SELECT id, name, department, sport, contact, email, studentCount, createdAt, updatedAt FROM managers ORDER BY createdAt DESC'
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
      'SELECT id, name, department, sport, contact, email, studentCount FROM managers WHERE email = ?',
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
    const { name, department, sport, contact, email, studentCount } = req.body;

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
      `INSERT INTO managers (name, department, sport, contact, email, studentCount) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, department, sport, contact, email, count]
    );

    // Fetch the created manager
    const newManager = await conn.query(
      'SELECT id, name, department, sport, contact, email, studentCount, createdAt FROM managers WHERE id = ?',
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
    const { name, department, sport, contact, email, studentCount } = req.body;

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
       SET name = ?, department = ?, sport = ?, contact = ?, email = ?, studentCount = ? 
       WHERE id = ?`,
      [name, department, sport, contact, email, count, id]
    );

    // Fetch updated manager
    const updated = await conn.query(
      'SELECT id, name, department, sport, contact, email, studentCount, createdAt, updatedAt FROM managers WHERE id = ?',
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Uploads directory: ${uploadsDir}`);
});


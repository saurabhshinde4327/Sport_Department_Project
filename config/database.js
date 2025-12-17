const mariadb = require('mariadb');
require('dotenv').config();

// Database configuration
const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Saurabh@86684',
  database: process.env.DB_NAME || 'sports_website',
  connectionLimit: 5,
  acquireTimeout: 30000,
});

// Test database connection
pool.getConnection()
  .then(conn => {
    console.log('Connected to MariaDB database');
    conn.release();
  })
  .catch(err => {
    console.error('Database connection error:', err);
  });

// Initialize database tables
const initializeDatabase = async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Create managers table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS managers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        department VARCHAR(255) NOT NULL,
        sport VARCHAR(255) NOT NULL,
        contact VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        studentCount INT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_sport (sport)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    if (conn) conn.release();
  }
};

// Initialize on startup
initializeDatabase();

module.exports = pool;


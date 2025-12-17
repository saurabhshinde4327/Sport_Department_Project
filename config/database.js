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
    
    // Create sports table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Create students table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        prn_uid VARCHAR(255) NOT NULL UNIQUE,
        contact VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        address TEXT,
        birthDate DATE NOT NULL,
        age INT,
        managerId INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_prn_uid (prn_uid),
        INDEX idx_manager (managerId),
        FOREIGN KEY (managerId) REFERENCES managers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Create coaches table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS coaches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        specialization VARCHAR(255),
        managerId INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_manager (managerId),
        FOREIGN KEY (managerId) REFERENCES managers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Create student_selections table (for team activities)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS student_selections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        studentId INT NOT NULL,
        managerId INT NOT NULL,
        isSelected BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_student_manager (studentId, managerId),
        INDEX idx_student (studentId),
        INDEX idx_manager (managerId),
        FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (managerId) REFERENCES managers(id) ON DELETE CASCADE
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


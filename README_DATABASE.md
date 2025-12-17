# Database Setup Instructions

## MariaDB Installation and Setup

1. **Install MariaDB** (if not already installed):
   - Windows: Download from https://mariadb.org/download/
   - Or use XAMPP/WAMP which includes MariaDB

2. **Create Database**:
   ```sql
   CREATE DATABASE sports_website;
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the `server` directory:
   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password_here
   DB_NAME=sports_website
   PORT=5000
   ```

4. **Start the Server**:
   ```bash
   npm start
   ```

The database tables will be created automatically on first run.

## Manager Table Structure

- **id**: Auto-increment primary key
- **name**: Manager name
- **department**: Department name
- **sport**: Sport type
- **contact**: Contact number (used as password)
- **email**: Email address (used as userID, unique)
- **studentCount**: Number of students
- **createdAt**: Timestamp
- **updatedAt**: Timestamp

## API Endpoints

- `GET /api/managers` - Get all managers
- `GET /api/managers/count` - Get manager count
- `GET /api/managers/email/:email` - Get manager by email
- `POST /api/managers` - Create new manager
- `PUT /api/managers/:id` - Update manager
- `DELETE /api/managers/:id` - Delete manager
- `POST /api/managers/login` - Manager login (email + contact)


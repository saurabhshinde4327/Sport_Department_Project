# Backend Server for Sports Website

## Setup Instructions

1. **Install Dependencies**
   ```bash
   cd server
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```
   
   The server will run on `http://localhost:5000`

## API Endpoints

### Health Check
- `GET /api/health` - Check if server is running

### Team Images
- `GET /api/team-images` - Get all team images
- `POST /api/team-images/upload` - Upload a new team image (multipart/form-data)
  - Body: `image` (file), `teamName` (string), `sport` (string)
- `PUT /api/team-images/:id` - Update a team image
  - Body: `image` (file, optional), `teamName` (string), `sport` (string), `imageUrl` (string, optional)
- `DELETE /api/team-images/:id` - Delete a team image

## File Storage

- Uploaded images are stored in `server/uploads/`
- Image metadata is stored in `server/data/team-images.json`
- Images are served at `http://localhost:5000/uploads/{filename}`

## Notes

- Maximum file size: 5MB
- Allowed image types: JPEG, JPG, PNG, GIF, WEBP
- The server automatically creates necessary directories on startup


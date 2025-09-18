# Knowledge Hub with Gemini AI

A collaborative knowledge management platform with AI-powered search and Q&A capabilities, built with MERN stack and Google's Gemini AI.

## 🌟 Features

- 📝 Create and edit documents with rich text
- 🔍 Semantic search across all documents
- 🤖 AI-powered Q&A with Gemini
- 👥 Team collaboration
- 📊 Document versioning
- 📱 Responsive design

## 🚀 Prerequisites

- Node.js (v16 or higher)
- npm (v8 or higher) or yarn
- MongoDB (local or MongoDB Atlas)
- Google Gemini API key

## 🛠️ Setup Instructions

### 1. Clone Repositories

```bash
# Clone both repositories
git clone [https://github.com/vigneshgithub-coder/Knowledge-Hub_server.git](https://github.com/vigneshgithub-coder/Knowledge-Hub_server.git)
git clone [https://github.com/vigneshgithub-coder/Knowledge-Hub_client.git](https://github.com/vigneshgithub-coder/Knowledge-Hub_client.git)


#Backend setup
cd Knowledge-Hub_server

# Install dependencies
npm install

# Create environment file
cp .env.example .env

#frontend setup
cd ../Knowledge-Hub_client

# Install dependencies
npm install

#backend run
cd ../Knowledge-Hub_server
npm run dev

#frontend run
cd ../Knowledge-Hub_client
npm start



#.env file 
# MongoDB Connection String
MONGODB_URI=mongodb+srv://travel-agency:Vignesh%4022@cluster0.ialfq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0


# JWT secret for signing tokens
JWT_SECRET=e2d2733c99e25fce490a11979fd95d47fec4f93f05ed60998a73b9ad98434842853a8fcc3bf2fe17a033f3e80c58c07fdc6b9e2ea301c66809efaac3035c37da

# Google Gemini API key
GEMINI_API_KEY=AIzaSyD32qyfXY71_VdvwpTVbI7OZATohspsm-o

# Server port
PORT=5000

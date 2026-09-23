# Scribble – Multiplayer Drawing and Guessing Game

Scribble is a real-time multiplayer drawing and guessing game inspired by skribbl.io.

Players can create or join a room, take turns drawing a selected word, and guess the word drawn by another player. The game uses WebSockets to synchronize drawing, guesses, chat, scores, rounds, and game state between players in real time.

---

## Live Demo

**Live Application:**  
https://scribble-multiplayer-game.onrender.com

**Backend Server:**  
https://scribble-server-gfv5.onrender.com

---

## GitHub Repository

https://github.com/triptish10/scribble-multiplayer-game

---

## Features

- Multiplayer room creation and joining
- Turn-based drawing gameplay
- Real-time drawing synchronization
- Word selection for the drawer
- Guessing system
- Correct guess detection
- Server-side scoring
- Leaderboard
- Round rotation
- Real-time chat
- Drawing colors
- Brush size control
- Undo last stroke
- Clear canvas
- Game Over screen
- Play Again functionality
- Responsive gaming interface

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- HTML5 Canvas
- CSS

### Backend

- Node.js
- Express.js
- Socket.IO

### Real-Time Communication

- Socket.IO
- WebSocket-based communication

### Deployment

- Render

---

# Architecture Overview

The application follows a client-server architecture.

The React frontend provides the user interface, drawing canvas, room screens, chat, guessing interface, scores, and game screens.

The Node.js backend manages rooms, players, game state, turns, words, guesses, scoring, and real-time communication using Socket.IO.

### Architecture Flow

```text
                    Player Browser
                         |
                         |
                  React + TypeScript
                         |
                         |
                    Socket.IO
                         |
                         v
              Node.js + Express Server
                         |
              -------------------------
              |           |           |
            Rooms       Game        Players
                        State
              |           |           |
              -------------------------
                         |
                         v
                 Socket.IO Broadcast
                         |
             -------------------------
             |                       |
         Player 1                 Player 2
```

---

# How the Game Works

The main game flow is:

```text
Create Room
     |
     v
Join Room
     |
     v
Lobby
     |
     v
Start Game
     |
     v
Select Drawer
     |
     v
Drawer Selects Word
     |
     v
Drawer Draws
     |
     v
Other Players Guess
     |
     v
Correct Guess
     |
     v
Score Updated
     |
     v
Next Round
     |
     v
Leaderboard
     |
     v
Game Over
```

---

# Real-Time Drawing

The drawing functionality uses the HTML5 Canvas API.

When the drawer starts drawing, the frontend captures the mouse position, drawing color, and brush size.

The drawing information is sent to the backend through Socket.IO events.

The backend receives the drawing data and broadcasts it to other players in the same room.

The other players receive the drawing data and render the stroke on their canvas.

### Drawing Flow

```text
Drawer
   |
   | Mouse / Canvas Input
   v
HTML5 Canvas
   |
   | draw_start
   | draw_move
   | draw_end
   v
Socket.IO Server
   |
   | draw_data
   v
Other Players
   |
   v
Canvas Rendering
```

---

# Game State Management

The backend manages the main game state.

The server keeps track of:

- Rooms
- Players
- Current drawer
- Current round
- Selected word
- Player scores
- Turn rotation
- Correct guesses
- Game completion

The server is responsible for maintaining the game state so that the multiplayer game remains synchronized between clients.

---

# WebSocket Communication

Socket.IO is used for real-time communication between the frontend and backend.

Important events include:

### Room and Lobby

```text
create_room
join_room
player_joined
player_left
start_game
```

### Game State

```text
game_state
round_start
word_chosen
round_end
game_over
```

### Drawing

```text
draw_start
draw_move
draw_end
draw_data
canvas_clear
draw_undo
```

### Guessing and Chat

```text
guess
guess_result
chat
chat_message
```

These events allow the server and connected clients to exchange game information in real time.

---

# Scoring

When a player submits a guess, the guess is sent to the server.

The server checks the submitted guess against the current word.

When the guess is correct, the player receives points and the updated score is reflected in the game state and leaderboard.

---

# Drawing Tools

The game provides basic drawing functionality including:

- Brush / Pen
- Multiple colors
- Brush size
- Undo
- Clear canvas

The clear canvas and undo functionality are controlled by the drawing player.

---

# Chat and Guessing

Players can communicate through the in-game chat.

Guesses are sent to the server using Socket.IO.

The server checks the guess and sends the result back to the connected players.

Correct guesses are reflected in the game and scoring system.

---

# Local Setup

Follow these steps to run the project locally.

## 1. Clone the Repository

```bash
git clone https://github.com/triptish10/scribble-multiplayer-game.git
```

Then enter the project directory:

```bash
cd scribble-multiplayer-game
```

---

## 2. Install Frontend Dependencies

Run:

```bash
npm install
```

---

## 3. Start the Frontend

Run:

```bash
npm run dev
```

The frontend will normally run at:

```text
http://localhost:5173
```

---

# Backend Setup

The backend is located inside the `server` directory.

Open another terminal.

From the project root, run:

```bash
cd server
```

Install backend dependencies:

```bash
npm install
```

Start the backend:

```bash
node server.js
```

The local backend normally runs on:

```text
http://localhost:3000
```

---

# Project Structure

```text
scribble-multiplayer-game/
│
├── public/
│
├── src/
│   ├── components/
│   │   └── DrawingCanvas.tsx
│   │
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   ├── main.tsx
│   └── socket.ts
│
├── server/
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
│
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

# Production Deployment

The application is deployed publicly using Render.

### Frontend

https://scribble-multiplayer-game.onrender.com

### Backend

https://scribble-server-gfv5.onrender.com

The frontend connects to the deployed Node.js backend using Socket.IO.

The production application has been tested with multiple players to verify the multiplayer game flow.

---

# How to Play

1. Open the live application.
2. Create a room.
3. Share the room code with another player.
4. Join the room from another browser or device.
5. Start the game.
6. The selected drawer receives word options.
7. The drawer selects a word.
8. The drawer draws on the canvas.
9. Other players try to guess the word.
10. Correct guesses receive points.
11. The game moves to the next turn.
12. The leaderboard is updated.
13. At the end of the game, the Game Over screen displays the final result.
14. Players can use Play Again to continue with the same room.

---

# Code Understanding

The project is designed so that the main game responsibilities are handled between the frontend and backend.

### Frontend Responsibilities

- Rendering the user interface
- Rendering the drawing canvas
- Capturing drawing input
- Sending Socket.IO events
- Displaying players and scores
- Displaying chat and guesses
- Displaying game state

### Backend Responsibilities

- Managing rooms
- Managing players
- Managing game state
- Selecting drawers
- Managing rounds
- Validating guesses
- Calculating scores
- Broadcasting real-time events
- Handling game completion

---

# Deployment Architecture

```text
                   Internet
                      |
                      v
             Render Frontend
                      |
                      |
                  Socket.IO
                      |
                      v
             Render Backend
                      |
                      v
        Node.js + Express + Socket.IO
                      |
                      v
             Game State / Rooms
```

---

# Assignment Requirements Covered

The project implements the main multiplayer drawing and guessing flow described in the technical evaluation task.

### Core Functionality

- Multiplayer rooms
- Turn-based drawing
- Real-time drawing
- Word selection
- Guessing
- Scoring
- Leaderboard
- Game end
- Drawing tools
- Chat
- WebSocket communication

---

# Author

**Tripti Sharma**

B.Tech – Computer Science and Engineering

---

## Project Links

**Live Application:**  
https://scribble-multiplayer-game.onrender.com

**GitHub Repository:**  
https://github.com/triptish10/scribble-multiplayer-game
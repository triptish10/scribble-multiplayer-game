const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const words = require("./data/words.json");
const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;
// ========================================
// ROOM STORAGE
// ========================================
const rooms = {};
// ========================================
// HELPER FUNCTIONS
// ========================================
function generateRoomId() {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let roomId = "";
    for (let i = 0; i < 6; i++) {
        roomId += characters.charAt(
            Math.floor(
                Math.random() * characters.length
            )
        );
    }
    return roomId;
}
function createUniqueRoomId() {
    let roomId = generateRoomId();
    while (rooms[roomId]) {
        roomId = generateRoomId();
    }
    return roomId;
}
function shuffleArray(array) {
    const newArray = [...array];
    for (
        let i = newArray.length - 1;
        i > 0;
        i--
    ) {
        const j = Math.floor(
            Math.random() * (i + 1)
        );
        [newArray[i], newArray[j]] =
            [newArray[j], newArray[i]];
    }
    return newArray;
}
function getRandomWords(count) {
    const shuffled = shuffleArray(words);
    return shuffled
        .slice(0, count)
        .map((item) => item.word);
}
function normalizeWord(word) {
    return word
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}
function getPlayer(room, playerId) {
    return room.players.find(
        (player) =>
            player.id === playerId
    );
}
// ========================================
// GAME ENGINE
// ========================================
function startRound(roomId) {
    const room = rooms[roomId];
    if (!room) {
        return;
    }
    // Check whether all rounds are finished
    if (
        room.gameState.round >
        room.settings.rounds
    ) {
        endGame(roomId);
        return;
    }
    // Clear previous timer
    if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
    }
    // Make sure we have players
    if (room.players.length < 2) {
        return;
    }
    // Determine drawer
    const drawerIndex =
        (room.gameState.round - 1) %
        room.players.length;
    const drawer =
        room.players[drawerIndex];
    // Reset round state
    room.gameState.phase =
        "word_selection";
    room.gameState.drawerId =
        drawer.id;
    room.gameState.word =
        null;
    room.gameState.wordOptions =
        getRandomWords(
            room.settings.wordCount
        );
    room.gameState.guessedPlayers =
        [];
    room.gameState.roundStartedAt =
        null;
    console.log(
        `Round ${room.gameState.round} started in room ${roomId}`
    );
    console.log(
        `Drawer: ${drawer.name}`
    );
    // Send common round information
    io.to(roomId).emit(
        "round_start",
        {
            round:
                room.gameState.round,
            totalRounds:
                room.settings.rounds,
            drawerId:
                drawer.id,
            drawerName:
                drawer.name,
            drawTime:
                room.settings.drawTime
        }
    );
    // Send word choices ONLY to drawer
    io.to(drawer.id).emit(
        "word_options",
        {
            words:
                room.gameState.wordOptions
        }
    );
}
// ========================================
// WORD CHOSEN
// ========================================
function handleWordChosen(
    socket,
    roomId,
    word
) {
    const room = rooms[roomId];
    if (!room) {
        return;
    }
    // Only current drawer can choose
    if (
        room.gameState.drawerId !==
        socket.id
    ) {
        socket.emit(
            "game_error",
            {
                message:
                    "Only the drawer can choose a word."
            }
        );
        return;
    }
    // Must be in word-selection phase
    if (
        room.gameState.phase !==
        "word_selection"
    ) {
        return;
    }
    const normalizedWord =
        normalizeWord(word);
    const validWord =
        room.gameState.wordOptions.some(
            (option) =>
                normalizeWord(option) ===
                normalizedWord
        );
    if (!validWord) {
        socket.emit(
            "game_error",
            {
                message:
                    "Invalid word selection."
            }
        );
        return;
    }
    // Store selected word
    room.gameState.word =
        normalizedWord;
    room.gameState.phase =
        "drawing";
    room.gameState.roundStartedAt =
        Date.now();
    console.log(
        `Word chosen in ${roomId}: ${room.gameState.word}`
    );
    // Tell drawer that selection was accepted
    io.to(socket.id).emit(
        "word_chosen_confirmed",
        {
            word:
                room.gameState.word
        }
    );
    // Tell everyone the round is now active
    io.to(roomId).emit(
        "round_active",
        {
            drawerId:
                room.gameState.drawerId,
            drawerName:
                getPlayer(
                    room,
                    room.gameState.drawerId
                )?.name,
            wordLength:
                room.gameState.word.length,
            drawTime:
                room.settings.drawTime,
            round:
                room.gameState.round,
            totalRounds:
                room.settings.rounds
        }
    );
    // Start server-side round timer
    room.timer = setTimeout(
        () => {
            endRound(
                roomId,
                "time_up"
            );
        },
        room.settings.drawTime * 1000
    );
}
// ========================================
// END ROUND
// ========================================
function endRound(
    roomId,
    reason
) {
    const room = rooms[roomId];
    if (!room) {
        return;
    }
    if (room.timer) {
        clearTimeout(
            room.timer
        );
        room.timer = null;
    }
    // Prevent duplicate round ending
    if (
        room.gameState.phase ===
        "round_end"
    ) {
        return;
    }
    if (
        room.gameState.phase ===
        "game_over"
    ) {
        return;
    }
    room.gameState.phase =
        "round_end";
    const drawer =
        getPlayer(
            room,
            room.gameState.drawerId
        );
    // Drawer gets bonus if someone guessed
    if (
        room.gameState.guessedPlayers.length >
        0 &&
        drawer
    ) {
        drawer.score +=
            room.gameState.guessedPlayers.length *
            50;
    }
    const scores =
        room.players.map(
            (player) => ({
                id:
                    player.id,
                name:
                    player.name,
                score:
                    player.score
            })
        );
    io.to(roomId).emit(
        "round_end",
        {
            word:
                room.gameState.word,
            reason,
            scores,
            nextRound:
                room.gameState.round <
                    room.settings.rounds
                    ? room.gameState.round + 1
                    : null
        }
    );
    console.log(
        `Round ${room.gameState.round} ended in room ${roomId}`
    );
    // Wait 3 seconds before next round
    setTimeout(
        () => {
            if (!rooms[roomId]) {
                return;
            }
            const currentRoom =
                rooms[roomId];
            if (
                currentRoom.gameState.phase !==
                "round_end"
            ) {
                return;
            }
            currentRoom.gameState.round++;
            if (
                currentRoom.gameState.round >
                currentRoom.settings.rounds
            ) {
                endGame(roomId);
            } else {
                startRound(roomId);
            }
        },
        3000
    );
}
// ========================================
// END GAME
// ========================================
function endGame(roomId) {
    const room = rooms[roomId];
    if (!room) {
        return;
    }
    if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
    }
    room.gameState.phase =
        "game_over";
    const leaderboard =
        [...room.players]
            .sort(
                (a, b) =>
                    b.score - a.score
            )
            .map(
                (player, index) => ({
                    rank:
                        index + 1,
                    id:
                        player.id,
                    name:
                        player.name,
                    score:
                        player.score
                })
            );
    const winner =
        leaderboard.length > 0
            ? leaderboard[0]
            : null;
    io.to(roomId).emit(
        "game_over",
        {
            winner,
            leaderboard
        }
    );
    console.log(
        `Game over in room ${roomId}`
    );
}
// ========================================
// GUESS HANDLER
// ========================================
function handleGuess(
    socket,
    roomId,
    text
) {
    const room = rooms[roomId];
    if (!room) {
        return;
    }
    // Game must be active
    if (
        room.gameState.phase !==
        "drawing"
    ) {
        return;
    }
    // Drawer cannot guess
    if (
        socket.id ===
        room.gameState.drawerId
    ) {
        return;
    }
    // Don't allow multiple correct guesses
    if (
        room.gameState.guessedPlayers
            .includes(socket.id)
    ) {
        return;
    }
    if (
        typeof text !== "string"
    ) {
        return;
    }
    const guess =
        normalizeWord(text);
    if (!guess) {
        return;
    }
    // Limit guess length
    if (guess.length > 200) {
        return;
    }
    const player =
        getPlayer(
            room,
            socket.id
        );
    if (!player) {
        return;
    }
    const correct =
        guess ===
        room.gameState.word;
    // ====================================
    // INCORRECT GUESS
    // ====================================
    if (!correct) {
        io.to(roomId).emit(
            "chat_message",
            {
                playerId:
                    socket.id,
                playerName:
                    player.name,
                text
            }
        );
        return;
    }
    // ====================================
    // CORRECT GUESS
    // ====================================
    const elapsed =
        Math.floor(
            (
                Date.now() -
                room.gameState
                    .roundStartedAt
            ) / 1000
        );
    const remaining =
        Math.max(
            room.settings.drawTime -
            elapsed,
            0
        );
    // Faster correct answers
    // receive more points.
    const points =
        100 + remaining;
    player.score +=
        points;
    room.gameState
        .guessedPlayers
        .push(
            socket.id
        );
    // Tell everyone about correct guess
    io.to(roomId).emit(
        "guess_result",
        {
            correct:
                true,
            playerId:
                socket.id,
            playerName:
                player.name,
            points
        }
    );
    // ====================================
    // LIVE CORRECT GUESS
    // ====================================
    io.to(roomId).emit(
        "correct_guess",
        {
            playerId: socket.id,
            playerName: player.name,
            points: points,
            guessedCount:
                room.gameState
                    .guessedPlayers
                    .length,
            totalGuessers:
                room.players.length - 1
        }
    );
    // Correct guess announcement
    io.to(roomId).emit(
        "chat_message",
        {
            playerId:
                socket.id,
            playerName:
                player.name,
            text:
                `${player.name} guessed the word! +${points} points`
        }
    );
    // Send updated scores
    io.to(roomId).emit(
        "players_updated",
        {
            players:
                room.players
        }
    );
    // If everyone except drawer guessed,
    // end the round early
    const guessers =
        room.players.length - 1;
    if (
        room.gameState
            .guessedPlayers
            .length >= guessers
    ) {
        endRound(
            roomId,
            "all_guessed"
        );
    }
}
// ========================================
// HTTP ROUTE
// ========================================
app.get(
    "/",
    (req, res) => {
        res.send(
            "Skribbl Clone Server is running!"
        );
    }
);
// ========================================
// SOCKET.IO
// ========================================
io.on(
    "connection",
    (socket) => {
        console.log(
            "Player connected:",
            socket.id
        );
        // ====================================
        // CREATE ROOM
        // ====================================
        socket.on(
            "create_room",
            (data) => {
                const {
                    hostName,
                    settings = {}
                } = data;
                const roomId =
                    createUniqueRoomId();
                const player = {
                    id:
                        socket.id,
                    name:
                        hostName,
                    score:
                        0,
                    isHost:
                        true
                };
                rooms[roomId] = {
                    id:
                        roomId,
                    hostId:
                        socket.id,
                    settings: {
                        maxPlayers:
                            settings.maxPlayers ||
                            8,
                        rounds:
                            settings.rounds ||
                            3,
                        drawTime:
                            settings.drawTime ||
                            60,
                        wordCount:
                            settings.wordCount ||
                            3
                    },
                    players:
                        [player],
                    gameState: {
                        phase:
                            "lobby",
                        round:
                            0,
                        drawerId:
                            null,
                        word:
                            null,
                        wordOptions:
                            [],
                        guessedPlayers:
                            [],
                        roundStartedAt:
                            null
                    },
                    timer:
                        null
                };
                socket.join(roomId);
                console.log(
                    `Room ${roomId} created by ${hostName}`
                );
                socket.emit(
                    "room_created",
                    {
                        roomId,
                        player,
                        players:
                            rooms[roomId].players,
                        settings:
                            rooms[roomId].settings
                    }
                );
            }
        );
        // ====================================
        // JOIN ROOM
        // ====================================
        socket.on(
            "join_room",
            (data) => {
                const {
                    roomId,
                    playerName
                } = data;
                const normalizedRoomId =
                    roomId
                        .trim()
                        .toUpperCase();
                const room =
                    rooms[normalizedRoomId];
                if (!room) {
                    socket.emit(
                        "room_error",
                        {
                            message:
                                "Room not found. Please check the room code."
                        }
                    );
                    return;
                }
                if (
                    room.players.length >=
                    room.settings.maxPlayers
                ) {
                    socket.emit(
                        "room_error",
                        {
                            message:
                                "This room is full."
                        }
                    );
                    return;
                }
                if (
                    room.gameState.phase !==
                    "lobby"
                ) {
                    socket.emit(
                        "room_error",
                        {
                            message:
                                "The game has already started."
                        }
                    );
                    return;
                }
                const player = {
                    id:
                        socket.id,
                    name:
                        playerName,
                    score:
                        0,
                    isHost:
                        false
                };
                room.players.push(
                    player
                );
                socket.join(
                    normalizedRoomId
                );
                console.log(
                    `${playerName} joined room ${normalizedRoomId}`
                );
                socket.emit(
                    "room_joined",
                    {
                        roomId:
                            normalizedRoomId,
                        player,
                        players:
                            room.players,
                        settings:
                            room.settings
                    }
                );
                socket
                    .to(normalizedRoomId)
                    .emit(
                        "player_joined",
                        {
                            player,
                            players:
                                room.players
                        }
                    );
            }
        );
        // ====================================
        // START GAME
        // ====================================
        socket.on(
            "start_game",
            (data) => {
                const {
                    roomId
                } = data;
                const room =
                    rooms[roomId];
                if (!room) {
                    socket.emit(
                        "room_error",
                        {
                            message:
                                "Room not found."
                        }
                    );
                    return;
                }
                if (
                    socket.id !==
                    room.hostId
                ) {
                    socket.emit(
                        "room_error",
                        {
                            message:
                                "Only the host can start the game."
                        }
                    );
                    return;
                }
                if (
                    room.players.length < 2
                ) {
                    socket.emit(
                        "room_error",
                        {
                            message:
                                "At least 2 players are required."
                        }
                    );
                    return;
                }
                // Reset scores
                room.players.forEach(
                    (player) => {
                        player.score = 0;
                    }
                );
                room.gameState = {
                    phase:
                        "word_selection",
                    round:
                        1,
                    drawerId:
                        null,
                    word:
                        null,
                    wordOptions:
                        [],
                    guessedPlayers:
                        [],
                    roundStartedAt:
                        null
                };
                console.log(
                    `Game started in room ${roomId}`
                );
                // Begin first round
                startRound(roomId);
            }
        );
        // ====================================
        // PLAY AGAIN
        // ====================================
        socket.on("play_again", (data) => {
            const { roomId } = data;
            const room = rooms[roomId];
            if (!room) {
                socket.emit("room_error", {
                    message: "Room not found."
                });
                return;
            }
            // Only host can start another game
            if (socket.id !== room.hostId) {
                socket.emit("game_error", {
                    message: "Only the host can start another game."
                });
                return;
            }
            // Play Again is allowed only after game over
            if (room.gameState.phase !== "game_over") {
                socket.emit("game_error", {
                    message: "The current game is still running."
                });
                return;
            }
            // At least 2 players are required
            if (room.players.length < 2) {
                socket.emit("game_error", {
                    message: "At least 2 players are required."
                });
                return;
            }
            // Reset all player scores
            room.players.forEach((player) => {
                player.score = 0;
            });
            // Reset game state
            room.gameState = {
                phase: "word_selection",
                round: 1,
                drawerId: null,
                word: null,
                wordOptions: [],
                guessedPlayers: [],
                roundStartedAt: null
            };
            // Clear previous game's canvas for everyone
            io.to(roomId).emit("canvas_clear", {
                playerId: "system"
            });
            // Inform everyone
            io.to(roomId).emit("chat_message", {
                playerId: "system",
                playerName: "Game",
                text: "🎮 A new game is starting with the same players!"
            });
            console.log(
                `New game started in room ${roomId}`
            );
            // Start Round 1
            startRound(roomId);
        });
        // ====================================
        // WORD CHOSEN
        // ====================================
        socket.on(
            "word_chosen",
            (data) => {
                const {
                    roomId,
                    word
                } = data;
                handleWordChosen(
                    socket,
                    roomId,
                    word
                );
            }
        );
        // ====================================
        // GUESS EVENT
        // ====================================
        socket.on(
            "guess",
            (data) => {
                const {
                    roomId,
                    text
                } = data;
                handleGuess(
                    socket,
                    roomId,
                    text
                );
            }
        );
        // ====================================
        // CHAT
        // ====================================
        socket.on(
            "chat",
            (data) => {
                const {
                    roomId,
                    text
                } = data;
                const room =
                    rooms[roomId];
                if (!room) {
                    return;
                }
                const player =
                    getPlayer(
                        room,
                        socket.id
                    );
                if (!player) {
                    return;
                }
                if (
                    typeof text !==
                    "string"
                ) {
                    return;
                }
                const message =
                    text.trim();
                if (!message) {
                    return;
                }
                if (
                    message.length > 200
                ) {
                    return;
                }
                // ====================================
                // DURING DRAWING:
                // NON-DRAWER CHAT = GUESS
                // ====================================
                if (
                    room.gameState.phase ===
                    "drawing" &&
                    socket.id !==
                    room.gameState.drawerId
                ) {
                    handleGuess(
                        socket,
                        roomId,
                        message
                    );
                    return;
                }
                // ====================================
                // NORMAL CHAT
                // ====================================
                io.to(roomId).emit(
                    "chat_message",
                    {
                        playerId:
                            socket.id,
                        playerName:
                            player.name,
                        text:
                            message
                    }
                );
            }
        );
        // ====================================
        // DRAWING HELPER
        // ====================================
        function isCurrentDrawer(room) {
            return (
                room &&
                room.gameState.phase ===
                "drawing" &&
                room.gameState.drawerId ===
                socket.id
            );
        }
        // ====================================
        // DRAW START
        // ====================================
        socket.on(
            "draw_start",
            (data) => {
                const {
                    roomId,
                    x,
                    y,
                    color,
                    size
                } = data;
                const room =
                    rooms[roomId];
                if (!room) {
                    return;
                }
                // Only drawer can draw
                if (
                    !isCurrentDrawer(room)
                ) {
                    return;
                }
                // Validate coordinates
                if (
                    typeof x !== "number" ||
                    typeof y !== "number"
                ) {
                    return;
                }
                // Validate color
                const strokeColor =
                    typeof color ===
                        "string"
                        ? color
                        : "#000000";
                // Validate brush size
                const strokeSize =
                    typeof size ===
                        "number"
                        ? Math.max(
                            1,
                            Math.min(
                                size,
                                50
                            )
                        )
                        : 5;
                io.to(roomId).emit(
                    "draw_data",
                    {
                        type:
                            "start",
                        playerId:
                            socket.id,
                        x,
                        y,
                        color:
                            strokeColor,
                        size:
                            strokeSize
                    }
                );
            }
        );
        // ====================================
        // DRAW MOVE
        // ====================================
        socket.on(
            "draw_move",
            (data) => {
                const {
                    roomId,
                    x,
                    y
                } = data;
                const room =
                    rooms[roomId];
                if (!room) {
                    return;
                }
                // Only drawer can draw
                if (
                    !isCurrentDrawer(room)
                ) {
                    return;
                }
                // Validate coordinates
                if (
                    typeof x !== "number" ||
                    typeof y !== "number"
                ) {
                    return;
                }
                io.to(roomId).emit(
                    "draw_data",
                    {
                        type:
                            "move",
                        playerId:
                            socket.id,
                        x,
                        y
                    }
                );
            }
        );
        // ====================================
        // DRAW END
        // ====================================
        socket.on(
            "draw_end",
            (data) => {
                const {
                    roomId
                } = data;
                const room =
                    rooms[roomId];
                if (!room) {
                    return;
                }
                // Only drawer can draw
                if (
                    !isCurrentDrawer(room)
                ) {
                    return;
                }
                io.to(roomId).emit(
                    "draw_data",
                    {
                        type:
                            "end",
                        playerId:
                            socket.id
                    }
                );
            }
        );
        // ====================================
        // UNDO LAST STROKE
        // ====================================
        socket.on(
            "draw_undo",
            (data) => {
                const {
                    roomId
                } = data;
                const room =
                    rooms[roomId];
                if (!room) {
                    return;
                }
                // Only the current drawer can undo
                if (
                    !isCurrentDrawer(room)
                ) {
                    return;
                }
                console.log(
                    `Undo requested in room ${roomId}`
                );
                // Tell every player to remove the
                // most recent stroke from the canvas.
                io.to(roomId).emit(
                    "draw_undo",
                    {
                        playerId:
                            socket.id
                    }
                );
            }
        );
        // ====================================
        // CLEAR CANVAS
        // ====================================
        socket.on(
            "canvas_clear",
            (data) => {
                const {
                    roomId
                } = data;
                const room =
                    rooms[roomId];
                if (!room) {
                    return;
                }
                // Only drawer can clear
                if (
                    !isCurrentDrawer(room)
                ) {
                    return;
                }
                console.log(
                    `Canvas cleared in room ${roomId}`
                );
                io.to(roomId).emit(
                    "canvas_clear",
                    {
                        playerId:
                            socket.id
                    }
                );
            }
        );
        // ====================================
        // DISCONNECT
        // ====================================
        socket.on(
            "disconnect",
            () => {
                console.log(
                    "Player disconnected:",
                    socket.id
                );
                for (
                    const roomId in rooms
                ) {
                    const room =
                        rooms[roomId];
                    const playerIndex =
                        room.players.findIndex(
                            (player) =>
                                player.id ===
                                socket.id
                        );
                    if (
                        playerIndex === -1
                    ) {
                        continue;
                    }
                    const removedPlayer =
                        room.players[
                        playerIndex
                        ];
                    room.players.splice(
                        playerIndex,
                        1
                    );
                    // If drawer disconnects,
                    // end current round
                    if (
                        room.gameState
                            .drawerId ===
                        socket.id
                    ) {
                        if (room.timer) {
                            clearTimeout(
                                room.timer
                            );
                            room.timer = null;
                        }
                        if (
                            room.players.length >=
                            2
                        ) {
                            room.gameState
                                .round++;
                            startRound(
                                roomId
                            );
                        } else {
                            room.gameState
                                .phase =
                                "lobby";
                        }
                    }
                    // Host leaves
                    if (
                        removedPlayer.isHost
                    ) {
                        if (
                            room.players.length >
                            0
                        ) {
                            room.hostId =
                                room.players[0].id;
                            room.players[0]
                                .isHost =
                                true;
                            io.to(roomId).emit(
                                "host_changed",
                                {
                                    hostId:
                                        room.hostId,
                                    players:
                                        room.players
                                }
                            );
                        } else {
                            if (room.timer) {
                                clearTimeout(
                                    room.timer
                                );
                            }
                            delete rooms[
                                roomId
                            ];
                            console.log(
                                `Room ${roomId} deleted`
                            );
                            continue;
                        }
                    }
                    io.to(roomId).emit(
                        "player_left",
                        {
                            playerId:
                                socket.id,
                            players:
                                room.players
                        }
                    );
                    break;
                }
            }
        );
    }
);
// ========================================
// START SERVER
// ========================================
server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Server running on port ${PORT}`
        );
    }
);
import { useEffect, useRef, useState } from "react";

import socket from "./socket";

import DrawingCanvas from "./components/DrawingCanvas";

import "./App.css";

// ========================================

// TYPES

// ========================================

type Player = {

  id: string;

  name: string;

  score: number;

  isHost: boolean;

};

type RoomSettings = {

  maxPlayers: number;

  rounds: number;

  drawTime: number;

  wordCount: number;

};

type RoundInfo = {

  round: number;

  totalRounds: number;

  drawerId: string;

  drawerName: string;

  drawTime: number;

};

type RoundActiveInfo = {

  drawerId: string;

  drawerName: string;

  wordLength: number;

  drawTime: number;

  round: number;

  totalRounds: number;

};

type RoundEndInfo = {

  word: string;

  reason: string;

  scores: {

    id: string;

    name: string;

    score: number;

  }[];

  nextRound: number | null;

};

type GameOverInfo = {

  winner: {

    rank: number;

    id: string;

    name: string;

    score: number;

  } | null;

  leaderboard: {

    rank: number;

    id: string;

    name: string;

    score: number;

  }[];

};

type ChatMessage = {

  playerId: string;

  playerName: string;

  text: string;

};

type GuessResult = {

  correct: boolean;

  playerId: string;

  playerName: string;

  points: number;

};

// ========================================

// APP

// ========================================

function App() {

  // Shared audio context. It is unlocked by a real user click before the game starts.

  const audioContextRef = useRef<AudioContext | null>(null);

  // ========================================

  // GAME AUDIO

  // ========================================

  async function unlockAudio() {

    try {

      const AudioContextConstructor =

        window.AudioContext ||

        (window as typeof window & {

          webkitAudioContext?: typeof AudioContext;

        }).webkitAudioContext;

      if (!AudioContextConstructor) return;

      if (!audioContextRef.current) {

        audioContextRef.current = new AudioContextConstructor();

      }

      if (audioContextRef.current.state === "suspended") {

        await audioContextRef.current.resume();

      }

    } catch (error) {

      console.debug("Audio unlock failed:", error);

    }

  }

  function getAudioContext() {

    const context = audioContextRef.current;

    if (!context || context.state !== "running") return null;

    return context;

  }

  function playTone(

    frequency: number,

    duration: number,

    volume = 0.08,

    type: OscillatorType = "sine",

    delay = 0

  ) {

    try {

      const context = getAudioContext();

      if (!context) return;

      const start = context.currentTime + delay;

      const gain = context.createGain();

      const oscillator = context.createOscillator();

      oscillator.type = type;

      oscillator.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);

      gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);

      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gain);

      gain.connect(context.destination);

      oscillator.start(start);

      oscillator.stop(start + duration);

    } catch (error) {

      console.debug("Game sound error:", error);

    }

  }

  function playCorrectGuessSound() {

    playTone(660, 0.18, 0.15, "sine");

    playTone(880, 0.28, 0.15, "sine", 0.16);

  }

  function playRoundStartSound() {

    playTone(523, 0.20, 0.10, "triangle");

    playTone(659, 0.32, 0.10, "triangle", 0.18);

    playTone(784, 0.38, 0.09, "triangle", 0.34);

  }

  function playRoundEndSound() {

    playTone(523, 0.20, 0.11, "sine");

    playTone(392, 0.34, 0.10, "sine", 0.20);

  }

  function playCountdownSound() {

    playTone(880, 0.10, 0.07, "square");

  }

  // ========================================

  // BASIC STATES

  // ========================================

  const [playerName, setPlayerName] =

    useState("");

  const [roomCode, setRoomCode] =

    useState("");

  const [currentRoom, setCurrentRoom] =

    useState("");

  const [players, setPlayers] =

    useState<Player[]>([]);

  const [settings, setSettings] =

    useState<RoomSettings | null>(null);

  const [error, setError] =

    useState("");

  // ========================================

  // CHAT STATES

  // ========================================

  const [chatMessages, setChatMessages] =

    useState<ChatMessage[]>([]);

  const [chatInput, setChatInput] =

    useState("");

  // ========================================

  // GAME STATES

  // ========================================

  const [gameStarted, setGameStarted] =

    useState(false);

  const [roundInfo, setRoundInfo] =

    useState<RoundInfo | null>(null);

  const [wordOptions, setWordOptions] =

    useState<string[]>([]);

  const [selectedWord, setSelectedWord] =

    useState("");

  const [roundActive, setRoundActive] =

    useState(false);

  const [timeLeft, setTimeLeft] =

    useState(0);

  const [drawerId, setDrawerId] =

    useState("");

  const [drawerName, setDrawerName] =

    useState("");

  // ========================================

  // ROUND END

  // ========================================

  const [roundEnd, setRoundEnd] =

    useState<RoundEndInfo | null>(null);

  // ========================================

  // GAME OVER

  // ========================================

  const [gameOver, setGameOver] =

    useState<GameOverInfo | null>(null);

  const [correctGuessers, setCorrectGuessers] =

    useState<Set<string>>(new Set());

  // ========================================

  // SOCKET EVENTS

  // ========================================

  useEffect(() => {

    // ========================================

    // ROOM CREATED

    // ========================================

    const handleRoomCreated = (

      data: {

        roomId: string;

        players: Player[];

        settings: RoomSettings;

      }

    ) => {

      console.log(

        "Room created:",

        data

      );

      setCurrentRoom(

        data.roomId

      );

      setPlayers(

        data.players

      );

      setSettings(

        data.settings

      );

      setChatMessages([]);

      setError("");

    };

    // ========================================

    // ROOM JOINED

    // ========================================

    const handleRoomJoined = (

      data: {

        roomId: string;

        players: Player[];

        settings: RoomSettings;

      }

    ) => {

      console.log(

        "Room joined:",

        data

      );

      setCurrentRoom(

        data.roomId

      );

      setPlayers(

        data.players

      );

      setSettings(

        data.settings

      );

      setChatMessages([]);

      setError("");

    };

    // ========================================

    // PLAYER JOINED

    // ========================================

    const handlePlayerJoined = (

      data: {

        player: Player;

        players: Player[];

      }

    ) => {

      console.log(

        "Player joined:",

        data.player

      );

      setPlayers(

        data.players

      );

    };

    // ========================================

    // PLAYER LEFT

    // ========================================

    const handlePlayerLeft = (

      data: {

        playerId: string;

        players: Player[];

      }

    ) => {

      console.log(

        "Player left:",

        data.playerId

      );

      setPlayers(

        data.players

      );

    };

    // ========================================

    // HOST CHANGED

    // ========================================

    const handleHostChanged = (

      data: {

        hostId: string;

        players: Player[];

      }

    ) => {

      console.log(

        "Host changed:",

        data.hostId

      );

      setPlayers(

        data.players

      );

    };

    // ========================================

    // ROOM ERROR

    // ========================================

    const handleRoomError = (

      data: {

        message: string;

      }

    ) => {

      console.error(

        "Room error:",

        data.message

      );

      setError(

        data.message

      );

    };

    // ========================================

    // ROUND START

    // ========================================

    const handleRoundStart = (

      data: RoundInfo

    ) => {

      console.log(

        "Round started:",

        data

      );

      setGameStarted(true);

      playRoundStartSound();

      setCorrectGuessers(new Set());

      setRoundInfo(

        data

      );

      setDrawerId(

        data.drawerId

      );

      setDrawerName(

        data.drawerName

      );

      setTimeLeft(

        data.drawTime

      );

      setRoundActive(false);

      setWordOptions([]);

      setSelectedWord("");

      setRoundEnd(null);

      setGameOver(null);

      setError("");

    };

    // ========================================

    // WORD OPTIONS

    // ========================================

    const handleWordOptions = (

      data: {

        words: string[];

      }

    ) => {

      console.log(

        "Word options received:",

        data.words

      );

      setWordOptions(

        data.words

      );

      setCorrectGuessers(new Set());

      setSelectedWord("");

      setRoundActive(false);

    };

    // ========================================

    // WORD CHOSEN CONFIRMED

    // ========================================

    const handleWordChosenConfirmed = (

      data: {

        word: string;

      }

    ) => {

      console.log(

        "Word chosen:",

        data.word

      );

      setSelectedWord(

        data.word

      );

    };

    // ========================================

    // ROUND ACTIVE

    // ========================================

    const handleRoundActive = (

      data: RoundActiveInfo

    ) => {

      console.log(

        "Round active:",

        data

      );

      setRoundActive(true);

      setTimeLeft(

        data.drawTime

      );

      setDrawerId(

        data.drawerId

      );

      setDrawerName(

        data.drawerName

      );

      setRoundInfo({

        round:

          data.round,

        totalRounds:

          data.totalRounds,

        drawerId:

          data.drawerId,

        drawerName:

          data.drawerName,

        drawTime:

          data.drawTime,

      });

      setError("");

    };

    // ========================================

    // ROUND END

    // ========================================

    const handleRoundEnd = (

      data: RoundEndInfo

    ) => {

      console.log(

        "Round ended:",

        data

      );

      setRoundActive(false);

      playRoundEndSound();

      setTimeLeft(0);

      setRoundEnd(

        data

      );

      // Update player scores

      setPlayers(

        (currentPlayers) =>

          currentPlayers.map(

            (player) => {

              const updatedPlayer =

                data.scores.find(

                  (scorePlayer) =>

                    scorePlayer.id ===

                    player.id

                );

              if (!updatedPlayer) {

                return player;

              }

              return {

                ...player,

                score:

                  updatedPlayer.score,

              };

            }

          )

      );

    };

    // ========================================

    // GAME OVER

    // ========================================

    const handleGameOver = (

      data: GameOverInfo

    ) => {

      console.log(

        "Game over:",

        data

      );

      setRoundActive(false);

      setTimeLeft(0);

      setGameOver(

        data

      );

      setCorrectGuessers(new Set());

    };

    // ========================================

    // GAME ERROR

    // ========================================

    const handleGameError = (

      data: {

        message: string;

      }

    ) => {

      console.error(

        "Game error:",

        data.message

      );

      setError(

        data.message

      );

    };

    // ========================================

    // ========================================

    // CORRECT GUESS RESULT

    // ========================================

    const handleGuessResult = (data: GuessResult) => {

      if (!data || !data.correct || !data.playerId) {

        return;

      }

      setCorrectGuessers((previousGuessers) => {

        const nextGuessers = new Set(previousGuessers);

        nextGuessers.add(data.playerId);

        return nextGuessers;

      });

      playCorrectGuessSound();

    };

    // PLAYERS UPDATED

    const handlePlayersUpdated = (data: { players: Player[] }) => {

      setPlayers(data.players);

    };

    // CHAT MESSAGE

    // ========================================

    const handleChatMessage = (

      data: ChatMessage

    ) => {

      console.log(

        "Chat message received:",

        data

      );

      setChatMessages(

        (previousMessages) => [

          ...previousMessages,

          data,

        ]

      );

    };

    // ========================================

    // REGISTER SOCKET EVENTS

    // ========================================

    socket.on(

      "room_created",

      handleRoomCreated

    );

    socket.on(

      "room_joined",

      handleRoomJoined

    );

    socket.on(

      "player_joined",

      handlePlayerJoined

    );

    socket.on(

      "player_left",

      handlePlayerLeft

    );

    socket.on(

      "host_changed",

      handleHostChanged

    );

    socket.on(

      "room_error",

      handleRoomError

    );

    socket.on(

      "round_start",

      handleRoundStart

    );

    socket.on(

      "word_options",

      handleWordOptions

    );

    socket.on(

      "word_chosen_confirmed",

      handleWordChosenConfirmed

    );

    socket.on(

      "round_active",

      handleRoundActive

    );

    socket.on(

      "guess_result",

      handleGuessResult

    );

    socket.on(

      "players_updated",

      handlePlayersUpdated

    );

    socket.on(

      "round_end",

      handleRoundEnd

    );

    socket.on(

      "game_over",

      handleGameOver

    );

    socket.on(

      "game_error",

      handleGameError

    );

    socket.on(

      "chat_message",

      handleChatMessage

    );

    // ========================================

    // CLEANUP

    // ========================================

    return () => {

      socket.off(

        "room_created",

        handleRoomCreated

      );

      socket.off(

        "room_joined",

        handleRoomJoined

      );

      socket.off(

        "player_joined",

        handlePlayerJoined

      );

      socket.off(

        "player_left",

        handlePlayerLeft

      );

      socket.off(

        "host_changed",

        handleHostChanged

      );

      socket.off(

        "room_error",

        handleRoomError

      );

      socket.off(

        "round_start",

        handleRoundStart

      );

      socket.off(

        "word_options",

        handleWordOptions

      );

      socket.off(

        "word_chosen_confirmed",

        handleWordChosenConfirmed

      );

      socket.off(

        "round_active",

        handleRoundActive

      );

      socket.off(

        "guess_result",

        handleGuessResult

      );

      socket.off(

        "players_updated",

        handlePlayersUpdated

      );

      socket.off(

        "round_end",

        handleRoundEnd

      );

      socket.off(

        "game_over",

        handleGameOver

      );

      socket.off(

        "game_error",

        handleGameError

      );

      socket.off(

        "chat_message",

        handleChatMessage

      );

    };

  }, []);

  // ========================================

  // TIMER

  // ========================================

  useEffect(() => {

    if (

      !roundActive ||

      timeLeft <= 0

    ) {

      return;

    }

    const timer =

      window.setInterval(() => {

        setTimeLeft(

          (previousTime) => {

            const nextTime =

              previousTime > 0

                ? previousTime - 1

                : 0;

            if (

              nextTime <= 10 &&

              nextTime > 0

            ) {

              playCountdownSound();

            }

            return nextTime;

          }

        );

      }, 1000);

    return () => {

      window.clearInterval(

        timer

      );

    };

  }, [

    roundActive,

    timeLeft,

  ]);

  // ========================================

  // CREATE ROOM

  // ========================================

  function createRoom() {

    if (!playerName.trim()) {

      setError(

        "Please enter your name."

      );

      return;

    }

    setError("");

    socket.emit(

      "create_room",

      {

        hostName:

          playerName.trim(),

        settings: {

          maxPlayers: 8,

          rounds: 3,

          drawTime: 60,

          wordCount: 3,

        },

      }

    );

  }

  // ========================================

  // JOIN ROOM

  // ========================================

  function joinRoom() {

    if (!playerName.trim()) {

      setError(

        "Please enter your name."

      );

      return;

    }

    if (!roomCode.trim()) {

      setError(

        "Please enter a room code."

      );

      return;

    }

    setError("");

    socket.emit(

      "join_room",

      {

        roomId:

          roomCode

            .trim()

            .toUpperCase(),

        playerName:

          playerName.trim(),

      }

    );

  }

  // ========================================

  // START GAME

  // ========================================

  async function startGame() {

    await unlockAudio();

    if (!currentRoom) {

      setError(

        "Room not found."

      );

      return;

    }

    socket.emit(

      "start_game",

      {

        roomId:

          currentRoom,

      }

    );

  }

  // ========================================

  // ========================================

  // PLAY AGAIN

  // ========================================

  async function playAgain() {

    await unlockAudio();

    if (!currentRoom) return;

    if (!isHost) {

      setError("Only the host can start another game.");

      return;

    }

    setError("");

    setGameOver(null);

    setRoundEnd(null);

    setCorrectGuessers(new Set());

    setRoundActive(false);

    setTimeLeft(0);

    setSelectedWord("");

    setWordOptions([]);

    socket.emit("play_again", { roomId: currentRoom });

  }

  // CHOOSE WORD

  // ========================================

  function chooseWord(

    word: string

  ) {

    if (!currentRoom) {

      return;

    }

    if (!word) {

      return;

    }

    setSelectedWord(

      word

    );

    socket.emit(

      "word_chosen",

      {

        roomId:

          currentRoom,

        word,

      }

    );

  }

  // ========================================

  // SEND CHAT MESSAGE

  // ========================================

  function sendChatMessage() {

    const message =

      chatInput.trim();

    if (!message) {

      return;

    }

    if (!currentRoom) {

      return;

    }

    if (message.length > 200) {

      return;

    }

    socket.emit(

      "chat",

      {

        roomId:

          currentRoom,

        text:

          message,

      }

    );

    setChatInput("");

  }

  // ========================================

  // CHAT ENTER KEY

  // ========================================

  function handleChatKeyDown(

    event: React.KeyboardEvent<HTMLInputElement>

  ) {

    if (

      event.key === "Enter"

    ) {

      sendChatMessage();

    }

  }

  // ========================================

  // CURRENT PLAYER

  // ========================================

  const currentPlayer =

    players.find(

      (player) =>

        player.id ===

        socket.id

    );

  const isHost =

    currentPlayer?.isHost === true;

  const isDrawer =

    socket.id ===

    drawerId;

  // ========================================

  // GAME OVER SCREEN

  // ========================================

  if (

    gameOver &&

    gameStarted

  ) {

    return (

      <div className="app">

        <div className="game-over">

          <div className="game-over-card">

            <h1>

              🏆 Game Over!

            </h1>

            {gameOver.winner && (

              <div className="winner">

                <h2>

                  Winner

                </h2>

                <div className="winner-name">

                  🥇{" "}

                  {gameOver.winner.name}

                </div>

                <div>

                  Score:{" "}

                  <strong>

                    {gameOver.winner.score}

                  </strong>

                </div>

              </div>

            )}

            <h2>

              Final Leaderboard

            </h2>

            <div className="leaderboard">

              {gameOver.leaderboard.map(

                (player) => (

                  <div

                    className="leaderboard-row"

                    key={player.id}

                  >

                    <span>

                      #{player.rank}

                    </span>

                    <strong>

                      {player.name}

                    </strong>

                    <span>

                      {player.score}

                    </span>

                  </div>

                )

              )}

            </div>

            <div className="game-over-actions">

              {isHost ? (

                <>

                  <button

                    className="play-again-button"

                    onClick={playAgain}

                  >

                    🎮 Play Again

                  </button>

                  <p className="game-over-note">

                    Same room • Same players • Fresh scores

                  </p>

                </>

              ) : (

                <p className="game-over-note">

                  ⏳ Waiting for the host to start another game...

                </p>

              )}

            </div>

          </div>

        </div>

      </div>

    );

  }

  // ========================================

  // ACTIVE GAME SCREEN

  // ========================================

  if (gameStarted) {

    return (

      <div className="game-screen">

        {/* ================================= */}

        {/* GAME HEADER */}

        {/* ================================= */}

        <header className="game-header">

          <div>

            <h1>

              🎨 Scribble

            </h1>

            {roundInfo && (

              <p>

                Round{" "}

                {roundInfo.round}

                {" / "}

                {roundInfo.totalRounds}

              </p>

            )}

          </div>

          <div className="timer">

            ⏱️{" "}

            {timeLeft}s

          </div>

        </header>

        {/* ================================= */}

        {/* MAIN GAME AREA */}

        {/* ================================= */}

        <div className="game-layout">

          {/* ================================= */}

          {/* PLAYERS PANEL */}

          {/* ================================= */}

          <aside className="players-panel">

            <h2>

              Players

            </h2>

            <div className="game-players">

              {players.map(

                (player) => (

                  <div

                    className={`game-player ${correctGuessers.has(player.id)

                      ? "guessed-player"

                      : ""

                      }`}

                    key={player.id}

                  >

                    <div>

                      <span>

                        {player.name}

                      </span>

                      {player.id ===

                        socket.id && (

                          <small>

                            {" "}

                            (You)

                          </small>

                        )}

                    </div>

                    <div>

                      <span>

                        {player.score}

                      </span>

                      {correctGuessers.has(player.id) && (

                        <span

                          className="guessed-check"

                          title="Correct guess"

                        >

                          ✓

                        </span>

                      )}

                      {player.id ===

                        drawerId && (

                          <span

                            title="Current drawer"

                          >

                            {" "}

                            🎨

                          </span>

                        )}

                      {player.isHost && (

                        <span

                          title="Host"

                        >

                          {" "}

                          👑

                        </span>

                      )}

                    </div>

                  </div>

                )

              )}

            </div>

          </aside>

          {/* ================================= */}

          {/* DRAWING AREA */}

          {/* ================================= */}

          <main className="drawing-area">

            {/* ================================= */}

            {/* ROUND INFORMATION */}

            {/* ================================= */}

            <div className="drawing-status">

              {/* WORD SELECTION */}

              {!roundActive &&

                !roundEnd &&

                isDrawer &&

                wordOptions.length > 0 && (

                  <div className="word-selection">

                    <h2>

                      Choose a word

                    </h2>

                    <p>

                      Select one word

                      to draw:

                    </p>

                    <div className="word-buttons">

                      {wordOptions.map(

                        (word) => (

                          <button

                            key={word}

                            onClick={() =>

                              chooseWord(

                                word

                              )

                            }

                            disabled={

                              !!selectedWord

                            }

                          >

                            {word}

                          </button>

                        )

                      )}

                    </div>

                  </div>

                )}

              {/* WAITING FOR DRAWER */}

              {!roundActive &&

                !roundEnd &&

                !isDrawer && (

                  <div>

                    <h2>

                      🎨{" "}

                      {drawerName}

                      {" "}

                      is choosing

                      a word...

                    </h2>

                    <p>

                      Get ready!

                    </p>

                  </div>

                )}

              {/* ACTIVE ROUND */}

              {roundActive && (

                <div>

                  {isDrawer ? (

                    <>

                      <h2>

                        🎨 You are

                        drawing!

                      </h2>

                      {selectedWord && (

                        <p>

                          Your word:{" "}

                          <strong>

                            {selectedWord}

                          </strong>

                        </p>

                      )}

                    </>

                  ) : (

                    <>

                      <h2>

                        🎨{" "}

                        {drawerName}

                        {" "}

                        is drawing...

                      </h2>

                      <p>

                        {correctGuessers.size > 0

                          ? `✓ ${correctGuessers.size} player${correctGuessers.size > 1 ? "s" : ""

                          } guessed correctly!`

                          : "Guess the word!"}

                      </p>

                    </>

                  )}

                </div>

              )}

              {/* ROUND END */}

              {roundEnd && (

                <div className="round-end">

                  <h2>

                    ⏰ Round Over!

                  </h2>

                  <p>

                    The word was:{" "}

                    <strong>

                      {roundEnd.word}

                    </strong>

                  </p>

                  <p>

                    Next round coming...

                  </p>

                </div>

              )}

            </div>

            {/* ================================= */}

            {/* CANVAS */}

            {/* ================================= */}

            <div className="canvas-area">

              {roundActive ? (

                <DrawingCanvas

                  disabled={!isDrawer}

                  roomId={currentRoom}

                />

              ) : (

                <div className="canvas-placeholder">

                  <div className="canvas-icon">

                    🎨

                  </div>

                  <p>

                    Waiting for the round

                    to begin...

                  </p>

                </div>

              )}

            </div>

          </main>

          {/* ================================= */}

          {/* CHAT PANEL */}

          {/* ================================= */}

          <aside className="chat-panel">

            <h2>

              💬 Chat

            </h2>

            {/* ================================= */}

            {/* CHAT MESSAGES */}

            {/* ================================= */}

            <div className="chat-messages">

              {chatMessages.length === 0 ? (

                <p className="chat-empty">

                  No messages yet.

                </p>

              ) : (

                chatMessages.map(

                  (message, index) => (

                    <div

                      className={`chat-message ${correctGuessers.has(message.playerId) &&

                        message.text.includes("guessed the word")

                        ? "correct-guess-message"

                        : ""

                        }`}

                      key={`${message.playerId}-${index}`}

                    >

                      <strong>

                        {message.playerName}

                      </strong>

                      <span>

                        {message.text}

                      </span>

                    </div>

                  )

                )

              )}

            </div>

            {/* ================================= */}

            {/* CHAT INPUT */}

            {/* ================================= */}

            <div className="chat-input-area">

              <input

                type="text"

                placeholder="Type a message..."

                value={chatInput}

                onChange={(event) =>

                  setChatInput(

                    event.target.value

                  )

                }

                onKeyDown={

                  handleChatKeyDown

                }

                maxLength={200}

              />

              <button

                type="button"

                onClick={

                  sendChatMessage

                }

                disabled={

                  !chatInput.trim()

                }

              >

                Send

              </button>

            </div>

          </aside>

        </div>

      </div>

    );

  }

  // ========================================

  // LOBBY

  // ========================================

  if (currentRoom) {

    return (

      <div className="app">

        <div className="lobby">

          <h1>

            🎨 Game Lobby

          </h1>

          {/* ================================= */}

          {/* ROOM CODE */}

          {/* ================================= */}

          <div className="room-code">

            <span>

              Room Code

            </span>

            <strong>

              {currentRoom}

            </strong>

            <p>

              Share this code

              with your friends

            </p>

          </div>

          {/* ================================= */}

          {/* PLAYERS */}

          {/* ================================= */}

          <div className="players-section">

            <h2>

              Players (

              {players.length}

              {settings

                ? `/${settings.maxPlayers}`

                : ""}

              )

            </h2>

            <div className="players-list">

              {players.map(

                (player) => (

                  <div

                    className="player-card"

                    key={player.id}

                  >

                    <span className="player-avatar">

                      👤

                    </span>

                    <span>

                      {player.name}

                    </span>

                    {player.id ===

                      socket.id && (

                        <span>

                          {" "}

                          (You)

                        </span>

                      )}

                    {player.isHost && (

                      <span className="host-badge">

                        HOST

                      </span>

                    )}

                  </div>

                )

              )}

            </div>

          </div>

          {/* ================================= */}

          {/* START BUTTON */}

          {/* ================================= */}

          {isHost && (

            <button

              className="primary-button"

              onClick={startGame}

              disabled={

                players.length < 2

              }

            >

              {players.length < 2

                ? "Waiting for player..."

                : "Start Game"}

            </button>

          )}

          {!isHost && (

            <p className="waiting-message">

              Waiting for the host

              to start the game...

            </p>

  )}

          {/* ================================= */}

          {/* ERROR */}

          {/* ================================= */}

          {error && (

            <div className="error">

              {error}

            </div>

          )}

        </div>

      </div>

    );

  }

  // ========================================

  // HOME SCREEN

  // ========================================

  return (

    <div className="app home-page">

      <div className="home-background-shape shape-one" />

      <div className="home-background-shape shape-two" />

      <div className="home-background-shape shape-three" />

      <div className="home-card">

        <div className="home-left">

          <div className="brand-mark">🎨</div>

          <div className="brand-kicker">REAL-TIME • MULTIPLAYER • DRAWING GAME</div>

          <h1>

            Scribble

          </h1>

          <p className="subtitle">

            Draw fast. Guess smart. Top the leaderboard.

          </p>

          <div className="feature-pills">

            <span>✏️ Draw</span>

            <span>💬 Guess</span>

            <span>🏆 Score</span>

          </div>

          <div className="home-tip">

            <span className="tip-icon">✨</span>

            <div>

              <strong>Ready when you are.</strong>

              <p>Create a room with friends or join one with a code.</p>

            </div>

          </div>

        </div>

        <div className="home-right">

          <div className="welcome-text">

            <h2>Let’s play!</h2>

            <p>Choose how you want to enter the game.</p>

          </div>

          <div className="form">

            <div className="input-group">

              <label htmlFor="player-name">Your nickname</label>

              <div className="input-shell">

                <span className="input-icon">👤</span>

                <input

                  id="player-name"

                  type="text"

                  placeholder="Enter your name"

                  value={playerName}

                  onChange={(event) =>

                    setPlayerName(event.target.value)

                  }

                  maxLength={20}

                />

              </div>

            </div>

            <button

              className="primary-button home-action-button"

              onClick={createRoom}

            >

              <span>🎮</span>

              Create a Game

              <span className="button-arrow">→</span>

            </button>

            <div className="divider">

              <span>OR JOIN WITH A CODE</span>

            </div>

            <div className="input-group">

              <label htmlFor="room-code">Room code</label>

              <div className="input-shell room-code-shell">

                <span className="input-icon">🔑</span>

                <input

                  id="room-code"

                  type="text"

                  placeholder="Enter 6-digit code"

                  value={roomCode}

                  onChange={(event) =>

                    setRoomCode(event.target.value.toUpperCase())

                  }

                  maxLength={6}

                />

              </div>

            </div>

            <button

              className="secondary-button home-action-button join-button"

              onClick={joinRoom}

            >

              <span>🚀</span>

              Join a Game

              <span className="button-arrow">→</span>

            </button>

          </div>

          {error && <div className="error">⚠️ {error}</div>}

        </div>

      </div>

      <div className="home-footer">

        <span>🎨 No downloads</span>

        <span>•</span>

        <span>⚡ Real-time multiplayer</span>

        <span>•</span>

        <span>👥 Play with friends</span>

      </div>

    </div>

  );

}

export default App;

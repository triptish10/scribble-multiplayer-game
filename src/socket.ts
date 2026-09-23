import { io } from "socket.io-client";

const socket = io("https://scribble-server-gfv5.onrender.com", {
  autoConnect: true,
});

export default socket;
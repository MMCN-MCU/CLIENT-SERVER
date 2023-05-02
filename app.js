const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();

const httpServer = http.createServer(app);
const wsServer = socketIO(httpServer, {
  cors: {
    origin: "*",
  },
});

const handleListen = () => {
  console.log("Listening on http://localhost:3000");
};

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

wsServer.on("connection", (socket) => {
  socket.on("join", (data) => {
    console.log(data);
  });
  socket.on("build", (roomName) => {
    console.log(roomName);
  });
});

httpServer.listen(3000, handleListen);

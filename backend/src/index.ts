import express from "express";
import http from "http";
import { SignalingServer } from './managers/signalingServer';

const app = express();
const server = http.createServer(app);

const signalingServer = SignalingServer.getInstance(server);

app.get("/health", (req, res) => {
  res.json({
    message: "Server is healthy"
  })
});

server.listen(3000, () => {
  console.log("Server is listening on 3000...");
});

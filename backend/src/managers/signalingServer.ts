import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { signalMessageType } from "../utils/types";
import { RoomManager } from "./RoomManager";

export class SignalingServer {
  private static instance: SignalingServer | null = null;
  private wss: WebSocketServer;
  private roomManager: RoomManager;

  private constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server });
    this.setUpWebSocket();
    this.roomManager = new RoomManager();
  }

  public static getInstance(server: http.Server): SignalingServer {
    if (!this.instance) {
      this.instance = new SignalingServer(server);
    }
    return this.instance;
  }

  private setUpWebSocket() {
    this.wss.on("connection", (ws: WebSocket) => {
      console.log("New Client connected");

      ws.on("error", console.error);
      ws.on("message", (data: string) =>
        this.handleMessage(ws, data.toString())
      );
      ws.on("close", () => this.roomManager.handleDisconnect(ws));
    });
  }

  private handleMessage(ws: WebSocket, data: string) {
    try {
      const message: signalMessageType = JSON.parse(data);
      console.log(message);

      switch (message.type) {
        case "match_request":
          this.roomManager.handleMatchRequest(ws);
          break;

        case "offer":
        case "answer":
        case "candidate":
          this.roomManager.forwardMessage(ws, message);
          break;
        case "skip_peer":
          this.roomManager.handleSkip(ws, message);
          break;
        default:
          console.log("Unkonwn message received");
      }
    } catch (error) {
      console.error(`Websocket error ${error}`);
    }
  }
}

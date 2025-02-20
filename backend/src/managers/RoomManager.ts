import { WebSocket } from "ws";
import { roomType, signalMessageType } from "../utils/types";
import { v4 as uuidv4 } from "uuid";

export class RoomManager {
  private rooms: Map<string, roomType> = new Map();
  private waitingQueue: Set<WebSocket>;

  constructor() {
    this.waitingQueue = new Set();
  }

  handleMatchRequest(ws: WebSocket) {
    this.waitingQueue.delete(ws); // Ensures the user is not already in queue
    const peer = this.waitingQueue.values().next().value; // Getting the next available user

    if (peer && peer != ws) {
      // Ensures no self matching
      this.waitingQueue.delete(peer);
      const roomId: string = uuidv4();
      this.rooms.set(roomId, { user1: ws, user2: peer });

      if (
        ws.readyState === WebSocket.OPEN &&
        peer.readyState === WebSocket.OPEN
      ) {
        ws.send(JSON.stringify({ type: "matched", roomId }));
        peer.send(JSON.stringify({ type: "matched", roomId }));
      }
    } else {
      this.waitingQueue.add(ws);
    }
  }

  forwardMessage(ws: WebSocket, message: signalMessageType) {
    const roomId = message.roomId;
    if (!roomId || !this.rooms.has(roomId)) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const peer = room.user1 === ws ? room.user2 : room.user1;
    if (peer && peer.readyState === WebSocket.OPEN) {
      peer.send(JSON.stringify(message));
    }
  }

  handleDisconnect(ws: WebSocket) {
    this.waitingQueue.delete(ws);
    console.log("Client disconnected")
    for(const [roomId, room] of this.rooms.entries()){
        if(room.user1 === ws || room.user2 === ws){
            const peer = room.user1 === ws ? room.user2 : room.user1;
            this.rooms.delete(roomId);
            if(peer.readyState === WebSocket.OPEN){
                peer.send(JSON.stringify({type: "peer_disconnected"}));
            }
            break;
        }
    }
  }
}

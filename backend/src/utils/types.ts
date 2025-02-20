import { WebSocket  } from "ws";

export interface signalMessageType {
  type: string;
  sdp?: string;
  candidate?: any;
  roomId?: string;
}

export interface roomType {
    user1: WebSocket;
    user2: WebSocket;
}



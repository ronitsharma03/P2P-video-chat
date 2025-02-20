import { useState, useEffect, useRef } from "react";

const STUN_SERVERS: RTCConfiguration = { 
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }] 
};

const App = () => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sendingPcRef = useRef<RTCPeerConnection | null>(null);
  const receivingPcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<{type: string, candidate: RTCIceCandidate}[]>([]);

  // Initialize WebSocket connection
  useEffect(() => {
    const socket = new WebSocket(`${import.meta.env.VITE_BACKEND_URL}`);
    setWs(socket);

    socket.onopen = () => {
      console.log("Connected to the signaling server");
      socket.send(JSON.stringify({type: "match_request"}));
    }

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log(`Received message:`, message);

      switch(message.type){
        case "matched":
          handleMatched(socket, message.roomId);
          break;
        case "offer": 
          handleOffer(socket, message);
          break;
        case "answer":
          handleAnswer(message);
          break;
        case "candidate": 
          handleIceCandidate(message);
          break;
        case "peer_disconnected":
          handlePeerDisconnect();
          break;
        default:
          console.log("Unknown message type");
      }
    }

    return () => {
      socket.close();
      cleanupConnections();
    }
  }, []);

  // Setup local media once - separate from WebRTC setup
  useEffect(() => {
    const setupLocalMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        localStreamRef.current = stream;
      } catch (err) {
        console.error("Failed to get local media:", err);
        alert("Could not access camera or microphone. Please check permissions.");
      }
    };
    
    setupLocalMedia();
    
    return () => {
      // Cleanup media on unmount
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const cleanupConnections = () => {
    if (sendingPcRef.current) {
      sendingPcRef.current.close();
      sendingPcRef.current = null;
    }
    
    if (receivingPcRef.current) {
      receivingPcRef.current.close();
      receivingPcRef.current = null;
    }
  };

  const handleMatched = async (socket: WebSocket, newRoomId: string) => {
    setRoomId(newRoomId);
    setIsConnecting(true);
    
    // Create sending peer connection
    const sendingPc = new RTCPeerConnection(STUN_SERVERS);
    sendingPcRef.current = sendingPc;
    
    sendingPc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(JSON.stringify({ 
          type: "candidate", 
          candidate: event.candidate,
          connectionType: "sender",
          roomId: newRoomId
        }));
      }
    };
    
    // Add local tracks to sending connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        sendingPc.addTrack(track, localStreamRef.current!);
      });
    } else {
      console.error("No local stream available for sending");
      return;
    }
    
    // Create and send offer
    try {
      const offer = await sendingPc.createOffer();
      await sendingPc.setLocalDescription(offer);
      
      socket.send(JSON.stringify({ 
        type: "offer", 
        sdp: offer.sdp, 
        roomId: newRoomId
      }));
    } catch (err) {
      console.error("Error creating/sending offer:", err);
      setIsConnecting(false);
    }
  };

  const handleOffer = async (socket: WebSocket, message: any) => {
    setIsConnecting(true);
    const offerRoomId = message.roomId;
    setRoomId(offerRoomId);
    
    // Create receiving peer connection
    const receivingPc = new RTCPeerConnection(STUN_SERVERS);
    receivingPcRef.current = receivingPc;
    
    // Setup remote video container
    const remoteStream = new MediaStream();
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    
    receivingPc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(JSON.stringify({ 
          type: "candidate", 
          candidate: event.candidate,
          connectionType: "receiver",
          roomId: offerRoomId
        }));
      }
    };
    
    receivingPc.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        const stream = remoteVideoRef.current.srcObject as MediaStream;
        stream.addTrack(event.track);
      }
    };
    
    // Set remote description from offer
    try {
      await receivingPc.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: message.sdp })
      );
      
      // Create and send answer
      const answer = await receivingPc.createAnswer();
      await receivingPc.setLocalDescription(answer);
      
      socket.send(JSON.stringify({ 
        type: "answer", 
        sdp: answer.sdp, 
        roomId: offerRoomId
      }));
      
      // Apply any pending candidates meant for receiver
      const receiverCandidates = pendingCandidates.current.filter(
        c => c.type === "sender"
      );
      
      for (const {candidate} of receiverCandidates) {
        await receivingPc.addIceCandidate(candidate);
      }
      
      pendingCandidates.current = pendingCandidates.current.filter(
        c => c.type !== "sender"
      );
      
    } catch (err) {
      console.error("Error handling offer:", err);
      setIsConnecting(false);
    }
  };

  const handleAnswer = async (message: any) => {
    try {
      if (!sendingPcRef.current) {
        console.error("No sending peer connection available");
        return;
      }
      
      await sendingPcRef.current.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: message.sdp })
      );
      
      // Apply any pending candidates meant for sender
      const senderCandidates = pendingCandidates.current.filter(
        c => c.type === "receiver"
      );
      
      for (const {candidate} of senderCandidates) {
        await sendingPcRef.current.addIceCandidate(candidate);
      }
      
      pendingCandidates.current = pendingCandidates.current.filter(
        c => c.type !== "receiver"
      );
      
      setIsConnecting(false);
    } catch (err) {
      console.error("Error handling answer:", err);
    }
  };

  const handleIceCandidate = async (message: any) => {
    const { candidate, connectionType } = message;
    
    try {
      if (connectionType === "sender") {
        // This candidate is for the receiving PC
        if (receivingPcRef.current && receivingPcRef.current.remoteDescription) {
          await receivingPcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingCandidates.current.push({
            type: "sender", 
            candidate: new RTCIceCandidate(candidate)
          });
        }
      } else {
        // This candidate is for the sending PC
        if (sendingPcRef.current && sendingPcRef.current.remoteDescription) {
          await sendingPcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingCandidates.current.push({
            type: "receiver", 
            candidate: new RTCIceCandidate(candidate)
          });
        }
      }
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  };

  const handlePeerDisconnect = () => {
    console.log("Peer disconnected");
    cleanupConnections();
    setIsConnecting(false);
    
    // Reconnect after peer disconnect
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({type: "match_request"}));
    }
  };

  return (
    <div className="app-container">
      <div className="video-container">
        <div className="video-wrapper">
          <h3>Your Video</h3>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="video-element"
          />
        </div>
        
        <div className="video-wrapper">
          <h3>Remote Video</h3>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="video-element"
          />
          {isConnecting && <div className="connecting-overlay">Connecting...</div>}
        </div>
      </div>
      
      <div className="status-container">
        {roomId ? `Connected to room: ${roomId}` : "Finding a match..."}
      </div>
    </div>
  );
};

export default App;
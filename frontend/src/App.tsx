import { useState, useEffect, useRef } from "react";
import { MicOff, Mic, Video, VideoOff, SkipForward } from "lucide-react";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";

const STUN_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const App = () => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isFindingMatch, setIsFindingMatch] = useState(true);
  const [lastSkippedPeerId, setLastSkippedPeerId] = useState<string | null>(
    null
  );

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sendingPcRef = useRef<RTCPeerConnection | null>(null);
  const receivingPcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<
    { type: string; candidate: RTCIceCandidate }[]
  >([]);

  // Initialize WebSocket connection
  useEffect(() => {
    const socket = new WebSocket(`${import.meta.env.VITE_BACKEND_URL}`);
    setWs(socket);

    socket.onopen = () => {
      console.log("Connected to the signaling server");
      requestMatch(socket);
    };

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log(`Received message:`, message);

      switch (message.type) {
        case "matched":
          handleMatched(socket, message.roomId, message.peerId);
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
        case "peer_skipped":
          // Critical: Handle being skipped by peer
          handleBeingSkipped(socket);
          break;
        default:
          console.log("Unknown message type");
      }
    };

    return () => {
      socket.close();
      cleanupConnections();
    };
  }, []);

  const requestMatch = (socket: WebSocket) => {
    setIsFindingMatch(true);
    socket.send(
      JSON.stringify({
        type: "match_request",
        lastSkippedPeerId: lastSkippedPeerId,
      })
    );
  };

  // Setup local media once - separate from WebRTC setup
  useEffect(() => {
    const setupLocalMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        localStreamRef.current = stream;
      } catch (err) {
        console.error("Failed to get local media:", err);
        alert(
          "Could not access camera or microphone. Please check permissions."
        );
      }
    };

    setupLocalMedia();

    return () => {
      // Cleanup media on unmount
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
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

    if (remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject) {
        const stream = remoteVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      remoteVideoRef.current.srcObject = null;
    }

    pendingCandidates.current = [];
  };

  const handleMatched = async (
    socket: WebSocket,
    newRoomId: string,
    _peerId: string
  ) => {
    setLastSkippedPeerId(null);
    setRoomId(newRoomId);
    setIsConnecting(true);
    setIsFindingMatch(false);

    const sendingPc = new RTCPeerConnection(STUN_SERVERS);
    sendingPcRef.current = sendingPc;

    sendingPc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(
          JSON.stringify({
            type: "candidate",
            roomId: newRoomId,
            candidate: event.candidate,
            connectionType: "sender", // indicates candidate from sending peer
          })
        );
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        sendingPc.addTrack(track, localStreamRef.current!);
      });
    } else {
      console.error("No local stream available for sending");
      return;
    }

    try {
      sendingPc.onnegotiationneeded = async () => {
        const offer = await sendingPc.createOffer();
        await sendingPc.setLocalDescription(offer);
        socket.send(
          JSON.stringify({
            type: "offer",
            sdp: offer.sdp,
            roomId: newRoomId,
          })
        );
      };
    } catch (err) {
      console.error("Error creating/sending offer:", err);
      setIsConnecting(false);
    }
  };

  // In handleOffer: receiving peer should mark its candidates as coming from the receiver
  const handleOffer = async (socket: WebSocket, message: any) => {
    setIsConnecting(true);
    setIsFindingMatch(false);
    const offerRoomId = message.roomId;
    setRoomId(offerRoomId);

    const receivingPc = new RTCPeerConnection(STUN_SERVERS);
    receivingPcRef.current = receivingPc;

    const remoteStream = new MediaStream();
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }

    receivingPc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(
          JSON.stringify({
            type: "candidate",
            roomId: offerRoomId,
            candidate: event.candidate,
            connectionType: "receiver", // indicates candidate from receiving peer
          })
        );
      }
    };

    receivingPc.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        const stream = remoteVideoRef.current.srcObject as MediaStream;
        stream.addTrack(event.track);
      }
    };

    try {
      await receivingPc.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: message.sdp })
      );

      const answer = await receivingPc.createAnswer();
      await receivingPc.setLocalDescription(answer);
      socket.send(
        JSON.stringify({
          type: "answer",
          sdp: answer.sdp,
          roomId: offerRoomId,
        })
      );

      // Apply any pending candidates meant for receiver
      const receiverCandidates = pendingCandidates.current.filter(
        (c) => c.type === "sender"
      );
      for (const { candidate } of receiverCandidates) {
        await receivingPc.addIceCandidate(candidate);
      }
      pendingCandidates.current = pendingCandidates.current.filter(
        (c) => c.type !== "sender"
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
        (c) => c.type === "receiver"
      );

      for (const { candidate } of senderCandidates) {
        await sendingPcRef.current.addIceCandidate(candidate);
      }

      pendingCandidates.current = pendingCandidates.current.filter(
        (c) => c.type !== "receiver"
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
        if (
          receivingPcRef.current &&
          receivingPcRef.current.remoteDescription
        ) {
          await receivingPcRef.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } else {
          pendingCandidates.current.push({
            type: "sender",
            candidate: new RTCIceCandidate(candidate),
          });
        }
      } else {
        if (sendingPcRef.current && sendingPcRef.current.remoteDescription) {
          await sendingPcRef.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } else {
          pendingCandidates.current.push({
            type: "receiver",
            candidate: new RTCIceCandidate(candidate),
          });
        }
      }
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  };

  const handlePeerDisconnect = () => {
    console.log("Peer disconnected");

    // First clean up existing connections
    cleanupConnections();

    // Then update state
    setIsConnecting(false);
    setRoomId(null);

    // Reconnect after peer disconnect
    if (ws && ws.readyState === WebSocket.OPEN) {
      requestMatch(ws);
    }
  };

  // Critically improved handler for being skipped
  const handleBeingSkipped = (socket: WebSocket) => {
    console.log("You've been skipped by the other user");
    if (roomId) {
      setLastSkippedPeerId(roomId);
    }
    cleanupConnections();
    setRoomId(null);
    setIsConnecting(false);
    setIsFindingMatch(true);
    requestMatch(socket);
  };

  const skipCurrentPeer = () => {
    if (ws && ws.readyState === WebSocket.OPEN && roomId) {
      // Store the current roomId to avoid matching again
      setLastSkippedPeerId(roomId);

      // Notify server about skipping (server will notify the other peer)
      ws.send(
        JSON.stringify({
          type: "skip_peer",
          roomId,
        })
      );

      // First, clean up existing connections
      cleanupConnections();

      // Then update UI state
      setRoomId(null);
      setIsConnecting(false);
      setIsFindingMatch(true); // Show finding match UI immediately

      // Request a new match
      requestMatch(ws);
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* Navbar Component */}
      <Navbar />

      {/* Main Content */}
      <main className="flex-grow p-4">
        <div className="max-w-6xl mx-auto w-full">
          <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
            Random Video Chat
          </h1>

          {/* Status Indicator */}
          <div className="text-center mb-4">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-100 text-blue-800">
              {isFindingMatch ? (
                <span className="flex items-center">
                  <span className="animate-pulse mr-2 h-2 w-2 rounded-full bg-blue-600"></span>
                  Finding someone to chat with...
                </span>
              ) : isConnecting ? (
                <span className="flex items-center">
                  <span className="animate-pulse mr-2 h-2 w-2 rounded-full bg-yellow-500"></span>
                  Connecting...
                </span>
              ) : roomId ? (
                <span className="flex items-center">
                  <span className="mr-2 h-2 w-2 rounded-full bg-green-500"></span>
                  Connected to chat
                </span>
              ) : (
                <span className="flex items-center">
                  <span className="animate-pulse mr-2 h-2 w-2 rounded-full bg-red-500"></span>
                  Disconnected
                </span>
              )}
            </div>
          </div>

          {/* Video Container */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Local Video */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden relative">
              <h3 className="p-2 bg-gray-800 text-white text-center">
                Your Video
              </h3>
              <div className="aspect-video bg-black relative">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                {!isVideoEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-70">
                    <p className="text-white text-lg">Camera Off</p>
                  </div>
                )}
              </div>
            </div>

            {/* Remote Video */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden relative">
              <h3 className="p-2 bg-gray-800 text-white text-center">
                Remote Video
              </h3>
              <div className="aspect-video bg-black relative">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                {/* Different states for remote video */}
                {isConnecting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-70">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                      <p className="text-white text-lg">Connecting...</p>
                    </div>
                  </div>
                )}
                {!roomId && !isConnecting && !isFindingMatch && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-70">
                    <p className="text-white text-lg">No one connected</p>
                  </div>
                )}
                {isFindingMatch && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-70">
                    <div className="text-center">
                      <div className="animate-bounce text-white text-5xl mb-4">
                        👋
                      </div>
                      <p className="text-white text-lg">
                        Looking for someone...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap justify-center gap-4 mb-6">
            {/* Audio Toggle */}
            <button
              onClick={toggleAudio}
              className={`flex items-center justify-center p-3 rounded-full ${
                isAudioEnabled
                  ? "bg-green-100 text-green-800 hover:bg-green-200"
                  : "bg-red-100 text-red-800 hover:bg-red-200"
              } transition-colors`}
              aria-label={
                isAudioEnabled ? "Mute microphone" : "Unmute microphone"
              }
            >
              {isAudioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
            </button>

            {/* Video Toggle */}
            <button
              onClick={toggleVideo}
              className={`flex items-center justify-center p-3 rounded-full ${
                isVideoEnabled
                  ? "bg-green-100 text-green-800 hover:bg-green-200"
                  : "bg-red-100 text-red-800 hover:bg-red-200"
              } transition-colors`}
              aria-label={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
            </button>

            {/* Skip Button */}
            <button
              onClick={skipCurrentPeer}
              className={`flex items-center justify-center gap-2 py-3 px-6 ${
                roomId
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-400 cursor-not-allowed"
              } text-white rounded-full transition-colors`}
              disabled={!roomId}
            >
              <SkipForward size={20} /> Skip to Next
            </button>
          </div>
        </div>
      </main>

      {/* Footer Component */}
      <Footer />
    </div>
  );
};

export default App;

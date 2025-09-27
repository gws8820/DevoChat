import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { useNavigate } from "react-router-dom";
import { IoMic, IoMicOff, IoClose } from "react-icons/io5";
import { LuUserRoundCog } from "react-icons/lu";
import { ClipLoader } from "react-spinners";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsContext } from "../contexts/SettingsContext";
import "../styles/Realtime.css";
import "../styles/Header.css";

const Realtime = () => {
  const { 
    realtimeModels, 
    realtimeModel, 
    updateRealtimeModel 
  } = useContext(SettingsContext);
  
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isConnecting, setIsConnecting] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);

  const peerConnection = useRef(null);
  const dataChannel = useRef(null);
  const audioInputRef = useRef(null);
  const audioStreamRef = useRef(null);
  const combinedAudioRef = useRef(null);
  const animationFrameRef = useRef(null);
  const modelModalRef = useRef(null);

  const navigate = useNavigate();

  const cleanup = useCallback(() => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (combinedAudioRef.current) {
      combinedAudioRef.current.audioContext.close();
      combinedAudioRef.current = null;
    }
  }, []);

  const setupCombinedVisualization = () => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;

    const addSourceFromStream = (stream) => {
      try {
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
      } catch (err) {
        console.error("An error occured during stream analysis:", err);
      }
    };

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      analyser.getByteFrequencyData(dataArray);
      const logBins = [0];
      for (let i = 1; i <= 4; i++) {
        logBins.push(Math.floor(bufferLength ** (i / 4)));
      }
    
      let totalAmplitude = 0;
      for (let i = 0; i < dataArray.length; i++) {
        totalAmplitude += dataArray[i];
      }
      
      const threshold = 1000;
      const minHeight = 60;
      const maxHeight = 240;
      
      const bars = document.querySelectorAll('.audio-bar');
      
      if (totalAmplitude < threshold) {
        bars.forEach(bar => {
          bar.style.height = `${minHeight}px`;
        });
      } else {
        bars.forEach((bar, index) => {
          const startBin = logBins[index];
          const endBin = logBins[index + 1];
          let sum = 0;
          const count = endBin - startBin || 1;
          for (let i = startBin; i < endBin; i++) {
            sum += dataArray[i];
          }
          const average = sum / count;
          const barHeightPx = minHeight + (average / 255) * (maxHeight - minHeight);
          bar.style.height = `${barHeightPx}px`;
        });
      }
      
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };
    renderFrame();

    return { audioContext, analyser, addSourceFromStream };
  };

  const addAudioTrack = useCallback(async (pc) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      if (!combinedAudioRef.current) {
        combinedAudioRef.current = setupCombinedVisualization();
      }
      combinedAudioRef.current.addSourceFromStream(stream);
    } catch (e) {
      throw new Error("마이크 권한을 허용해 주세요.");
    }
  }, []);

  const connectToSession = useCallback(async (realtimeModel) => {
    try {
      const tokenResponse = await fetch(
        `${process.env.REACT_APP_FASTAPI_URL}/session?model=${encodeURIComponent(realtimeModel)}`,
        { credentials: "include" }
      );
      
      if (tokenResponse.status === 401) {
        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          window.location.href = '/login?expired=true';
        }
        return;
      }
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(`${errorData.detail}`);
      }
      const data = await tokenResponse.json();

      const EPHEMERAL_KEY = data.token;
      const REALTIME_MODEL = data.model;

      peerConnection.current = new RTCPeerConnection();
      await addAudioTrack(peerConnection.current);

      if (audioInputRef.current) {
        audioInputRef.current.autoplay = true;
      }

      peerConnection.current.ontrack = async (e) => {
        if (audioInputRef.current) {
          audioInputRef.current.srcObject = e.streams[0];

          try {
            await audioInputRef.current.play();
          } catch (err) {
            throw new Error("오류가 발생했습니다. 다시 시도해주세요.");
          }

          if (!combinedAudioRef.current) {
            combinedAudioRef.current = setupCombinedVisualization();
          }
          combinedAudioRef.current.addSourceFromStream(e.streams[0]);
        }
      };

      dataChannel.current = peerConnection.current.createDataChannel('oai-events');

      dataChannel.current.onmessage = (event) => {
        try {
          const realtimeEvent = JSON.parse(event.data);

          if (realtimeEvent.type === 'response.created') {
            setTranscript("");
          }

          if (realtimeEvent.type === 'response.output_item.added') {
            setIsModelSpeaking(true);
          }

          if (realtimeEvent.type === 'response.output_audio_transcript.delta') {
            setTranscript(prev => prev + (realtimeEvent.delta || ''));
          }

          if (realtimeEvent.type === 'response.output_audio_transcript.done') {
            setTranscript(realtimeEvent.transcript);
          }

          if (realtimeEvent.type === 'output_audio_buffer.stopped') {
            setIsModelSpeaking(false);
            setTimeout(() => setTranscript(""), 3000);
          }
        } catch (error) {
          console.error('Parsing error:', error);
        }
      };
      
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      const baseUrl = 'https://api.openai.com/v1/realtime/calls';
      const sdpResponse = await fetch(`${baseUrl}?model=${REALTIME_MODEL}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!sdpResponse.ok) {
        throw new Error(`연결에 실패했습니다: ${sdpResponse.status} ${sdpResponse.statusText}`);
      }
      const answer = { type: 'answer', sdp: await sdpResponse.text() };
      await peerConnection.current.setRemoteDescription(answer);
      setIsConnecting(false);
    } catch (err) {
      cleanup();
      navigate("/", { state: { errorModal: err.message } });
    }
  }, [navigate, addAudioTrack, cleanup]);

  useEffect(() => {
    connectToSession(realtimeModel);

    return () => {
      cleanup();
    };
  }, [realtimeModel, connectToSession, cleanup]);

  const toggleMicrophone = useCallback(() => {
    if (!audioStreamRef.current) return;
    try {
      audioStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMicEnabled(!isMicEnabled);
    } catch (err) {
      cleanup();
      navigate("/", { state: { errorModal: "마이크 토글 중 오류가 발생했습니다." } });
    }
  }, [navigate, isMicEnabled, cleanup]);

  const handleGoBack = useCallback((e) => {
    cleanup();
    setTimeout(() => navigate(-1), 300);
  }, [navigate, cleanup]);

  const handleModelChange = useCallback(async (newModel) => {
    setIsModelModalOpen(false);
    if (newModel === realtimeModel) return;
    
    setIsConnecting(true);
    cleanup();
    updateRealtimeModel(newModel);
  }, [realtimeModel, cleanup, updateRealtimeModel]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isModelModalOpen && modelModalRef.current && !modelModalRef.current.contains(event.target)) {
        setIsModelModalOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isModelModalOpen]);

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="realtime-container"
          className="realtime-container"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {isConnecting ? (
            <div className="spinner-container">
              <ClipLoader size={60} />
            </div>
          ) : (
            <>
              <div className="realtime-models-icon" onClick={() => setIsModelModalOpen(true)}>
                <LuUserRoundCog />
              </div>

              <div className="audio-bars-container">
                <div className="audio-bar"></div>
                <div className="audio-bar"></div>
                <div className="audio-bar"></div>
                <div className="audio-bar"></div>
              </div>

              <div className="bottom-ui-container">
                <AnimatePresence>
                  {isModelSpeaking && transcript && (
                    <motion.div
                      key="transcript-container"
                      className="transcript-container"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.3 }}
                    >
                      {transcript}
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  <motion.div
                    key="realtime-function-container"
                    className="realtime-function-container"
                    initial={{ y: 10 }}
                    animate={{ y: 0 }}
                    exit={{ y: 10 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <div onClick={toggleMicrophone} className={`realtime-function ${isMicEnabled ? 'mic-enabled' : 'mic-disabled'}`}>
                      {isMicEnabled ? <IoMic /> : <IoMicOff />}
                    </div>
                    <div onClick={handleGoBack} className="realtime-function stop">
                      <IoClose />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {isModelModalOpen && (
          <motion.div
            className="hmodal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="hmodal" ref={modelModalRef}>
              <div className="model-list">
                {realtimeModels?.map((m, index) => (
                  <div
                    className={`model-item ${m?.model_gender}`}
                    key={index}
                    onClick={() => handleModelChange(m.model_name)}
                  >
                    <div className="model-alias">{m.model_alias}</div>
                    <div className="model-description">{m.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <audio ref={audioInputRef} style={{ display: 'none' }} />
    </>
  );
};

export default Realtime;
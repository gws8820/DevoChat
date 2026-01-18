import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { useNavigate } from "react-router-dom";
import { IoMic, IoMicOff, IoClose } from "react-icons/io5";
import { LuUserRoundCog } from "react-icons/lu";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsContext } from "../contexts/SettingsContext";
import Orb from "../components/Orb";
import bootSound from "../resources/boot.mp3";
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
  const bootAudioRef = useRef(null);

  const navigate = useNavigate();

  useEffect(() => {
    const audio = new Audio(bootSound);
    bootAudioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      bootAudioRef.current = null;
    };
  }, []);

  const playBootSound = useCallback(() => {
    const audio = bootAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

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

      let totalAmplitude = 0;
      for (let i = 1; i <= 200; i++) {
        totalAmplitude += dataArray[i];
      }
      
      const averageAmplitude = totalAmplitude / 200;
      const scale = 1 + Math.min(averageAmplitude / 128, 1) * 0.1;
      
      const circle = document.querySelector('.orb-container');
      if (circle) {
        circle.style.transform = `scale(${scale})`;
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

          if (realtimeEvent.type === 'error') {
            console.error("Realtime API Error:", realtimeEvent);
          }

          if (realtimeEvent.type === 'session.created') {
            const updateEvent = {
              type: "session.update",
              session: { 
                type: "realtime",
                instructions: "Answer in Korean unless otherwise specified.",
                audio: {
                  input: {
                    turn_detection: {
                      type: "semantic_vad",
                      eagerness: "low"
                    }
                  }
                }
              }
            };
            dataChannel.current.send(JSON.stringify(updateEvent));
          }

          if (realtimeEvent.type === 'session.updated') {
            console.log("Session updated:", realtimeEvent);
          }

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
          console.error("Parsing error:", error);
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
      playBootSound();
      setIsConnecting(false);
    } catch (err) {
      cleanup();
      navigate("/", { state: { errorModal: err.message } });
    }
  }, [navigate, addAudioTrack, cleanup, playBootSound]);

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
    setTimeout(() => {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        window.location.href = 'https://devochat.com';
      }
    }, 300);
  }, [navigate, cleanup]);

  const handleModelChange = useCallback(async (newModel) => {
    setIsModelModalOpen(false);
    if (newModel === realtimeModel) return;
    
    setIsConnecting(true);
    cleanup();

    updateRealtimeModel(newModel);
    setIsMicEnabled(true);
  }, [realtimeModel, cleanup, updateRealtimeModel, setIsMicEnabled]);

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
          <AnimatePresence mode="wait">
            {isConnecting ? (
              <div
                key="orb"
                className="orb-container"
              >
                <motion.div
                  className="black-circle"
                  initial={{ scale: 1 }}
                  animate={{
                    scale: [1, 1.1, 1],
                    transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                  }}
                  exit={{
                    scale: 2.3,
                    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                  }}
                />
              </div>
            ) : (
              <>
                <Orb hue={0} hoverIntensity={0} backgroundColor="#ffffff" />

                <motion.div 
                  key="realtime-models-icon"
                  className="realtime-models-icon" 
                  onClick={() => setIsModelModalOpen(true)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <LuUserRoundCog />
                </motion.div>

                <div className="bottom-ui-container">
                  <AnimatePresence>
                    {isModelSpeaking && transcript && (
                      <motion.div
                        key="transcript-container"
                        className="transcript-container"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        {transcript}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="realtime-function-container">
                    <div onClick={toggleMicrophone} className={`realtime-function ${isMicEnabled ? 'mic-enabled' : 'mic-disabled'}`}>
                      {isMicEnabled ? <IoMic /> : <IoMicOff />}
                    </div>
                    <div onClick={handleGoBack} className="realtime-function stop">
                      <IoClose />
                    </div>
                  </div>
                </div>
              </>
            )}
          </AnimatePresence>
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
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from "react-router-dom";
import { LuX, LuRefreshCcw } from "react-icons/lu";
import { IoMicOff } from "react-icons/io5";
import { ClipLoader } from "react-spinners";
import { motion, AnimatePresence } from "framer-motion";
import "../styles/Realtime.css";

const Realtime = () => {
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [showFunctions, setShowFunctions] = useState(true);
  const [isConnecting, setIsConnecting] = useState(true);

  const peerConnection = useRef(null);
  const dataChannel = useRef(null);
  const audioInputRef = useRef(null);
  const audioStreamRef = useRef(null);
  const combinedAudioRef = useRef(null);
  const animationFrameRef = useRef(null);

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
        console.error("스트림 분석 중 오류가 발생했습니다:", err);
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

  const sendUpdateInstructions = useCallback((instruction) => {
    const event = {
      type: "session.update",
      session: {
        instructions: instruction,
      },
    };

    if (dataChannel.current && dataChannel.current.readyState === 'open')
      dataChannel.current.send(JSON.stringify(event));
    else
      console.error("데이터 채널이 열리지 않았습니다.");
  }, []);

  const connectToSession = useCallback(async () => {
    try {
      const tokenResponse = await fetch(
        `${process.env.REACT_APP_FASTAPI_URL}/session`,
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
      const EPHEMERAL_KEY = data.client_secret.value;

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
            throw new Error("자동재생에 실패했습니다. 브라우저 설정을 확인하세요.");
          }

          if (!combinedAudioRef.current) {
            combinedAudioRef.current = setupCombinedVisualization();
          }
          combinedAudioRef.current.addSourceFromStream(e.streams[0]);
        }
      };

      dataChannel.current = peerConnection.current.createDataChannel('oai-events');
      dataChannel.current.onopen = () => {
        sendUpdateInstructions("한국어, 반말을 사용해. 상냥, 발랄하고 애교섞인 목소리를 사용해.");
      };

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model = 'gpt-4o-mini-realtime-preview';
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
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
  }, [navigate, addAudioTrack, sendUpdateInstructions, cleanup]);

  useEffect(() => {
    connectToSession();

    return () => {
      cleanup();
    };
  }, [connectToSession, cleanup]);

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

  const handleNavigate = useCallback((e) => {
    e.stopPropagation();
    setShowFunctions(false);
    cleanup();
    setTimeout(() => navigate("/"), 300);
  }, [navigate, cleanup]);

  const handleRefresh = useCallback((e) => {
    e.stopPropagation();
    window.location.reload();
  }, []);

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="realtime-container"
          className="realtime-container"
          onClick={toggleMicrophone}
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
              <div className="audio-bars-container">
                <div className="audio-bar"></div>
                <div className="audio-bar"></div>
                <div className="audio-bar"></div>
                <div className="audio-bar"></div>
              </div>

              <AnimatePresence>
                {!isMicEnabled && (
                  <motion.div
                    key="mic-disabled"
                    className="mic-disabled"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <IoMicOff />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showFunctions && (
                  <motion.div
                    key="realtime-function-container"
                    className="realtime-function-container"
                    initial={{ y: 10 }}
                    animate={{ y: 0 }}
                    exit={{ y: 10 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <div onClick={handleRefresh} className="realtime-function new">
                      <LuRefreshCcw strokeWidth={"2.5"} />
                    </div>
                    <div onClick={handleNavigate} className="realtime-function stop">
                      <LuX strokeWidth={"3"} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      
      <audio ref={audioInputRef} style={{ display: 'none' }} />
    </>
  );
};

export default Realtime;
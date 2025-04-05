import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from "react-router-dom";
import { LuX, LuRefreshCw } from "react-icons/lu";
import { IoMicOff } from "react-icons/io5";
import { ClipLoader } from "react-spinners";
import { motion, AnimatePresence } from "framer-motion";
import SiriWave from 'siriwave';
import "../styles/Realtime.css";

const Realtime = () => {
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [showFunctions, setShowFunctions] = useState(true);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isAudioActive, setIsAudioActive] = useState(false);
  
  const peerConnection = useRef(null);
  const dataChannel = useRef(null);
  const audioRef = useRef(null);
  const audioStreamRef = useRef(null);
  const siriContainerRef = useRef(null);
  const siriWaveInstance = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const audioActivityTimeoutRef = useRef(null);

  const navigate = useNavigate();

  const addAudioTrack = async (pc) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      micAnalyserRef.current = audioContextRef.current.createAnalyser();
      micAnalyserRef.current.fftSize = 256;
      const micSource = audioContextRef.current.createMediaStreamSource(stream);
      micSource.connect(micAnalyserRef.current);
      
      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    } catch (e) {
      throw new Error("마이크 권한을 허용해 주세요.");
    }
  };

  const sendUpdateInstructions = (instruction) => {
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
  };

  const connectToSession = useCallback(async () => {
    try {
      const tokenResponse = await fetch(
        `${process.env.REACT_APP_FASTAPI_URL}/session`,
        { credentials: "include" }
      );
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(`${errorData.detail}`);
      }
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data.client_secret.value;
      peerConnection.current = new RTCPeerConnection();
      await addAudioTrack(peerConnection.current);
      if (audioRef.current) {
        audioRef.current.autoplay = true;
      }
      peerConnection.current.ontrack = async (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
          }
          
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;
          const source = audioContextRef.current.createMediaStreamSource(e.streams[0]);
          source.connect(analyserRef.current);
          
          try {
            await audioRef.current.play();
          } catch (e) {
            throw new Error("자동재생에 실패했습니다. 브라우저 설정을 확인하세요.");
          }
        }
      };
      dataChannel.current = peerConnection.current.createDataChannel('oai-events');
      dataChannel.current.onopen = () => {
        sendUpdateInstructions("한국어 반말로 대답해. 상냥하고 발랄한 목소리로 대화해.");
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
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      navigate("/", { state: { errorModal: err.message } });
    }
  }, [navigate]);

  const checkAudioActivity = useCallback(() => {
    if (!analyserRef.current && !micAnalyserRef.current) return;
    
    let isActive = false;
    
    if (analyserRef.current) {
      const speakerData = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(speakerData);
      const speakerAverage = speakerData.reduce((a, b) => a + b, 0) / speakerData.length;
      if (speakerAverage > 30) {
        isActive = true;
      }
    }
    
    if (micAnalyserRef.current && isMicEnabled) {
      const micData = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
      micAnalyserRef.current.getByteFrequencyData(micData);
      const micAverage = micData.reduce((a, b) => a + b, 0) / micData.length;
      if (micAverage > 30) {
        isActive = true;
      }
    }
    
    if (isActive) {
      if (audioActivityTimeoutRef.current) {
        clearTimeout(audioActivityTimeoutRef.current);
        audioActivityTimeoutRef.current = null;
      }
      setIsAudioActive(true);
    } 

    else if (isAudioActive && !audioActivityTimeoutRef.current) {
      audioActivityTimeoutRef.current = setTimeout(() => {
        setIsAudioActive(false);
        audioActivityTimeoutRef.current = null;
      }, 500);
    }
    
    requestAnimationFrame(checkAudioActivity);
  }, [isMicEnabled, isAudioActive]);

  useEffect(() => {
    connectToSession();
    return () => {
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (audioActivityTimeoutRef.current) {
        clearTimeout(audioActivityTimeoutRef.current);
      }
      if (siriWaveInstance.current) {
        siriWaveInstance.current.stop();
        siriWaveInstance.current.dispose();
        siriWaveInstance.current = null;
      }
    };
  }, [connectToSession]);

  useEffect(() => {
    if (!isConnecting && siriContainerRef.current) {
      siriContainerRef.current.style.opacity = '0';
      
      siriWaveInstance.current = new SiriWave({
        container: siriContainerRef.current,
        width: 350,
        height: 350,
        speed: 0.2,
        amplitude: 1.5,
        autostart: true,
        style: 'ios9'
      });

      checkAudioActivity();
    }
    
    return () => {
      if (siriWaveInstance.current) {
        siriWaveInstance.current.stop();
        siriWaveInstance.current.dispose();
        siriWaveInstance.current = null;
      }
    };
  }, [isConnecting, checkAudioActivity]);

  useEffect(() => {
    if (siriContainerRef.current) {
      if (isAudioActive && isMicEnabled) {
        siriContainerRef.current.style.opacity = '1';
      } else {
        siriContainerRef.current.style.opacity = '0';
      }
    }
  }, [isAudioActive, isMicEnabled]);

  const toggleMicrophone = () => {
    if (!audioStreamRef.current) return;
    try {
      audioStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMicEnabled;
      });
      setIsMicEnabled(prev => !prev);
    } catch (err) {
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }

      navigate("/", { state: { errorModal: "마이크 토글 중 오류가 발생했습니다." } });
    }
  };

  const handleNavigate = () => {
    setShowFunctions(false);
    setTimeout(() => navigate("/"), 300);
  };

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
              <div onClick={toggleMicrophone} className="mic-control">
                <div ref={siriContainerRef} style={{ transition: 'opacity 0.3s' }} />
              </div>

              <AnimatePresence>
                {!isMicEnabled && (
                  <motion.div
                    key="mic-disabled"
                    className="mic-disabled"
                    onClick={toggleMicrophone}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <IoMicOff style={{ fill: "#cc2222", stroke: "#cc2222" }} />
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
                    <div onClick={handleNavigate} className="realtime-function stop">
                      <LuX strokeWidth={"3"} />
                    </div>
                    <div className="realtime-function new" onClick={() => window.location.reload()}>
                      <LuRefreshCw strokeWidth={"2.5"} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      
      <audio ref={audioRef} style={{ display: 'none' }} />
    </>
  );
};

export default Realtime;
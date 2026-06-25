document.addEventListener('DOMContentLoaded', () => {
  const voiceCallBtn = document.getElementById('voice-call-btn');
  const callModal = document.getElementById('call-modal');
  const callAvatar = document.getElementById('call-avatar');
  const callUserName = document.getElementById('call-user-name');
  const callTimerStatus = document.getElementById('call-timer-status');
  
  const ongoingCallControls = document.getElementById('ongoing-call-controls');
  const minimizeBtn = document.getElementById('minimize-call-btn');
  const muteBtn = document.getElementById('mute-btn');
  const speakerBtn = document.getElementById('speaker-btn');
  const hangupBtn = document.getElementById('hangup-btn');
  
  const incomingCallControls = document.getElementById('incoming-call-controls');
  const declineBtn = document.getElementById('decline-btn');
  const acceptBtn = document.getElementById('accept-btn');
  
  const remoteAudio = document.getElementById('remote-audio');

  let localStream = null;
  let peerConnection = null;
  let peerName = '';
  let callTimer = null;
  let callStartTime = null;
  let callSeconds = 0;
  let isMuted = false;
  let isSpeakerOn = false;
  let isCaller = false;

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  window.setCallPeer = (name) => {
    peerName = name;
  };

  voiceCallBtn.addEventListener('click', () => {
    if (!peerName) return;
    initiateCall();
  });

  const getSocket = () => window.appSocket;

  function initiateCall() {
    isCaller = true;
    setupCallUI('dialing');
    utils.playRingSound();
    getSocket().emit('call-request');
  }

  function setupCallUI(state) {
    callModal.classList.add('active');
    callModal.classList.remove('minimized');
    
    // In case there was a dialing row, let's clean it up
    const existingRow = document.getElementById('dialing-hangup-row');
    if (existingRow) existingRow.remove();
    
    callAvatar.innerText = utils.getInitials(peerName);
    callUserName.innerText = peerName;

    if (state === 'dialing') {
      callTimerStatus.innerText = 'Calling...';
      ongoingCallControls.style.display = 'none';
      incomingCallControls.style.display = 'none';
      
      const hangupRow = document.createElement('div');
      hangupRow.id = 'dialing-hangup-row';
      hangupRow.className = 'call-controls-row';
      
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'call-btn hangup';
      cancelBtn.innerHTML = '📞';
      cancelBtn.addEventListener('click', endCall);
      
      hangupRow.appendChild(cancelBtn);
      
      const existingHangup = document.getElementById('dialing-hangup-row');
      if (!existingHangup) {
        callModal.querySelector('.call-actions-area').appendChild(hangupRow);
      }
    } else if (state === 'incoming') {
      callTimerStatus.innerText = 'Incoming call...';
      ongoingCallControls.style.display = 'none';
      incomingCallControls.style.display = 'flex';
      removeDialingHangupRow();
    } else if (state === 'ongoing') {
      callModal.classList.add('ongoing');
      callTimerStatus.innerText = 'Connecting...';
      ongoingCallControls.style.display = 'flex';
      incomingCallControls.style.display = 'none';
      removeDialingHangupRow();
    }
  }

  function removeDialingHangupRow() {
    const dialingHangupRow = document.getElementById('dialing-hangup-row');
    if (dialingHangupRow) {
      dialingHangupRow.remove();
    }
  }

  function startCallTimer() {
    callStartTime = new Date();
    callSeconds = 0;
    callTimerStatus.innerText = '00:00';
    
    clearInterval(callTimer);
    callTimer = setInterval(() => {
      callSeconds++;
      callTimerStatus.innerText = utils.formatDuration(callSeconds);
    }, 1000);
  }

  function stopCallTimer() {
    clearInterval(callTimer);
    callTimer = null;
  }

  async function establishWebRTC() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: false 
      });
    } catch (err) {
      utils.showToast('Microphone access denied', 'error');
      endCall();
      return;
    }

    peerConnection = new RTCPeerConnection(iceServers);

    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        remoteAudio.srcObject = event.streams[0];
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit('webrtc-candidate', event.candidate);
      }
    };

    if (isCaller) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      getSocket().emit('webrtc-offer', offer);
    }
  }

  acceptBtn.addEventListener('click', () => {
    utils.stopRingSound();
    setupCallUI('ongoing');
    startCallTimer();
    getSocket().emit('call-accept');
    establishWebRTC();
  });

  declineBtn.addEventListener('click', () => {
    utils.stopRingSound();
    callModal.classList.remove('active');
    getSocket().emit('call-reject');
  });

  hangupBtn.addEventListener('click', endCall);

  function endCall() {
    const duration = callSeconds;
    const startTimeStr = callStartTime ? callStartTime.toISOString() : new Date().toISOString();
    const callerName = isCaller ? sessionStorage.getItem('prane_username') : peerName;
    const receiverName = isCaller ? peerName : sessionStorage.getItem('prane_username');
    
    cleanupCall();
    
    getSocket().emit('call-hangup', {
      caller: callerName,
      receiver: receiverName,
      startTime: startTimeStr,
      duration: duration
    });
  }

  window.endActiveCall = () => {
    cleanupCall();
  };

  function cleanupCall() {
    utils.stopRingSound();
    stopCallTimer();
    
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    
    remoteAudio.srcObject = null;
    callModal.classList.remove('active');
    callModal.classList.remove('ongoing');
    removeDialingHangupRow();
    
    isMuted = false;
    muteBtn.classList.remove('active');
    muteBtn.innerText = '🔇';
    
    isSpeakerOn = false;
    speakerBtn.classList.remove('active');
  }

  muteBtn.addEventListener('click', () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        isMuted = !isMuted;
        audioTrack.enabled = !isMuted;
        muteBtn.classList.toggle('active', isMuted);
        muteBtn.innerText = isMuted ? '🎙️' : '🔇';
      }
    }
  });

  speakerBtn.addEventListener('click', () => {
    isSpeakerOn = !isSpeakerOn;
    speakerBtn.classList.toggle('active', isSpeakerOn);
    
    if (remoteAudio.sinkId && typeof remoteAudio.setSinkId === 'function') {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
        if (audioOutputs.length > 1) {
          const deviceId = isSpeakerOn ? audioOutputs[1].deviceId : audioOutputs[0].deviceId;
          remoteAudio.setSinkId(deviceId);
        }
      });
    }
  });

  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    callModal.classList.add('minimized');
  });

  callModal.addEventListener('click', (e) => {
    if (callModal.classList.contains('minimized')) {
      callModal.classList.remove('minimized');
    }
  });

  getSocket().on('incoming-call', ({ from }) => {
    peerName = from;
    isCaller = false;
    setupCallUI('incoming');
    utils.playRingSound();
  });

  getSocket().on('call-accepted', () => {
    utils.stopRingSound();
    setupCallUI('ongoing');
    startCallTimer();
    establishWebRTC();
  });

  getSocket().on('call-rejected', () => {
    utils.stopRingSound();
    utils.showToast('Call rejected', 'error');
    cleanupCall();
  });

  getSocket().on('webrtc-offer', async (offer) => {
    if (!peerConnection) {
      await establishWebRTC();
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    getSocket().emit('webrtc-answer', answer);
  });

  getSocket().on('webrtc-answer', async (answer) => {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  getSocket().on('webrtc-candidate', async (candidate) => {
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {}
    }
  });

  getSocket().on('call-hungup', () => {
    cleanupCall();
  });
});

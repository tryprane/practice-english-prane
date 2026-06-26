const socket = io();
window.appSocket = socket;

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const name = sessionStorage.getItem('prane_username');

  if (!code || !name) {
    window.location.href = 'index.html';
    return;
  }

  const roomAvatar = document.getElementById('room-avatar');
  const roomNameEl = document.getElementById('room-name');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const voiceCallBtn = document.getElementById('voice-call-btn');
  const callLogsBtn = document.getElementById('call-logs-btn');
  const backBtn = document.getElementById('back-btn');
  const chatArea = document.getElementById('chat-area');
  const typingIndicator = document.getElementById('typing-indicator');
  const chatInputForm = document.getElementById('chat-input-form');
  const messageInput = document.getElementById('message-input');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('image-file-input');
  const imagePreview = document.getElementById('image-preview');
  const previewImg = document.getElementById('preview-img');
  const previewFilename = document.getElementById('preview-filename');
  const previewFilesize = document.getElementById('preview-filesize');
  const removePreviewBtn = document.getElementById('remove-preview-btn');
  const logsModal = document.getElementById('logs-modal');
  const closeLogsBtn = document.getElementById('close-logs-btn');
  const callLogsList = document.getElementById('call-logs-list');
  const imageViewer = document.getElementById('image-viewer');
  const viewerImg = document.getElementById('viewer-img');
  const closeViewerBtn = document.getElementById('close-viewer-btn');

  let selectedImageFile = null;
  let selectedImageDataUrl = null;
  let typingTimeout = null;
  let isPeerConnected = false;
  let peerName = '';

  socket.emit('join-room', { code, name });

  setupPushNotifications(code, name);

  socket.on('joined', (data) => {
    roomNameEl.innerText = data.roomName;
    roomAvatar.innerText = utils.getInitials(data.roomName);
    
    chatArea.innerHTML = '';
    data.messages.forEach(msg => {
      appendMessage(msg);
      if (msg.sender !== name && msg.status !== 'read') {
        socket.emit('message-read', { messageId: msg.id });
      }
    });
    
    updateCallLogsList(data.callLogs);
    scrollToBottom();

    const otherMembers = data.members.filter(m => m !== name);
    if (otherMembers.length > 0) {
      peerName = otherMembers[0];
      setPeerOnline(true);
    } else {
      setPeerOnline(false);
    }
  });

  async function setupPushNotifications(roomCode, userName) {
    if (!utils.pushSupported()) return;

    const permission = await utils.requestNotificationPermission();
    if (permission !== 'granted') return;

    try {
      const subscription = await utils.subscribeToPush();
      if (subscription) {
        await utils.sendSubscriptionToServer(roomCode, userName, subscription);
      }
    } catch (e) {}
  }

  socket.on('peer-joined', (peerUserName) => {
    peerName = peerUserName;
    setPeerOnline(true);
    utils.showToast(`${peerUserName} joined the room`, 'info');
  });

  socket.on('peer-left', (peerUserName) => {
    setPeerOnline(false);
    utils.showToast(`${peerUserName} left the room`, 'info');
    if (window.endActiveCall) {
      window.endActiveCall();
    }
  });

  socket.on('join-error', (errorMsg) => {
    utils.showToast(errorMsg, 'error');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 2000);
  });

  socket.on('room-deleted', () => {
    utils.showToast('Room has been deleted by Admin', 'error');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 2000);
  });

  function setPeerOnline(online) {
    isPeerConnected = online;
    if (online) {
      statusDot.className = 'status-dot online';
      statusText.innerText = `${peerName} (online)`;
      voiceCallBtn.style.display = 'flex';
      if (window.setCallPeer) {
        window.setCallPeer(peerName);
      }
    } else {
      statusDot.className = 'status-dot';
      statusText.innerText = 'waiting for partner...';
      voiceCallBtn.style.display = 'none';
      if (window.setCallPeer) {
        window.setCallPeer('');
      }
    }
  }

  socket.on('message-received', (msg) => {
    appendMessage(msg);
    scrollToBottom();
    utils.playMessageSound();
    socket.emit('message-delivered', { messageId: msg.id, senderName: name });
    socket.emit('message-read', { messageId: msg.id });
  });

  socket.on('message-status-update', ({ messageId, status }) => {
    updateMessageStatus(messageId, status);
  });

  socket.on('message-deleted', ({ messageId }) => {
    const wrapper = document.getElementById(`msg-${messageId}`);
    if (wrapper) {
      wrapper.remove();
    }
  });

  socket.on('peer-typing', ({ name: peer, isTyping }) => {
    if (isTyping) {
      typingIndicator.innerText = `${peer} is typing...`;
    } else {
      typingIndicator.innerText = '';
    }
  });

  socket.on('call-log-added', (log) => {
    addCallLogItem(log, true);
  });

  backBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  messageInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('typing', false);
    }, 1500);
  });

  attachBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      utils.showToast('Image size exceeds 5MB limit', 'error');
      fileInput.value = '';
      return;
    }

    selectedImageFile = file;
    
    if (file.size > 500 * 1024) {
      const result = await utils.compressImage(file, 1200, 1200, 0.7);
      selectedImageDataUrl = result.dataUrl;
      selectedImageFile = new File([result.blob], file.name, { type: 'image/jpeg' });
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        selectedImageDataUrl = event.target.result;
      };
      reader.readAsDataURL(file);
    }

    previewImg.src = URL.createObjectURL(selectedImageFile);
    previewFilename.innerText = file.name;
    previewFilesize.innerText = `${(selectedImageFile.size / 1024).toFixed(1)} KB`;
    imagePreview.classList.add('active');
  });

  removePreviewBtn.addEventListener('click', () => {
    clearImagePreview();
  });

  function clearImagePreview() {
    selectedImageFile = null;
    selectedImageDataUrl = null;
    fileInput.value = '';
    imagePreview.classList.remove('active');
  }

  chatInputForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    
    if (!text && !selectedImageFile) return;

    messageInput.value = '';
    socket.emit('typing', false);
    clearTimeout(typingTimeout);

    let imageUrl = null;

    if (selectedImageFile) {
      utils.showToast('Uploading image...', 'info');
      const formData = new FormData();
      formData.append('image', selectedImageFile);
      
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        const uploadResult = await response.json();
        if (uploadResult.success) {
          imageUrl = uploadResult.url;
        } else {
          utils.showToast('Image upload failed', 'error');
          return;
        }
      } catch (err) {
        utils.showToast('Image upload error', 'error');
        return;
      }
      clearImagePreview();
    }

    socket.emit('send-message', { text, image: imageUrl }, (ack) => {
      if (ack.success) {
        appendMessage(ack.message);
        scrollToBottom();
      }
    });
  });

  function appendMessage(msg) {
    const isSent = msg.sender === name;
    
    const wrapper = document.createElement('div');
    wrapper.id = `msg-${msg.id}`;
    wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (msg.image) {
      const img = document.createElement('img');
      img.className = 'message-image';
      img.src = msg.image;
      img.alt = 'Uploaded Image';
      img.addEventListener('click', () => {
        viewerImg.src = msg.image;
        imageViewer.classList.add('active');
      });
      bubble.appendChild(img);
    }

    if (msg.text) {
      const textSpan = document.createElement('div');
      textSpan.innerText = msg.text;
      if (msg.image) {
        textSpan.style.marginTop = '8px';
      }
      bubble.appendChild(textSpan);
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';

    const timeSpan = document.createElement('span');
    timeSpan.innerText = utils.formatTime(msg.timestamp);
    meta.appendChild(timeSpan);

    if (isSent) {
      const tick = document.createElement('span');
      tick.className = 'tick-icon';
      updateTickStyle(tick, msg.status);
      meta.appendChild(tick);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete-msg';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.title = 'Delete message';
      deleteBtn.onclick = () => {
        if(confirm('Delete this message?')) {
          window.appSocket.emit('delete-message', { messageId: msg.id });
        }
      };
      meta.appendChild(deleteBtn);
    }

    bubble.appendChild(meta);
    wrapper.appendChild(bubble);
    chatArea.appendChild(wrapper);
  }

  function updateMessageStatus(messageId, status) {
    const wrapper = document.getElementById(`msg-${messageId}`);
    if (wrapper) {
      const tick = wrapper.querySelector('.tick-icon');
      if (tick) {
        updateTickStyle(tick, status);
      }
    }
  }

  function updateTickStyle(tickEl, status) {
    if (status === 'sent') {
      tickEl.innerText = ' ✓';
      tickEl.className = 'tick-icon sent';
    } else if (status === 'delivered') {
      tickEl.innerText = ' ✓✓';
      tickEl.className = 'tick-icon delivered';
    } else if (status === 'read') {
      tickEl.innerText = ' ✓✓';
      tickEl.className = 'tick-icon read';
    }
  }

  function scrollToBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  callLogsBtn.addEventListener('click', () => {
    logsModal.classList.add('active');
  });

  closeLogsBtn.addEventListener('click', () => {
    logsModal.classList.remove('active');
  });

  closeViewerBtn.addEventListener('click', () => {
    imageViewer.classList.remove('active');
  });

  function updateCallLogsList(logs) {
    callLogsList.innerHTML = '';
    if (logs.length === 0) {
      callLogsList.innerHTML = '<div class="no-rooms">No call history</div>';
      return;
    }
    logs.forEach(log => {
      addCallLogItem(log, false);
    });
  }

  function addCallLogItem(log, prepend = false) {
    const noHistory = callLogsList.querySelector('.no-rooms');
    if (noHistory) {
      callLogsList.innerHTML = '';
    }

    const item = document.createElement('div');
    item.className = 'call-log-item';

    const left = document.createElement('div');
    left.className = 'call-log-left';

    const participants = document.createElement('span');
    participants.className = 'call-log-participants';
    participants.innerText = `${log.caller} ➔ ${log.receiver}`;

    const time = document.createElement('span');
    time.className = 'call-log-time';
    time.innerText = utils.formatTime(log.timestamp);

    left.appendChild(participants);
    left.appendChild(time);

    const duration = document.createElement('span');
    duration.className = 'call-log-duration';
    duration.innerText = utils.formatDuration(log.duration);

    item.appendChild(left);
    item.appendChild(duration);

    if (prepend) {
      callLogsList.insertBefore(item, callLogsList.firstChild);
    } else {
      callLogsList.appendChild(item);
    }
  }
});

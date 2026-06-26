const utils = {
  showToast: (message, type = 'info') => {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      
      const icon = document.createElement('span');
      icon.id = 'toast-icon';
      icon.className = 'toast-icon';
      
      const text = document.createElement('span');
      text.id = 'toast-text';
      text.className = 'toast-text';
      
      container.appendChild(icon);
      container.appendChild(text);
      document.body.appendChild(container);
    }
    
    const iconEl = container.querySelector('.toast-icon');
    const textEl = container.querySelector('.toast-text');
    
    textEl.innerText = message;
    
    if (type === 'success') {
      iconEl.innerText = '✓';
      iconEl.style.color = 'var(--color-success)';
    } else if (type === 'error') {
      iconEl.innerText = '✕';
      iconEl.style.color = 'var(--color-danger)';
    } else {
      iconEl.innerText = 'ℹ';
      iconEl.style.color = 'var(--color-accent)';
    }
    
    container.classList.add('show');
    
    if (window.toastTimeout) {
      clearTimeout(window.toastTimeout);
    }
    
    window.toastTimeout = setTimeout(() => {
      container.classList.remove('show');
    }, 3000);
  },

  formatTime: (timestamp) => {
    const date = new Date(timestamp);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
  },

  formatDuration: (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  getInitials: (name) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  },

  audioContext: null,
  
  getAudioContext: () => {
    if (!utils.audioContext) {
      utils.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return utils.audioContext;
  },

  playMessageSound: () => {
    try {
      const ctx = utils.getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  },

  ringInterval: null,
  
  playRingSound: () => {
    try {
      const ctx = utils.getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      if (utils.ringInterval) return;

      const triggerBeep = () => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, ctx.currentTime);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, ctx.currentTime);

        gain.gain.setValueAtTime(0.0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.05, ctx.currentTime + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        
        osc1.stop(ctx.currentTime + 1.5);
        osc2.stop(ctx.currentTime + 1.5);
      };

      triggerBeep();
      utils.ringInterval = setInterval(triggerBeep, 3000);
    } catch (e) {}
  },

  stopRingSound: () => {
    if (utils.ringInterval) {
      clearInterval(utils.ringInterval);
      utils.ringInterval = null;
    }
  },

  copyToClipboard: (text, successMsg = 'Copied to clipboard') => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => utils.showToast(successMsg, 'success'))
        .catch(() => utils.showToast('Failed to copy', 'error'));
    } else {
      const input = document.createElement('input');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.focus();
      input.select();
      try {
        document.execCommand('copy');
        utils.showToast(successMsg, 'success');
      } catch (err) {
        utils.showToast('Failed to copy', 'error');
      }
      document.body.removeChild(input);
    }
  },

  compressImage: (file, maxWidth, maxHeight, quality) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            resolve({
              blob: blob,
              dataUrl: canvas.toDataURL('image/jpeg', quality)
            });
          }, 'image/jpeg', quality);
        };
      };
    });
  },

  pushSupported: () => {
    return ('serviceWorker' in navigator) &&
           ('PushManager' in window) &&
           ('Notification' in window);
  },

  urlBase64ToUint8Array: (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      output[i] = rawData.charCodeAt(i);
    }
    return output;
  },

  requestNotificationPermission: async () => {
    if (!('Notification' in window)) return 'unsupported';
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (e) {
      return 'denied';
    }
  },

  subscribeToPush: async () => {
    if (!utils.pushSupported()) return null;
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (subscription) return subscription;

    const res = await fetch('/api/push/vapid-public');
    const data = await res.json();
    if (!data || !data.success || !data.publicKey) return null;

    const applicationServerKey = utils.urlBase64ToUint8Array(data.publicKey);
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });
    return subscription;
  },

  sendSubscriptionToServer: async (code, name, subscription) => {
    if (!subscription) return false;
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, subscription })
      });
      const data = await res.json();
      return !!(data && data.success);
    } catch (e) {
      return false;
    }
  },

  removeSubscriptionFromServer: async (code, subscription) => {
    if (!subscription) return false;
    try {
      const res = await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, endpoint: subscription.endpoint })
      });
      const data = await res.json();
      return !!(data && data.success);
    } catch (e) {
      return false;
    }
  }
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

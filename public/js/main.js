document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  const codeInput = document.getElementById('room-code');
  const nameInput = document.getElementById('user-name');
  const form = document.getElementById('join-form');

  const recentSection = document.getElementById('recent-rooms-section');
  const recentList = document.getElementById('recent-rooms-list');

  // Load recent rooms from localStorage
  function loadRecentRooms() {
    const saved = localStorage.getItem('prane_recent_rooms');
    if (!saved) return;
    
    try {
      const rooms = JSON.parse(saved);
      if (rooms.length > 0) {
        recentSection.style.display = 'block';
        recentList.innerHTML = '';
        
        rooms.forEach(room => {
          const item = document.createElement('div');
          item.className = 'recent-room-item';
          item.innerHTML = `
            <span class="recent-room-name">${room.name || 'Private Room'}</span>
            <span class="recent-room-code">${room.code}</span>
          `;
          item.onclick = () => {
            codeInput.value = room.code;
            if (!nameInput.value) nameInput.focus();
            else form.dispatchEvent(new Event('submit'));
          };
          recentList.appendChild(item);
        });
      }
    } catch (e) {
      console.error('Error loading recent rooms', e);
    }
  }

  loadRecentRooms();

  if (codeParam) {
    codeInput.value = codeParam.toUpperCase();
    nameInput.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();

    if (!code || !name) {
      utils.showToast('Please fill all fields', 'error');
      return;
    }

    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name })
      });

      const data = await response.json();

      if (data.success) {
        sessionStorage.setItem('prane_username', name);

        // Save to recent rooms
        const saved = localStorage.getItem('prane_recent_rooms');
        let rooms = [];
        if (saved) {
          try { rooms = JSON.parse(saved); } catch(e) {}
        }
        
        // Remove if exists to push to top
        rooms = rooms.filter(r => r.code !== code);
        rooms.unshift({ code, name: data.roomName || 'Private Room' });
        
        // Keep only last 5 rooms
        if (rooms.length > 5) rooms = rooms.slice(0, 5);
        
        localStorage.setItem('prane_recent_rooms', JSON.stringify(rooms));

        window.location.href = `channel.html?code=${code}`;
      } else {
        utils.showToast(data.error || 'Failed to join', 'error');
      }
    } catch (err) {
      utils.showToast('Server connection error', 'error');
    }
  });
});

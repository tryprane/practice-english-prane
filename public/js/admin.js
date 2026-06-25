document.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('login-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const loginForm = document.getElementById('login-form');
  const passwordInput = document.getElementById('admin-password');
  const logoutBtn = document.getElementById('logout-btn');
  const createForm = document.getElementById('create-room-form');
  const nameInput = document.getElementById('new-room-name');
  const codeInput = document.getElementById('new-room-code');
  const roomsList = document.getElementById('rooms-list');

  let checkInterval = null;

  const getToken = () => sessionStorage.getItem('prane_admin_token');

  const checkAuth = () => {
    const token = getToken();
    if (token) {
      loginScreen.style.display = 'none';
      dashboardScreen.style.display = 'flex';
      fetchRooms();
      startPolling();
    } else {
      loginScreen.style.display = 'flex';
      dashboardScreen.style.display = 'none';
      stopPolling();
    }
  };

  const startPolling = () => {
    if (!checkInterval) {
      checkInterval = setInterval(fetchRooms, 8000);
    }
  };

  const stopPolling = () => {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  };

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value;

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (data.success) {
        sessionStorage.setItem('prane_admin_token', data.token);
        passwordInput.value = '';
        checkAuth();
      } else {
        utils.showToast(data.error || 'Login failed', 'error');
      }
    } catch (err) {
      utils.showToast('Server connection error', 'error');
    }
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('prane_admin_token');
    checkAuth();
  });

  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const customCode = codeInput.value.trim().toUpperCase();
    const token = getToken();

    if (!name) return;

    try {
      const requestBody = { name };
      if (customCode) {
        requestBody.code = customCode;
      }

      const response = await fetch('/api/admin/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (data.success) {
        nameInput.value = '';
        codeInput.value = '';
        utils.showToast('Room created successfully', 'success');
        fetchRooms();
      } else {
        utils.showToast(data.error || 'Failed to create room', 'error');
      }
    } catch (err) {
      utils.showToast('Server connection error', 'error');
    }
  });

  async function fetchRooms() {
    const token = getToken();
    if (!token) return;

    try {
      const response = await fetch('/api/admin/rooms', {
        headers: { 'Authorization': token }
      });

      if (response.status === 403) {
        sessionStorage.removeItem('prane_admin_token');
        checkAuth();
        return;
      }

      const data = await response.json();
      if (data.success) {
        renderRooms(data.rooms);
      }
    } catch (err) {}
  }

  function renderRooms(rooms) {
    roomsList.innerHTML = '';

    if (rooms.length === 0) {
      roomsList.innerHTML = '<div class="no-rooms">No active rooms found. Create one above.</div>';
      return;
    }

    rooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'room-card';

      const info = document.createElement('div');
      info.className = 'room-info';

      const name = document.createElement('span');
      name.className = 'room-name-display';
      name.innerText = room.name;

      const meta = document.createElement('div');
      meta.className = 'room-meta';

      const codeTag = document.createElement('span');
      codeTag.className = 'room-code-tag';
      codeTag.innerText = room.code;

      const count = document.createElement('span');
      count.className = 'room-members-count';
      count.innerText = `(${room.memberCount}/2 members)`;

      meta.appendChild(codeTag);
      meta.appendChild(count);
      info.appendChild(name);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'room-actions';

      const copyCodeBtn = document.createElement('button');
      copyCodeBtn.className = 'btn-icon';
      copyCodeBtn.innerHTML = '⚡';
      copyCodeBtn.title = 'Copy Code';
      copyCodeBtn.addEventListener('click', () => {
        utils.copyToClipboard(room.code, 'Room code copied');
      });

      const copyLinkBtn = document.createElement('button');
      copyLinkBtn.className = 'btn-icon';
      copyLinkBtn.innerHTML = '🔗';
      copyLinkBtn.title = 'Copy Join Link';
      copyLinkBtn.addEventListener('click', () => {
        const joinUrl = `${window.location.protocol}//${window.location.host}/index.html?code=${room.code}`;
        utils.copyToClipboard(joinUrl, 'Join link copied');
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-icon delete';
      deleteBtn.innerHTML = '✕';
      deleteBtn.title = 'Delete Room';
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete room "${room.name}"?`)) {
          deleteRoom(room.code);
        }
      });

      actions.appendChild(copyCodeBtn);
      actions.appendChild(copyLinkBtn);
      actions.appendChild(deleteBtn);

      card.appendChild(info);
      card.appendChild(actions);

      roomsList.appendChild(card);
    });
  }

  async function deleteRoom(code) {
    const token = getToken();
    try {
      const response = await fetch(`/api/admin/rooms/${code}`, {
        method: 'DELETE',
        headers: { 'Authorization': token }
      });

      const data = await response.json();
      if (data.success) {
        utils.showToast('Room deleted', 'success');
        fetchRooms();
      } else {
        utils.showToast(data.error || 'Failed to delete room', 'error');
      }
    } catch (err) {
      utils.showToast('Server connection error', 'error');
    }
  }

  checkAuth();
});

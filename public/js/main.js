document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('code');
  const codeInput = document.getElementById('room-code');
  const nameInput = document.getElementById('user-name');
  const form = document.getElementById('join-form');

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
        window.location.href = `channel.html?code=${code}`;
      } else {
        utils.showToast(data.error || 'Failed to join', 'error');
      }
    } catch (err) {
      utils.showToast('Server connection error', 'error');
    }
  });
});

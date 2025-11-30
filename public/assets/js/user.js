    let currentCode = '';
    
    window.addEventListener('DOMContentLoaded', async () => {
      try {
        const response = await fetch('/api/check-session');
        const data = await response.json();
        
        if (data.authenticated) {
          currentCode = data.giveData.code;
          loadUserData(data);
        }
        
        document.getElementById('submitCodeBtn').addEventListener('click', verifyCode);
        document.getElementById('userLogoutBtn').addEventListener('click', logout);
        document.getElementById('revealSantaBtn').addEventListener('click', revealSanta);
        
        document.querySelectorAll('.saveHintBtn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const hintNumber = e.target.getAttribute('data-hint-number');
            saveHint(hintNumber);
          });
        });
        
        document.getElementById('leftCode').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') verifyCode();
        });
        document.getElementById('revealCode').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') revealSanta();
        });
      } catch (error) {
        console.error('Session check failed:', error);
      }
    });
    
    async function verifyCode() {
      const code = document.getElementById('leftCode').value.trim();
      if (!code) {
        showError('leftError', 'Please enter a code');
        return;
      }
      
      try {
        const response = await fetch('/api/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        
        const data = await response.json();
        
        if (data.success) {
          currentCode = code;
          loadUserData(data);
        } else {
          showError('leftError', data.message || 'Invalid code');
        }
      } catch (error) {
        showError('leftError', 'Error connecting to server');
      }
    }
    
    function loadUserData(data) {
      document.getElementById('giftToName').textContent = data.giveData.gives_to_name;
      document.getElementById('leftCodeEntry').classList.add('hidden');
      document.getElementById('rightCodePlaceholder').classList.add('hidden');
      document.getElementById('leftAssignment').classList.remove('hidden');
      document.getElementById('rightAssignment').classList.remove('hidden');
      
      const receiveData = data.receiveData;
      document.getElementById('displayHint1').textContent = 
        receiveData.hint1 || 'Your Secret Santa hasn\'t set this hint yet!';
      document.getElementById('displayHint2').textContent = 
        receiveData.hint2 || 'Your Secret Santa hasn\'t set this hint yet!';
      document.getElementById('displayHint3').textContent = 
        receiveData.hint3 || 'Your Secret Santa hasn\'t set this hint yet!';
      
      fetchUserHints(currentCode);
    }
    
    async function fetchUserHints(code) {
      try {
        const response = await fetch(`/api/get-hints?code=${encodeURIComponent(code)}`);
        const data = await response.json();
        
        if (data.success) {
          document.getElementById('hint1').value = data.hint1 || '';
          document.getElementById('hint2').value = data.hint2 || '';
          document.getElementById('hint3').value = data.hint3 || '';
          
          displaySavedHints(data.hint1, data.hint2, data.hint3);
        }
      } catch (error) {
        console.error('Error fetching hints:', error);
      }
    }
    
    function displaySavedHints(hint1, hint2, hint3) {
      document.getElementById('displaySavedHint1').textContent = hint1 || 'Not set yet';
      document.getElementById('displaySavedHint2').textContent = hint2 || 'Not set yet';
      document.getElementById('displaySavedHint3').textContent = hint3 || 'Not set yet';
    }
    
    async function saveHint(hintNumber) {
      const hintText = document.getElementById(`hint${hintNumber}`).value.trim();
      
      if (!hintText) {
        showHintMessage(hintNumber, `Please write Hint ${hintNumber}`, 'error');
        return;
      }
      
      try {
        const response = await fetch('/api/save-hint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            code: currentCode, 
            hintNumber: hintNumber,
            hintText: hintText 
          })
        });
        
        const data = await response.json();
        
        if (data.success) {
          showHintMessage(hintNumber, `✅ Hint ${hintNumber} saved!`, 'success');
          document.getElementById(`displaySavedHint${hintNumber}`).textContent = hintText;
        } else {
          showHintMessage(hintNumber, 'Error saving hint', 'error');
        }
      } catch (error) {
        showHintMessage(hintNumber, 'Error connecting to server', 'error');
      }
    }
    
    async function revealSanta() {
      const code = document.getElementById('revealCode').value.trim();
      
      if (!code) {
        showMessage('revealMessage', 'Please enter the code you found', 'error');
        return;
      }
      
      try {
        const response = await fetch('/api/reveal-santa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        
        const data = await response.json();
        
        if (data.success) {
          const revealDiv = document.createElement('div');
          revealDiv.className = 'santa-reveal';
          revealDiv.innerHTML = `
            <h3>🎅 Your Secret Santa was:</h3>
            <div style="font-size: 36px; font-weight: bold; margin: 15px 0; color: #c41e3a;">
              ${data.santa}
            </div>
            <p style="color: #666;">They gave gifts to: ${data.recipient}</p>
          `;
          document.getElementById('revealMessage').innerHTML = '';
          document.getElementById('revealMessage').appendChild(revealDiv);
          document.getElementById('revealMessage').classList.remove('hidden');
        } else {
          showMessage('revealMessage', data.message || 'Invalid code', 'error');
        }
      } catch (error) {
        showMessage('revealMessage', 'Error connecting to server', 'error');
      }
    }
    
    async function logout() {
      if (!confirm('Are you sure you want to logout?')) return;
      
      try {
        await fetch('/api/logout', { method: 'POST' });
        location.reload();
      } catch (error) {
        alert('Error logging out');
      }
    }
    
    function showError(elementId, message) {
      const el = document.getElementById(elementId);
      el.textContent = message;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 5000);
    }
    
    function showMessage(elementId, message, type) {
      const el = document.getElementById(elementId);
      el.className = type === 'success' ? 'success-msg' : 'error-msg';
      el.textContent = message;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 5000);
    }
    
    function showHintMessage(hintNumber, message, type) {
      const el = document.getElementById(`saveMsg${hintNumber}`);
      el.className = type === 'success' ? 'success-msg' : 'error-msg';
      el.textContent = message;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 3000);
    }
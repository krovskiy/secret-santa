    let isLoggedIn = false;
    let refreshInterval = null;
    let revealedGifts = new Set(); 
    let expandedCards = new Set(); 
    
    window.addEventListener('DOMContentLoaded', async () => {
      try {
        const response = await fetch('/api/admin/check-session');
        const data = await response.json();
        console.debug('loadCurrentParticipants: revealedGifts=', Array.from(revealedGifts));
        
        if (data.authenticated) {
          isLoggedIn = true;
          document.getElementById('loginPanel').classList.add('hidden');
          document.getElementById('adminPanel').classList.remove('hidden');
          loadCurrentParticipants();
          startAutoRefresh();
        }
        
        // Add event listeners
        document.getElementById('loginBtn').addEventListener('click', login);
        document.getElementById('logoutBtn').addEventListener('click', logout);
        document.getElementById('regenerateBtn').addEventListener('click', regenerateCodes);
        
        // Allow Enter key in password field
        document.getElementById('password').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') login();
        });
      } catch (error) {
        console.error('Session check failed:', error);
      }
    });
    
    async function login() {
      const password = document.getElementById('password').value;
      
      if (!password) {
        showLoginError('Please enter a password');
        return;
      }
      
      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (data.success) {
          isLoggedIn = true;
          document.getElementById('loginPanel').classList.add('hidden');
          document.getElementById('adminPanel').classList.remove('hidden');
          loadCurrentParticipants();
          startAutoRefresh();
        } else {
          showLoginError('Invalid password');
        }
      } catch (error) {
        showLoginError('Error connecting to server');
      }
    }
    
    async function logout() {
      if (!confirm('Are you sure you want to logout?')) return;
      
      try {
        await fetch('/api/admin/logout', { method: 'POST' });
        stopAutoRefresh();
        location.reload();
      } catch (error) {
        alert('Error logging out');
      }
    }
    
    function startAutoRefresh() {
      refreshInterval = setInterval(() => {
        if (isLoggedIn) {
          loadCurrentParticipants();
        }
      }, 5000);
    }
    
    function stopAutoRefresh() {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    }
    
    async function regenerateCodes() {
      if (!confirm('Are you sure?\n\nThis will:\n• Generate new codes for all 6 participants\n• Create new random assignments\n• Delete all existing hints\n\nContinue?')) {
        return;
      }
      
      try {
        const response = await fetch('/api/admin/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
          revealedGifts.clear(); 
          expandedCards.clear();
          loadCurrentParticipants();
        } else {
          alert('Error generating codes: ' + data.error);
        }
      } catch (error) {
        alert('Error connecting to server');
      }
    }
    
    async function loadCurrentParticipants() {
      try {
        const response = await fetch('/api/admin/participants');
        const data = await response.json();
        // Populate participant names in the info box
        try {
          const namesEl = document.getElementById('participantNames');
          if (namesEl) {
            if (Array.isArray(data) && data.length > 0) {
              namesEl.textContent = data.map(p => p.name).join(', ');
            } else {
              namesEl.textContent = 'None';
            }
          }
        } catch (err) {
          console.warn('Unable to update participantNames element', err);
        }
        
        if (data.length === 0) {
          document.getElementById('assignmentsList').innerHTML = 
            '<p style="text-align: center; color: #666;">No participants yet. Click "Regenerate Codes" to create assignments.</p>';
          return;
        }
        
        let html = '';
        data.forEach(p => {
          const hintsComplete = p.hint1 && p.hint2 && p.hint3;
          let hintStatusClass;
          let hintStatusText;
          if (hintsComplete) {
            hintStatusClass = 'complete';
            hintStatusText = '✓ All hints set';
          } else {
            hintStatusClass = 'incomplete';
            hintStatusText = '⚠ Missing hints';
          }
          
          const isRevealed = revealedGifts.has(String(p.id));
          let givesToDisplay;
          if (isRevealed) {
            givesToDisplay = `<span class="gives-to-revealed" data-participant-id="${p.id}" data-action="toggle-gift">${p.gives_to_name}</span>`;
          } else {
            givesToDisplay = `<span class="gives-to-hidden" data-participant-id="${p.id}" data-action="toggle-gift">[Hidden - Click to reveal]</span>`;
          }
          
          const isExpanded = expandedCards.has(String(p.id));
          let expandedClass;
          let iconClass;
          let hintsHidden;
          if (isExpanded) {
            expandedClass = 'expanded';
            iconClass = 'rotated';
            hintsHidden = '';
          } else {
            expandedClass = '';
            iconClass = '';
            hintsHidden = 'hidden';
          }
          
          html += `
            <div class="participant-card" data-participant-id="${p.id}" data-action="toggle-hints">
              <div class="participant-header">
                <div>
                  <span class="participant-name">${p.name}</span>
                  <span class="hint-status ${hintStatusClass}">${hintStatusText}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 15px; justify-content:center;">
                  <span class="code-value">${p.code}</span>
                  <button class="button-copy" type="button" data-code="${p.code}" data-action="copy-code">Copy</button>
                  <span class="expand-icon ${iconClass}">▼</span>
                </div>
              </div>
              
              <div class="gives-to-container" data-action="prevents-parent">
                <span class="gives-to-label">Gives to:</span>
                ${givesToDisplay}
              </div>
              
              <div class="hints-section ${expandedClass} ${hintsHidden}" id="hints-${p.id}">
                <h4>📝 Hints from ${p.name}:</h4>
                <div class="hint-display">
                  <div class="hint-label">🎁 Hint 1 - First Gift Location:</div>
                  <div class="hint-text ${p.hint1 ? '' : 'hint-empty'}">
                    ${p.hint1 || 'Not set yet'}
                  </div>
                </div>
                <div class="hint-display">
                  <div class="hint-label">🎁 Hint 2 - Second Gift Location:</div>
                  <div class="hint-text ${p.hint2 ? '' : 'hint-empty'}">
                    ${p.hint2 || 'Not set yet'}
                  </div>
                </div>
                <div class="hint-display">
                  <div class="hint-label">📜 Hint 3 - Code Paper Location:</div>
                  <div class="hint-text ${p.hint3 ? '' : 'hint-empty'}">
                    ${p.hint3 || 'Not set yet'}
                  </div>
                </div>
              </div>
            </div>
          `;
        });
        
        document.getElementById('assignmentsList').innerHTML = html;
        attachDynamicListeners();
      } catch (error) {
        document.getElementById('assignmentsList').innerHTML = 
          '<p style="text-align: center; color: #c41e3a;">Error loading participants</p>';
      }
    }
    
    function attachDynamicListeners() {
      // Participant card click to toggle hints
      document.querySelectorAll('[data-action="toggle-hints"]').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-action="prevents-parent"]')) {
            return;
          }
          const participantId = card.getAttribute('data-participant-id');
          toggleHints(participantId);
        });
      });
      
      // Toggle gift reveal
      document.querySelectorAll('[data-action="toggle-gift"]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const participantId = el.getAttribute('data-participant-id');
          toggleGivesTo(participantId);
        });
      });
      
      // Copy code button
      document.querySelectorAll('[data-action="copy-code"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = btn.getAttribute('data-code');
          copyToClipboard(code, btn);
        });
      });
    }
    
    function toggleGivesTo(participantId) {
          const id = String(participantId);
          if (revealedGifts.has(id)) {
            revealedGifts.delete(id);
          } else {
            revealedGifts.add(id);
          }
          loadCurrentParticipants();
    }
    
    function toggleHints(participantId) {
      const id = String(participantId);
      if (expandedCards.has(id)) {
        expandedCards.delete(id);
      } else {
        expandedCards.add(id);
      }
      loadCurrentParticipants();
    }
    function showLoginError(message) {
      const el = document.getElementById('loginError');
      el.textContent = message;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 5000);
    }

    function copyToClipboard(text, btn) {
      navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy code');
      });
    }

    window.addEventListener('beforeunload', stopAutoRefresh);
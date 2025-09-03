// Content script - Main draft assistant logic with proper detection
class DFSAssistant {
  constructor() {
    this.draftId = window.location.pathname.split('/').pop();
    this.draftData = null;
    this.myPosition = null;
    this.myUserId = null;
    this.myEntryId = null;
    this.picks = [];
    this.myPicks = [];
    this.projections = {};
    this.exposures = {};
    this.useMarketProjections = false;
    

    this.positionLimits = {
      'QB': 1,
      'RB': 1,  // 1 RB slot + potentially 1 FLEX
      'WR': 2,  // 2 WR slots
      'TE': 1,  // 1 TE slot + potentially 1 FLEX
      'FLEX': 1 // Can be RB or TE
    };
    
    // Track positions filled
    this.myPositionsFilled = {
      'QB': 0,
      'RB': 0,
      'WR': 0,
      'TE': 0,
      'FLEX': null // Will store 'RB' or 'TE' when filled
    };
    
    this.is12PersonDraft = false; // Will be set in loadDraftData
    
    this.init();
  }

  async init() {
    console.log('🎯 DFS Assistant initializing...');
    console.log('📋 Draft ID:', this.draftId);

    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }
    
    try {
      // Add styles
      const style = document.createElement('style');
      style.textContent = `
        #dfs-assistant {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 320px;
          min-width: 280px;
          max-width: 500px;
          height: 600px;
          min-height: 400px;
          max-height: 90vh;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
          z-index: 99999;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          resize: both;
          overflow: auto;
        }
        
        #dfs-assistant.minimized {
          height: auto;
          min-height: auto;
          resize: none;
        }
        
        #dfs-assistant.minimized .dfs-content,
        #dfs-assistant.minimized .dfs-tabs,
        #dfs-assistant.minimized .dfs-info {
          display: none;
        }
        
        .dfs-header {
          background: #0f0f0f;
          padding: 10px 15px;
          border-radius: 8px 8px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: grab;
          user-select: none;
        }
        
        .dfs-title {
          color: #4CAF50;
          font-weight: 600;
          font-size: 14px;
        }
        
        .dfs-controls {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        
        .dfs-info {
          background: #151515;
          padding: 8px 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          border-bottom: 1px solid #333;
        }
        
        .dfs-tabs {
          display: flex;
          background: #0f0f0f;
          border-bottom: 1px solid #333;
        }
        
        .dfs-tab {
          flex: 1;
          padding: 10px;
          background: none;
          border: none;
          color: #999;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }
        
        .dfs-tab.active {
          color: #4CAF50;
          background: rgba(76, 175, 80, 0.1);
        }
        
        .dfs-content {
          flex: 1;
          overflow: hidden;
          position: relative;
        }
        
        .dfs-panel {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: none;
          flex-direction: column;
        }
        
        .dfs-panel.active {
          display: flex;
        }
        
        .player-list {
          flex: 1;
          overflow-y: auto;
          padding: 0 10px 10px;
        }
        
        .player-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          background: #151515;
          border: 1px solid #222;
          border-radius: 4px;
          margin-bottom: 5px;
          font-size: 13px;
        }
        
        .player-row:hover {
          background: #1f1f1f;
          border-color: #333;
        }
        
        .player-info {
          flex: 1;
          min-width: 0;
        }
        
        .player-name {
          display: block;
          color: #fff;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .player-meta {
          display: block;
          color: #999;
          font-size: 11px;
          margin-top: 2px;
        }
        
        .player-stats {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-right: 8px;
          font-size: 12px;
        }
        
        .projection {
          color: #4CAF50;
          font-weight: 600;
          min-width: 35px;
          text-align: right;
        }
        
        .queue-btn {
          background: none;
          border: 1px solid #4CAF50;
          color: #4CAF50;
          padding: 3px 6px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }
        
        .queue-btn:hover {
          background: #4CAF50;
          color: white;
        }
      `;
      if (document.head) {
        document.head.appendChild(style);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          document.head.appendChild(style);
        });
      }
      
      await this.waitForDraftElements();
      await this.loadDraftData();
      this.createUI();
      await this.loadProjections();
      await this.loadExposures();
      this.injectWebSocketListener();
      this.setupAPIInterceptor();
      this.startMonitoring();
      
      console.log('Ready! Position detection in progress...');
    } catch (error) {
      console.error('Initialization failed:', error);
    }
  }
  
  async waitForDraftElements() {
    return new Promise((resolve) => {
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        
        const playerCells = document.querySelectorAll('[data-testid="player-cell-wrapper"]');
        const hasDraftBoard = document.querySelector('[class*="draftingCell"]') || 
                             document.querySelector('[class*="draft"]');
        
        console.log(`Attempt ${attempts}: Found ${playerCells.length} players`);
        
        if (playerCells.length > 0 && hasDraftBoard) {
          clearInterval(checkInterval);
          console.log(`Players loaded: ${playerCells.length}`);
          resolve();
        } else if (attempts > 30) { // 15 seconds
          clearInterval(checkInterval);
          console.log('Timeout - proceeding without players');
          resolve();
        }
      }, 500);
    });
  }
  
  async loadDraftData() {
    console.log('Loading draft data...');
    
    const is6PersonDraft = window.location.pathname.includes('/tournament/') || 
                          window.location.pathname.includes('/active/');
    const draftSize = is6PersonDraft ? 6 : 12;
    
    // Track draft type
    this.is12PersonDraft = (draftSize === 12);
    
    this.draftData = {
      draft_entries: new Array(draftSize).fill(0).map((_, i) => ({
        id: `entry_${i}`,
        pick_order: i + 1,
        user_id: `user_${i}`
      })),
      picks: []
    };
    
    console.log(`Created ${draftSize}-person draft structure`);
    await this.detectPosition();
  }
  
  async detectPosition() {
    console.log('Starting position detection...');
  
    if (this.detectPositionFromDraftUI()) {
      return;                             
    }                                              
  
    const globalUserId = localStorage.getItem('underdog_user_id');
    if (globalUserId) {
      const entry = this.draftData.draft_entries.find(e => e.user_id === globalUserId);
      if (entry) {
        this.myPosition = entry.pick_order;
        this.myEntryId = entry.id;
        this.myUserId = entry.user_id;
        console.log(`Position ${this.myPosition} detected from global user ID`);
        this.updatePositionDisplay();
        return;
      }
    }
  
    if (this.picks.length > 0) {
      const picksByEntry = {};
      this.picks.forEach(pick => {
        if (!picksByEntry[pick.draft_entry_id]) {
          picksByEntry[pick.draft_entry_id] = [];
        }
        picksByEntry[pick.draft_entry_id].push(pick);
      });
  
      for (const [entryId, entryPicks] of Object.entries(picksByEntry)) {
        if (this.couldWeMakeThesePicks(entryPicks)) {
          const entry = this.draftData.draft_entries.find(e => e.id === entryId);
          if (entry) {
            this.myPosition = entry.pick_order;
            this.myEntryId = entry.id;
            this.myUserId = entry.user_id;
            console.log(`Position ${this.myPosition} detected from pick analysis`);
            this.updatePositionDisplay();
            return;
          }
        }
      }
    }
  
    console.log('Setting up pick ability monitor...');
    this.monitorPickAbility();
  }
  
  couldWeMakeThesePicks(picks) {
    const numEntries = this.draftData.draft_entries.length;
    
    for (let position = 1; position <= numEntries; position++) {
      let allValid = true;
      
      for (const pick of picks) {
        const round = Math.floor((pick.number - 1) / numEntries) + 1;
        const expectedPos = this.getPickPositionInRound(pick.number, round, numEntries);
        
        if (expectedPos !== position) {
          allValid = false;
          break;
        }
      }
      
      if (allValid) {
        return true;
      }
    }
    
    return false;
  }
  
  getPickPositionInRound(pickNumber, round, numEntries) {
    const posInRound = ((pickNumber - 1) % numEntries) + 1;
    
    if (round % 2 === 1) {
      return posInRound;
    } else {
      return numEntries - posInRound + 1;
    }
  }
  
  detectPositionFromDraftUI() {
    const draftCells = document.querySelectorAll('.styles__draftingCell__iJU_v');
    
    // Look for YOUR cell - it has the unique userCell class
    for (let i = 0; i < draftCells.length; i++) {
      const cell = draftCells[i];
      
      // YOUR cell has this special class
      if (cell.classList.contains('styles__userCell__PdbU_')) {
        this.myPosition = i + 1;
        console.log(`Position ${i + 1} detected from userCell class`);
        
        const entry = this.draftData.draft_entries.find(e => e.pick_order === this.myPosition);
        if (entry) {
          this.myEntryId = entry.id;
          this.myUserId = entry.user_id;
          this.updatePositionDisplay();
          return true;
        }
      }
    }
    
    // Fallback: look for "On the clock" if the userCell class isn't found
    const onClockElement = Array.from(document.querySelectorAll('*'))
      .find(el => el.textContent === 'On the clock');
    
    if (onClockElement) {
      const draftCell = onClockElement.closest('.styles__draftingCell__iJU_v');
      if (draftCell) {
        const position = Array.from(draftCells).indexOf(draftCell) + 1;
        this.myPosition = position;
        console.log(`Position ${position} detected from "On the clock"`);
        this.updatePositionDisplay();
        return true;
      }
    }
    
    return false;
  }
  
  setPosition(pos) {
    this.myPosition = pos;
    console.log('Manually set position to:', pos);
    this.updatePositionDisplay();
    
    // Save it
    const entry = this.draftData.draft_entries.find(e => e.pick_order === pos);
    if (entry) {
      this.myEntryId = entry.id;
      this.myUserId = entry.user_id;
      localStorage.setItem(`underdog_entry_${this.draftId}`, entry.id);
    }
    
    // Update UI
    this.updateAvailablePlayers();
    this.updateMyPicks();
    this.updatePickCounter();
  }
  
  monitorPickAbility() {
    if (this.myPosition) {
      console.log('Position already detected, skipping monitor');
      return;
    }
    const observer = new MutationObserver(() => {
      const pickButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
        btn.textContent.includes('Pick') && !btn.disabled
      );
      
      const pickButton = pickButtons[0] || 
                        document.querySelector('button[data-testid="pick-button"]:not([disabled])') ||
                        document.querySelector('[class*="pick"]:not([disabled])');
      
      if (pickButton && !this.myPosition) {
        const currentPick = this.picks.length + 1;
        const numEntries = this.draftData.draft_entries.length;
        const round = Math.ceil(currentPick / numEntries);
        const position = this.getPickPositionInRound(currentPick, round, numEntries);
        
        const entry = this.draftData.draft_entries.find(e => e.pick_order === position);
        if (entry) {
          this.myPosition = position;
          this.myEntryId = entry.id;
          this.myUserId = entry.user_id;
          
          localStorage.setItem(`underdog_entry_${this.draftId}`, entry.id);
          localStorage.setItem('underdog_user_id', entry.user_id);
          
          console.log(`Position ${this.myPosition} detected from pick ability`);
          this.updatePositionDisplay();
          observer.disconnect();
        }
      }
    });
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true, 
      attributes: true,
      attributeFilter: ['disabled']
    });
  }
  
  setupAPIInterceptor() {
    window.addEventListener('message', (event) => {
      if (event.data.type === 'DRAFT_API_RESPONSE') {
        if (event.data.data.draft) {
          this.draftData = event.data.data.draft;
          this.picks = this.draftData.picks || [];
          
          if (!this.myPosition) {
            this.detectPosition();
          }
        }
      }
    });
  }
  
  createUI() {
    if (document.getElementById('dfs-assistant')) return;
    
    if (!document.body) {
      console.log('Waiting for document.body...');
      setTimeout(() => this.createUI(), 100);
      return;
    }
    
    const container = document.createElement('div');
    container.id = 'dfs-assistant';
  
    container.innerHTML = `
      <div class="dfs-header">
        <span class="dfs-title">DFS Assistant - Pos ${this.myPosition || '?'}</span>
        <div class="dfs-controls">
          <button class="dfs-refresh" title="Refresh players">↻</button>
          <label class="dfs-toggle">
            <input type="checkbox" id="proj-toggle" ${this.useMarketProjections ? 'checked' : ''}>
            <span>Market</span>
          </label>
          <button class="dfs-minimize">_</button>
          <button class="dfs-close">×</button>
        </div>
      </div>
      
      <div class="dfs-info">
        <span id="pick-counter">Pick 0/36</span>
        <span id="duplication-warning"></span>
      </div>
      
      <div class="dfs-tabs">
        <button class="dfs-tab active" data-tab="available">Available</button>
        <button class="dfs-tab" data-tab="recommended">Recommended</button>
        <button class="dfs-tab" data-tab="my-team">My Team (0)</button>
        <button class="dfs-tab" data-tab="exposures">Exposures</button>
      </div>
      
      <div class="dfs-content">
        <div id="available-panel" class="dfs-panel active">
          <input type="text" id="player-search" placeholder="Search players..." 
                 style="margin: 10px; padding: 8px; width: calc(100% - 20px); 
                        background: #0f0f0f; border: 1px solid #333; 
                        border-radius: 4px; color: white;">
          <div id="player-list" class="player-list"></div>
        </div>
        
        <div id="recommended-panel" class="dfs-panel">
          <div class="recommendations-header">
            <span>Stack Bonus: +10%</span>
            <span id="dup-warning-count">Duplicates: 0</span>
          </div>
          <div id="recommended-list" class="player-list"></div>
        </div>
        
        <div id="my-team-panel" class="dfs-panel">
          <div class="team-selector-wrapper">
            <select id="team-selector">
              <option value="mine">My Team</option>
              ${this.draftData?.draft_entries ? 
                Array.from({length: this.draftData.draft_entries.length}, (_, i) => 
                  `<option value="${i}">Team ${i + 1}</option>`
                ).join('') : 
                ''
              }
            </select>
          </div>
          <div id="my-team-list" class="player-list"></div>
        </div>
        
        <div id="exposures-panel" class="dfs-panel">
          <div id="exposure-list" class="player-list"></div>
        </div>
      </div>
    `;
    
    document.body.appendChild(container);
    console.log('✅ UI created successfully');
    
    this.makeDraggable(container);
    this.setupUIListeners();
  
    container.style.resize = 'both';
    container.style.overflow = 'auto';
  }
  
  makeDraggable(element) {
    const header = element.querySelector('.dfs-header');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
  
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
  
    function dragStart(e) {
      if (e.target.closest('.dfs-controls')) return;
      
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
      isDragging = true;
      element.style.cursor = 'grabbing';
    }
  
    function drag(e) {
      if (!isDragging) return;
      
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      xOffset = currentX;
      yOffset = currentY;
  
      element.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }
  
    function dragEnd() {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
      element.style.cursor = 'grab';
    }
  }
  
  setupUIListeners() {
    document.querySelectorAll('.dfs-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.dfs-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.dfs-panel').forEach(p => p.classList.remove('active'));
        
        tab.classList.add('active');
        const panel = document.getElementById(`${tab.dataset.tab}-panel`);
        panel.classList.add('active');
        
        if (tab.dataset.tab === 'exposures') {
          this.updateExposureTab();
        } else if (tab.dataset.tab === 'recommended') {
          this.updateRecommendedPlayers();
        }
      });
    });
    
    document.getElementById('proj-toggle')?.addEventListener('change', (e) => {
      this.useMarketProjections = e.target.checked;
      this.loadProjections();
    });
    
    // Team selector listener - CORRECTLY PLACED
    document.getElementById('team-selector')?.addEventListener('change', (e) => {
      if (e.target.value === 'mine') {
        this.updateMyTeamTab();
      } else {
        this.showTeamByPosition(parseInt(e.target.value) + 1);
      }
    });
    
    document.getElementById('player-search')?.addEventListener('input', (e) => {
      this.filterPlayers(e.target.value);
    });
    
    document.querySelector('.dfs-refresh')?.addEventListener('click', () => {
      console.log('Refreshing player data...');
      this.updateAvailablePlayers();
    });
    
    document.querySelector('.dfs-minimize')?.addEventListener('click', () => {
      document.getElementById('dfs-assistant').classList.toggle('minimized');
    });
    
    document.querySelector('.dfs-close')?.addEventListener('click', () => {
      document.getElementById('dfs-assistant').remove();
    });
  }
  
  async loadProjections() {
    const projType = this.useMarketProjections ? 'market' : 'etr';
    
    // First, try to load from Chrome storage (this is where popup.js saves it)
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['etr_projections'], (result) => {
          if (result.etr_projections && result.etr_projections.length > 0) {
            this.projections = {};
            result.etr_projections.forEach(player => {
              // The CSV has "UD Projection" which popup.js maps to "projection"
              if (player.name && player.projection) {
                this.projections[player.name] = player.projection;
                if (player.id) {
                  this.projections[player.id] = player.projection;
                }
              }
            });
            console.log('Loaded projections from storage:', Object.keys(this.projections).length, 'players');
            console.log('Sample projections:', Object.entries(this.projections).slice(0, 3));
            this.updateAvailablePlayers();
            this.updateRecommendedPlayers();
          } else {
            console.log('No projections in Chrome storage, trying backend...');
            this.loadFromBackend(projType);
          }
        });
        return;
      }
    } catch (error) {
      console.log('Chrome storage error:', error);
    }
    
    // Fallback to backend
    this.loadFromBackend(projType);
  }
  
  async loadFromBackend(projType) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_PROJECTIONS',
          projType: projType
        });
        
        console.log('Backend projections response:', response);
        
        if (response && response.success && response.data && response.data.length > 0) {
          this.projections = {};
          response.data.forEach(player => {
            if (player.name && player.projection) {
              this.projections[player.name] = player.projection;
              if (player.id) {
                this.projections[player.id] = player.projection;
              }
            }
          });
          console.log('Loaded projections from backend:', Object.keys(this.projections).length, 'players');
          this.updateAvailablePlayers();
        } else {
          console.log('No projections from backend');
          this.projections = {};
          this.updateAvailablePlayers();
        }
      }
    } catch (error) {
      console.log('Failed to load from backend:', error);
      this.projections = {};
      this.updateAvailablePlayers();
    }
  }
  
  async loadExposures() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_EXPOSURES'
        });
        
        if (response && response.success) {
          this.exposures = response.data;
          this.updateExposureTab();
        }
      }
    } catch (error) {
      console.log('Failed to load exposures:', error);
      this.exposures = {};
    }
  }
  
  updateAvailablePlayers() {
    const container = document.getElementById('player-list');
    if (!container) return;
    
    const players = this.getPlayersFromDOM();
    console.log('Players found:', players.length, players.slice(0, 3));
    
    if (players.length === 0) {
      container.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #999;">
          <p>No players detected</p>
          <p style="font-size: 12px; margin-top: 10px;">
            Make sure you're on a draft page with players visible.
          </p>
        </div>
      `;
      return;
    }
    
    const pickedIds = new Set(this.picks.map(p => p.appearance_id));
    
    const available = players
      .filter(p => !pickedIds.has(p.id))
      .map(p => ({
        ...p,
        projection: this.projections[p.name] || this.projections[p.id] || 0,
        exposure: this.exposures[p.id] || 0
      }))
      .sort((a, b) => {
        if (a.projection === 0 && b.projection === 0) return 0;
        return b.projection - a.projection;
      });
    
    container.innerHTML = available.map(player => `
      <div class="player-row" data-id="${player.id}">
        <div class="player-info">
          <span class="player-name">${player.name}</span>
          <span class="player-meta">${player.position} - ${player.team}</span>
        </div>
        <div class="player-stats">
          ${player.projection > 0 ? 
            `<span class="projection">${player.projection.toFixed(1)}</span>` : 
            '<span class="projection">-</span>'
          }
          <span class="exposure">${player.exposure.toFixed(1)}%</span>
        </div>
        <button class="queue-btn" onclick="window.queuePlayer('${player.name.replace(/'/g, "\\'")}')">★</button>
      </div>
    `).join('');
  }
  
  async updateRecommendedPlayers() {
    const container = document.getElementById('recommended-list');
    if (!container) return;
    
    const players = this.getPlayersFromDOM();
    const pickedIds = new Set(this.picks.map(p => p.appearance_id));
    const currentPick = this.picks.length + 1;
    
    // Get available players and filter by position limits
    const available = players
      .filter(p => !pickedIds.has(p.id))
      .filter(p => {
        // Check if position is available
        const position = p.position;
        
        // QB check - simple, only 1 allowed
        if (position === 'QB' && this.myPositionsFilled['QB'] >= 1) {
          return false;
        }
        
        // WR check - only 2 allowed
        if (position === 'WR' && this.myPositionsFilled['WR'] >= 2) {
          return false;
        }
        
        // RB check - 1 RB slot + potential FLEX
        if (position === 'RB') {
          const rbCount = this.myPositionsFilled['RB'];
          if (rbCount >= 1 && this.myPositionsFilled['FLEX'] !== null) {
            return false; // Both RB and FLEX filled
          }
        }
        
        // TE check - 1 TE slot + potential FLEX
        if (position === 'TE') {
          const teCount = this.myPositionsFilled['TE'];
          if (teCount >= 1 && this.myPositionsFilled['FLEX'] !== null) {
            return false; // Both TE and FLEX filled
          }
        }
        
        return true;
      })
      .map(p => ({
        ...p,
        projection: this.projections[p.name] || 0,
        adp: this.getPlayerADP(p.name) || 999,
        score: 0
      }));
    
    // Calculate value scores
    for (const player of available) {
      let score = player.projection;
      
      // ADP value
      const adpDiff = player.adp - currentPick;
      if (adpDiff > 0) {
        score *= (1 + adpDiff / 100);
      } else {
        score *= (1 + adpDiff / 200);
      }
      
      // Position-specific adjustments
      let positionMultiplier = 1.0;
      
      if (player.position === 'QB' && this.myPositionsFilled['QB'] === 0) {
        positionMultiplier = 1.1; // Boost if no QB yet
      } else if (player.position === 'RB') {
        // Higher value for RBs since they can fill FLEX too
        positionMultiplier = this.myPositionsFilled['RB'] === 0 ? 1.3 : 1.1;
      } else if (player.position === 'WR') {
        positionMultiplier = 1.1 - (this.myPositionsFilled['WR'] * 0.05);
      } else if (player.position === 'TE') {
        // Elite TEs get boost, especially if no TE yet
        positionMultiplier = this.myPositionsFilled['TE'] === 0 ? 1.2 : 1.0;
      }
      
      score *= positionMultiplier;
      
      // Stack bonus
      if (this.hasStackPotential(player)) {
        score *= 1.1;
      }
      
      player.score = score;
    }
    
    // Sort by value
    available.sort((a, b) => b.score - a.score);
    
    // Display with position status
    container.innerHTML = available.slice(0, 20).map(player => {
      let positionStatus = '';
      if (player.position === 'QB') {
        positionStatus = `(${this.myPositionsFilled['QB']}/1)`;
      } else if (player.position === 'WR') {
        positionStatus = `(${this.myPositionsFilled['WR']}/2)`;
      } else if (player.position === 'RB') {
        const flexUsed = this.myPositionsFilled['FLEX'] === 'RB' ? 1 : 0;
        positionStatus = `(${this.myPositionsFilled['RB'] + flexUsed}/2)`;
      } else if (player.position === 'TE') {
        const flexUsed = this.myPositionsFilled['FLEX'] === 'TE' ? 1 : 0;
        positionStatus = `(${this.myPositionsFilled['TE'] + flexUsed}/2)`;
      }
      
      return `
        <div class="player-row">
          <div class="player-info">
            <span class="player-name">${player.name}</span>
            <span class="player-meta">${player.position} ${positionStatus} - ADP: ${player.adp}</span>
          </div>
          <div class="player-stats">
            <span class="projection">${player.projection.toFixed(1)}</span>
            <span class="value-score">${player.score.toFixed(1)}</span>
          </div>
          <button class="queue-btn" onclick="window.queuePlayer('${player.name.replace(/'/g, "\\'")}')">★</button>
        </div>
      `;
    }).join('');
  }
  
  // Add helper method right after updateRecommendedPlayers
  async checkWouldDuplicate(player) {
    if (this.myPicks.length < 4) return false;
    
    try {
      const testPicks = [...this.myPicks.map(p => p.appearance_id), player.id];
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_DUPLICATION',
        data: {
          picks: testPicks,
          userId: this.myUserId
        }
      });
      
      return response?.data?.similarCount > 0;
    } catch (error) {
      console.error('Duplication check failed:', error);
      return false;
    }
  }
  
  getPlayerADP(playerName) {
    const playerElements = document.querySelectorAll('[data-testid="player-cell-wrapper"]');
    
    for (const el of playerElements) {
      const nameEl = el.querySelector('.styles__playerName__FI3Zf');
      if (nameEl && nameEl.textContent.trim() === playerName) {
        // ADP is the FIRST stat value
        const firstStat = el.querySelector('.styles__statValue__Y_ogY');
        if (firstStat) {
          return parseFloat(firstStat.textContent);
        }
      }
    }
    
    // If player not found in current view, return a reasonable default
    return this.picks.length + 15;
  }
  
  hasStackPotential(player) {
    // Check if player can stack with existing picks
    const domPlayers = this.getPlayersFromDOM();
    
    if (player.position === 'WR' || player.position === 'TE') {
      return this.myPicks.some(pick => {
        const picked = domPlayers.find(p => p.id === pick.appearance_id);
        return picked && picked.position === 'QB' && picked.team === player.team;
      });
    }
    
    if (player.position === 'QB') {
      return this.myPicks.some(pick => {
        const picked = domPlayers.find(p => p.id === pick.appearance_id);
        return picked && (picked.position === 'WR' || picked.position === 'TE') && picked.team === player.team;
      });
    }
    
    return false;
  }
  
  updateMyTeamTab() {
    const container = document.getElementById('my-team-list');
    if (!container) return;
    
    const players = this.getPlayerDetails(this.myPicks);
    
    container.innerHTML = players.map((player, index) => `
      <div class="player-row my-pick">
        <div class="player-info">
          <span class="pick-num">${index + 1}.</span>
          <span class="player-name">${player.name}</span>
          <span class="player-meta">${player.position} - ${player.team}</span>
        </div>
        <div class="player-stats">
          ${player.projection > 0 ? 
            `<span class="projection">${player.projection.toFixed(1)}</span>` : 
            '<span class="projection">-</span>'
          }
        </div>
      </div>
    `).join('');
  }

  getPlayersFromDOM() {
    const playerMap = {};
    const playerElements = document.querySelectorAll('[data-testid="player-cell-wrapper"]');
    
    playerElements.forEach(el => {
      const name = el.querySelector('.styles__playerName__FI3Zf')?.textContent?.trim();
      
      // Only process if we have a name AND haven't seen it before
      if (name && !playerMap[name]) {
        const position = el.querySelector('.styles__slotBadge__yq_bc')?.textContent;
        const team = el.querySelector('.styles__matchText__vfe3n')?.textContent?.split(' ')[0];
        const stats = Array.from(el.querySelectorAll('.styles__statValue__Y_ogY'))
          .map(s => s.textContent);
        
        playerMap[name] = {
          id: el.dataset.playerId || 
              el.closest('[data-player-id]')?.dataset.playerId ||
              el.id ||
              name.replace(/\s+/g, '-').toLowerCase(),
          name: name,
          position: position?.trim() || 'UNK',
          team: team?.trim() || 'UNK',
          stats
        };
      }
    });
    
    const players = Object.values(playerMap);
    
    // Only log if count changed significantly
    if (Math.abs(players.length - (this.lastLoggedCount || 0)) > 5) {
      console.log(`Found ${players.length} unique players`);
      this.lastLoggedCount = players.length;
    }
    
    return players;
  }
  
  updateExposureTab() {
    const container = document.getElementById('exposure-list');
    if (!container) return;
    
    const allPlayers = this.getPlayersFromDOM();
    const exposureList = allPlayers
      .map(p => ({
        ...p,
        exposure: this.exposures[p.id] || 0,
        projection: this.projections[p.name] || this.projections[p.id] || 0
      }))
      .filter(p => p.exposure > 0)
      .sort((a, b) => b.exposure - a.exposure);
    
    container.innerHTML = exposureList.map(player => `
      <div class="player-row">
        <div class="player-info">
          <span class="player-name">${player.name}</span>
          <span class="player-meta">${player.position} - ${player.team}</span>
        </div>
        <div class="player-stats">
          <span class="exposure" style="color: ${this.getExposureColor(player.exposure)}">
            ${player.exposure.toFixed(1)}%
          </span>
        </div>
      </div>
    `).join('');
  }
  
  getExposureColor(exposure) {
    if (exposure > 50) return '#f44336';
    if (exposure > 30) return '#ff9800';
    if (exposure > 20) return '#ffc107';
    return '#4caf50';
  }
  
  async checkDuplication() {
    if (this.myPicks.length < 4) return;
    
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const response = await chrome.runtime.sendMessage({
          type: 'CHECK_DUPLICATION',
          data: {
            picks: this.myPicks.map(p => p.appearance_id),
            userId: this.myUserId
          }
        });
        
        if (response && response.success) {
          const warning = document.getElementById('duplication-warning');
          const count = response.data.similarCount;
          
          if (count >= 5) {
            warning.innerHTML = '<span class="dup-error">⚠️ 5/6</span>';
          } else if (count >= 4) {
            warning.innerHTML = '<span class="dup-warning">⚠️ 4/6</span>';
          } else {
            warning.innerHTML = '';
          }
        }
      }
    } catch (error) {
      console.log('Failed to check duplication:', error);
    }
  }
  
  updateMyPicks() {
    if (!this.myPosition) {
      return;
    }
    
    this.myPicks = [];
    this.myPositionsFilled = { 'QB': 0, 'RB': 0, 'WR': 0, 'TE': 0, 'FLEX': null };
    
    const numEntries = this.draftData.draft_entries.length;
    
    this.picks.forEach((pick, index) => {
      const pickNumber = pick.number || index + 1;
      const round = Math.ceil(pickNumber / numEntries);
      const expectedPos = this.getPickPositionInRound(pickNumber, round, numEntries);
      
      if (expectedPos === this.myPosition) {
        this.myPicks.push(pick);
        
        // Track position filled
        const playerInfo = this.getPlayerInfoFromPick(pick);
        if (playerInfo) {
          const position = playerInfo.position;
          
          // Handle FLEX logic
          if (position === 'RB') {
            if (this.myPositionsFilled['RB'] === 0) {
              this.myPositionsFilled['RB']++;
            } else if (this.myPositionsFilled['FLEX'] === null) {
              this.myPositionsFilled['FLEX'] = 'RB';
            }
          } else if (position === 'TE') {
            if (this.myPositionsFilled['TE'] === 0) {
              this.myPositionsFilled['TE']++;
            } else if (this.myPositionsFilled['FLEX'] === null) {
              this.myPositionsFilled['FLEX'] = 'TE';
            }
          } else if (this.myPositionsFilled[position] !== undefined) {
            this.myPositionsFilled[position]++;
          }
        }
      }
    });
    
    console.log('My positions filled:', this.myPositionsFilled);
    
    document.querySelector('[data-tab="my-team"]').textContent = `My Team (${this.myPicks.length})`;
    this.updateMyTeamTab();
    this.checkDuplication();
  }

  getPlayerInfoFromPick(pick) {
    // Try to find in current DOM
    const domPlayers = this.getPlayersFromDOM();
    const player = domPlayers.find(p => 
      p.id === pick.appearance_id || 
      p.name === pick.player_name
    );
    
    if (player) return player;
    
    // Fallback to stored data
    return {
      name: pick.player_name || 'Unknown',
      position: pick.position || '?',
      team: pick.team || '?',
      id: pick.appearance_id
    };
  }
  
  updateAllTeamsView() {
    // Build a map of all teams and their picks
    const teamMap = {};
    const numEntries = this.draftData.draft_entries.length;
    
    // Initialize empty teams
    for (let i = 1; i <= numEntries; i++) {
      teamMap[i] = [];
    }
    
    // Assign picks to teams based on snake draft logic
    this.picks.forEach((pick, index) => {
      const pickNumber = pick.number || index + 1;
      const round = Math.ceil(pickNumber / numEntries);
      const position = this.getPickPositionInRound(pickNumber, round, numEntries);
      
      if (!teamMap[position]) teamMap[position] = [];
      teamMap[position].push(pick);
    });
    
    // Log for debugging
    console.log('📋 TEAM ROSTERS:');
    Object.entries(teamMap).forEach(([pos, picks]) => {
      const indicator = pos == this.myPosition ? '👉' : '  ';
      console.log(`${indicator} Position ${pos}: ${picks.length} picks`);
    });
    
    // Update the team selector dropdown if it exists
    const selector = document.getElementById('team-selector');
    if (selector && selector.value !== 'mine') {
      const selectedPosition = parseInt(selector.value) + 1;
      this.showTeamByPosition(selectedPosition);
    }
  }
  
  showTeamByPosition(position) {
    const container = document.getElementById('my-team-list');
    if (!container) return;
    
    const teamPicks = [];
    const numEntries = this.draftData.draft_entries.length;
    
    // Get picks for this position
    this.picks.forEach((pick, index) => {
      const pickNumber = pick.number || index + 1;
      const round = Math.ceil(pickNumber / numEntries);
      const expectedPos = this.getPickPositionInRound(pickNumber, round, numEntries);
      
      if (expectedPos === position) {
        teamPicks.push(pick);
      }
    });
    
    const players = this.getPlayerDetails(teamPicks);
    
    container.innerHTML = players.map((player, index) => `
      <div class="player-row">
        <div class="player-info">
          <span class="pick-num">${index + 1}.</span>
          <span class="player-name">${player.name}</span>
          <span class="player-meta">${player.position} - ${player.team}</span>
        </div>
        <div class="player-stats">
          ${player.projection > 0 ? 
            `<span class="projection">${player.projection.toFixed(1)}</span>` : 
            '<span class="projection">-</span>'
          }
        </div>
      </div>
    `).join('');
  }
  
  getPlayerDetails(picks) {
    return picks.map(pick => {
      const domPlayers = this.getPlayersFromDOM();
      const player = domPlayers.find(p => p.id === pick.appearance_id) || {
        name: pick.player_name || 'Unknown',
        position: '?',
        team: '?',
        id: pick.appearance_id
      };
      
      return {
        ...player,
        projection: this.projections[player.name] || this.projections[pick.appearance_id] || 0
      };
    });
  }
  
  updatePositionDisplay() {
    const titleElement = document.querySelector('.dfs-title');
    if (titleElement && this.myPosition) {
      titleElement.textContent = `DFS Assistant - Pos ${this.myPosition}`;
    }
  }
  
  injectWebSocketListener() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() { this.remove(); };
    (document.head || document.documentElement).appendChild(script);
  }
  
  startMonitoring() {
    window.addEventListener('message', async (event) => {
      if (event.data.type === 'PUSHER_EVENT' && event.data.event === 'pick_made') {
        await this.handleNewPick(event.data.data);
      }
    });
    
    this.updatePickCounter();
    
    // Initialize player count tracker
    this.lastPlayerCount = 0;
    
    // Reduce update frequency to every 3 seconds instead of 2
    setInterval(() => {
      const players = this.getPlayersFromDOM();
      if (players.length > 0 && Math.abs(this.lastPlayerCount - players.length) > 2) {
        console.log(`Player count changed: ${this.lastPlayerCount} -> ${players.length}`);
        this.lastPlayerCount = players.length;
        this.updateAvailablePlayers();
        this.updateRecommendedPlayers();
      }
    }, 3000);
    
    // Add scroll listener for React virtualized list
    setTimeout(() => {
      const playerContainer = document.querySelector('.styles__playerListWrapper__plWCn');
      if (playerContainer) {
        playerContainer.addEventListener('scroll', this.debounce(() => {
          console.log('Scroll detected, updating players...');
          this.updateAvailablePlayers();
          this.updateRecommendedPlayers();
        }, 500));
      }
    }, 2000); // Wait for container to exist
    
    if (!this.myPosition) {
      this.positionCheckInterval = setInterval(() => {
        if (this.detectPositionFromDraftUI()) {
          clearInterval(this.positionCheckInterval);
        }
      }, 1000);
    }
  }
  
  async handleNewPick(pickData) {
    console.log('📥 RAW PICK DATA:', pickData);
    const pick = typeof pickData === 'string' ? JSON.parse(pickData) : pickData;
    
    // Try to get player info from DOM or data
    const playerInfo = this.getPlayerInfoFromPick(pick);
    pick.position = playerInfo.position; // Store position with pick
    pick.team = playerInfo.team;
    
    // Store the pick
    this.picks.push(pick);
    console.log(`📊 Pick #${this.picks.length}: ${pick.player_name} (${pick.position})`);
    
    // Determine which team made the pick
    const pickNumber = pick.number || this.picks.length;
    const numEntries = this.draftData.draft_entries.length;
    const round = Math.ceil(pickNumber / numEntries);
    const position = this.getPickPositionInRound(pickNumber, round, numEntries);
    
    // Update my picks if it's mine
    if (position === this.myPosition) {
      this.myPicks.push(pick);
      if (this.myPositionsFilled[pick.position] !== undefined) {
        // Handle FLEX logic
        if (pick.position === 'RB') {
          if (this.myPositionsFilled['RB'] === 0) {
            this.myPositionsFilled['RB']++;
          } else if (this.myPositionsFilled['FLEX'] === null) {
            this.myPositionsFilled['FLEX'] = 'RB';
          }
        } else if (pick.position === 'TE') {
          if (this.myPositionsFilled['TE'] === 0) {
            this.myPositionsFilled['TE']++;
          } else if (this.myPositionsFilled['FLEX'] === null) {
            this.myPositionsFilled['FLEX'] = 'TE';
          }
        } else {
          this.myPositionsFilled[pick.position]++;
        }
      }
      console.log('✅ My pick!', pick.position, 'Positions filled:', this.myPositionsFilled);
    }
    
    // Update all UI elements
    this.updateMyPicks();
    this.updateAvailablePlayers();
    this.updateRecommendedPlayers();
    this.updatePickCounter();
    this.updateAllTeamsView();
  }
  
  updatePickCounter() {
    const counter = document.getElementById('pick-counter');
    if (!this.draftData || !this.draftData.draft_entries) {
      if (counter) counter.textContent = 'Loading...';
      return;
    }
  
    const numEntries = this.draftData.draft_entries.length;
    const totalPicks = numEntries * 6;
    const currentPick = this.picks.length + 1;
    
    if (this.picks.length < totalPicks) {
      const round = Math.ceil(currentPick / numEntries);
      const pickInRound = ((currentPick - 1) % numEntries) + 1;
      
      const roundPickEl = document.querySelector('.styles__roundAndPick__XzT0P');
      if (roundPickEl) {
        const text = roundPickEl.textContent;
        counter.textContent = text.replace('|', 'Pick');
      } else {
        counter.textContent = `R${round}.${pickInRound} - Pick ${currentPick}/${totalPicks}`;
      }
    } else {
      counter.textContent = `Complete`;
    }
  }
  
  filterPlayers(searchTerm) {
    const term = searchTerm.toLowerCase();
    document.querySelectorAll('#player-list .player-row').forEach(row => {
      const name = row.querySelector('.player-name').textContent.toLowerCase();
      const meta = row.querySelector('.player-meta').textContent.toLowerCase();
      row.style.display = (name.includes(term) || meta.includes(term)) ? 'flex' : 'none';
    });
  }
  
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  forceRefreshPlayers() {
    console.log('Force refreshing players...');
    const players = this.getPlayersFromDOM();
    console.log(`Found ${players.length} players`);
    this.updateAvailablePlayers();
    this.updateRecommendedPlayers();
    return players.length;
  }
  
  }
  
  window.queuePlayer = function(playerName) {
    console.log('Queueing:', playerName);
    const playerCells = document.querySelectorAll('[data-testid="player-cell-wrapper"]');
    
    for (const cell of playerCells) {
      const nameEl = cell.querySelector('.styles__playerName__FI3Zf');
      if (nameEl && nameEl.textContent.trim() === playerName) {
        const starBtn = cell.querySelector('button[data-testid="button"]:has([data-testid*="star"])') || 
                 cell.querySelector('button.styles__hug__Xpzjq') ||
                 cell.querySelector('button[data-testid="button"]')?.querySelector('[data-testid*="star"]')?.closest('button') ||
                 Array.from(cell.querySelectorAll('button[data-testid="button"]')).find(btn => 
                   btn.querySelector('[data-testid*="star"]')
                 );
        
        if (starBtn) {
          starBtn.click();
          console.log('Successfully queued:', playerName);
          return;
        }
      }
    }
    console.error('Could not find star button for:', playerName);
  };
  
// Initialize immediately and store reference - FIXED VERSION
(function() {
  console.log('Creating DFS Assistant instance...');
  
  try {
    const dfsAssistant = new DFSAssistant();
    
    // CRITICAL: Force store in global window object
    Object.defineProperty(window, 'dfsAssistant', {
      value: dfsAssistant,
      writable: false,
      enumerable: true,
      configurable: true
    });
    
    Object.defineProperty(window, 'dfs', {
      value: dfsAssistant,
      writable: false,
      enumerable: true,
      configurable: true
    });
    
    // Add getter function
    Object.defineProperty(window, 'getDFS', {
      value: function() {
        return dfsAssistant;
      },
      writable: false,
      enumerable: true,
      configurable: true
    });
    
    // Store on element when it exists
    const storeInterval = setInterval(() => {
      const element = document.getElementById('dfs-assistant');
      if (element) {
        element.__dfsAssistant = dfsAssistant;
        console.log('✅ DFS Assistant stored on element');
        clearInterval(storeInterval);
      }
    }, 100);
    
    console.log('✅ DFS Assistant created and stored globally');
    
    // Verify storage worked
    setTimeout(() => {
      console.log('Global access test - window.dfs exists:', !!window.dfs);
    }, 1000);
    
  } catch (error) {
    console.error('❌ Failed to create DFS Assistant:', error);
  }
})();

// Expose to page context for console access
setTimeout(() => {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      let attempts = 0;
      const checkInterval = setInterval(() => {
        const el = document.getElementById('dfs-assistant');
        if (el && el.__dfsAssistant) {
          window.dfs = el.__dfsAssistant;
          window.dfsAssistant = el.__dfsAssistant;
          window.getDFS = () => el.__dfsAssistant;
          console.log('✅ DFS exposed to page - use window.dfs in console');
          clearInterval(checkInterval);
        } else if (++attempts > 50) {
          console.error('Failed to expose DFS to page');
          clearInterval(checkInterval);
        }
      }, 100);
    })();
  `;
  document.head.appendChild(script);
  script.remove();
}, 2000);
// Background script for DFS Assistant
class BackgroundService {
    constructor() {
      this.API_BASE = 'https://chrome-extension-ud-v2-production.up.railway.app';
      this.authToken = null;
      this.etrProjections = [];
      this.init();
    }
  
    init() {
      // Listen for messages from content script
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender).then(sendResponse);
        return true; // Keep message channel open for async response
      });
  
      // Load stored projections on startup
      this.loadStoredProjections();
  
      console.log('Background service initialized');
    }
  
    async loadStoredProjections() {
      try {
        const stored = await chrome.storage.local.get(['etr_projections']);
        if (stored.etr_projections) {
          this.etrProjections = stored.etr_projections;
          console.log(`Loaded ${this.etrProjections.length} projections from storage`);
        }
      } catch (error) {
        console.error('Failed to load stored projections:', error);
      }
    }
  
    async handleMessage(message, sender) {
      try {
        switch (message.type) {
          case 'API_CALL':
            return await this.makeApiCall(message.endpoint, message.method, message.data);
          
          case 'GET_PROJECTIONS':
            if (message.projType === 'etr') {
              // First try local storage
              if (this.etrProjections.length > 0) {
                return { success: true, data: this.etrProjections };
              }
              // Then try backend
              return await this.getProjections(message.projType);
            }
            return await this.getProjections(message.projType);
          
          case 'UPLOAD_PROJECTIONS':
            return await this.uploadProjections(message.data);
          
          case 'RECORD_PICK':
            return await this.recordPick(message.data);
          
          case 'GET_EXPOSURES':
            return await this.getExposures();
          
          case 'CHECK_DUPLICATION':
            return await this.checkDuplication(message.data);
          
          default:
            console.warn('Unknown message type:', message.type);
            return { success: false, error: 'Unknown message type' };
        }
      } catch (error) {
        console.error('Background service error:', error);
        return { success: false, error: error.message };
      }
    }
  
    async makeApiCall(endpoint, method = 'GET', data = null) {
      try {
        const url = endpoint.startsWith('http') ? endpoint : `https://api.underdogfantasy.com/v2${endpoint}`;
        
        const options = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        };
  
        if (this.authToken) {
          options.headers['Authorization'] = this.authToken;
        }
  
        if (data && method !== 'GET') {
          options.body = JSON.stringify(data);
        }
  
        console.log('Making API call:', method, url);
        
        const response = await fetch(url, options);
        const responseData = await response.json();
  
        if (!response.ok) {
          throw new Error(`API call failed: ${response.status}`);
        }
  
        return { success: true, data: responseData };
      } catch (error) {
        console.error('API call failed:', error);
        return { success: false, error: error.message };
      }
    }
  
    async getProjections(projType = 'etr') {
      try {
        const response = await fetch(`${this.API_BASE}/api/projections?type=${projType}`);
        const data = await response.json();
        
        return { success: true, data: data.projections || [] };
      } catch (error) {
        console.error('Failed to get projections:', error);
        // Return local data if backend fails
        if (projType === 'etr' && this.etrProjections.length > 0) {
          return { success: true, data: this.etrProjections };
        }
        return { success: false, error: error.message, data: [] };
      }
    }
  
    async uploadProjections(projectionData) {
      try {
        // Store locally first
        this.etrProjections = projectionData;
        await chrome.storage.local.set({ etr_projections: projectionData });
        
        // Then try backend
        const response = await fetch(`${this.API_BASE}/api/projections`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            projections: projectionData,
            source: 'etr'
          })
        });
  
        const result = await response.json();
        
        if (!response.ok) {
          // Still return success if local storage worked
          return { success: true, data: { count: projectionData.length } };
        }
  
        return { success: true, data: result };
      } catch (error) {
        console.error('Failed to upload projections:', error);
        // Still return success if local storage worked
        return { success: true, data: { count: projectionData.length } };
      }
    }
  
    async recordPick(pickData) {
      try {
        const response = await fetch(`${this.API_BASE}/api/picks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(pickData)
        });
  
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to record pick');
        }
  
        return { success: true, data: result };
      } catch (error) {
        console.error('Failed to record pick:', error);
        return { success: false, error: error.message };
      }
    }
  
    async getExposures() {
      try {
        const response = await fetch(`${this.API_BASE}/api/exposures`);
        const data = await response.json();
        
        return { success: true, data: data.exposures || {} };
      } catch (error) {
        console.error('Failed to get exposures:', error);
        return { success: false, error: error.message, data: {} };
      }
    }
  
    async checkDuplication(teamData) {
      try {
        const response = await fetch(`${this.API_BASE}/api/duplication`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(teamData)
        });
  
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Duplication check failed');
        }
  
        return { success: true, data: result };
      } catch (error) {
        console.error('Duplication check failed:', error);
        return { success: false, error: error.message, data: { isDuplicate: false } };
      }
    }
  }
  
  // Initialize background service
  new BackgroundService();
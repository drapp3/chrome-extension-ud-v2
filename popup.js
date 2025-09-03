// Popup script - Handles ETR CSV upload with correct format
const BACKEND_URL = 'https://chrome-extension-ud-v2-production.up.railway.app';

document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  
  document.getElementById('upload-btn').addEventListener('click', uploadETR);
  
  document.getElementById('inject-button')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    
    try {
      await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ['content.js']
      });
      
      await chrome.scripting.insertCSS({
        target: {tabId: tab.id},
        files: ['styles.css']
      });
      
      showMessage('Assistant injected!', 'success');
    } catch (error) {
      showMessage('Injection failed: ' + error.message, 'error');
    }
  });
});

async function loadStats() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/stats`);
    const stats = await response.json();
    
    document.getElementById('total-drafts').textContent = stats.total_drafts || 0;
    document.getElementById('completed-drafts').textContent = stats.completed_drafts || 0;
    document.getElementById('total-picks').textContent = stats.total_picks || 0;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function uploadETR() {
  const fileInput = document.getElementById('etr-file');
  const file = fileInput.files[0];
  const messageDiv = document.getElementById('message');
  const uploadBtn = document.getElementById('upload-btn');
  
  if (!file) {
    showMessage('Please select a CSV file', 'error');
    return;
  }
  
  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';
  
  try {
    const text = await file.text();
    const players = parseETRCSV(text);
    
    console.log(`Parsed ${players.length} players from CSV`);
    
    // Store in extension storage
    await chrome.storage.local.set({ etr_projections: players });
    
    // Also send to backend
    const response = await fetch(`${BACKEND_URL}/api/upload-etr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ players })
    });
    
    if (response.ok) {
      const result = await response.json();
      showMessage(`Uploaded ${result.count || players.length} players`, 'success');
      fileInput.value = '';
    } else {
      // Still show success if backend fails but local storage worked
      showMessage(`Uploaded ${players.length} players locally`, 'success');
    }
  } catch (error) {
    showMessage('Upload failed: ' + error.message, 'error');
    console.error('Upload error:', error);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload ETR CSV';
  }
}

function parseETRCSV(text) {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV file appears to be empty');
  }
  
  // Parse headers - ETR format has specific column names
  const headers = lines[0].split(',').map(h => h.trim());
  
  // Find column indices based on ETR format
  const columnMap = {
    name: headers.findIndex(h => h === 'Player'),
    position: headers.findIndex(h => h === 'Position'),
    team: headers.findIndex(h => h === 'Team'),
    projection: headers.findIndex(h => h === 'UD Projection'),
    id: headers.findIndex(h => h === 'id'),
    adp: headers.findIndex(h => h === 'ADP'),
    opponent: headers.findIndex(h => h === 'Opponent')
  };
  
  // Validate we found the required columns
  if (columnMap.name === -1) {
    throw new Error('Could not find "Player" column in CSV');
  }
  if (columnMap.projection === -1) {
    throw new Error('Could not find "UD Projection" column in CSV');
  }
  
  const players = [];
  
  // Parse each row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Handle CSV with potential commas in values (wrapped in quotes)
    const values = parseCSVLine(line);
    
    // Extract player data based on column mapping
    const playerName = values[columnMap.name]?.trim();
    const projection = parseFloat(values[columnMap.projection]) || 0;
    
    if (playerName && projection > 0) {
      players.push({
        name: playerName,
        projection: projection,
        position: columnMap.position !== -1 ? values[columnMap.position]?.trim() : '',
        team: columnMap.team !== -1 ? values[columnMap.team]?.trim() : '',
        id: columnMap.id !== -1 ? values[columnMap.id]?.trim() : '',
        adp: columnMap.adp !== -1 ? parseFloat(values[columnMap.adp]) || 999 : 999,
        opponent: columnMap.opponent !== -1 ? values[columnMap.opponent]?.trim() : ''
      });
    }
  }
  
  return players;
}

// Parse a single CSV line handling quoted values
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  
  return values;
}

function showMessage(text, type) {
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  
  setTimeout(() => {
    messageDiv.textContent = '';
    messageDiv.className = 'message';
  }, 3000);
}
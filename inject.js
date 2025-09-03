// Injected script to intercept Pusher WebSocket events and API calls
(function() {
  console.log('DFS Assistant WebSocket Interceptor Active');
  
  // Store original constructors
  const OriginalWebSocket = window.WebSocket;
  const OriginalFetch = window.fetch;
  const OriginalXHR = window.XMLHttpRequest;
  
  // Intercept WebSocket
  window.WebSocket = function(url, protocols) {
    console.log('WebSocket connection:', url);
    
    const ws = new OriginalWebSocket(url, protocols);
    
    // Store reference for Pusher connections
    if (url.includes('pusher') || url.includes('ws.underdogfantasy.com')) {
      window.__dfsAssistantWebSocket = ws;
      
      // Intercept incoming messages
      ws.addEventListener('message', function(event) {
        try {
          const data = JSON.parse(event.data);
          
          // Forward draft-related events to content script
          if (data.channel && data.channel.includes('draft-') || 
              data.event === 'pick_made' ||
              data.event === 'draft_started' ||
              data.event === 'draft_completed') {
            
            window.postMessage({
              type: 'PUSHER_EVENT',
              channel: data.channel,
              event: data.event,
              data: data.data
            }, '*');
          }
        } catch (e) {
          // Not JSON, ignore
        }
      });
    }
    
    return ws;
  };
  
  // Copy WebSocket properties
  Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  Object.keys(OriginalWebSocket).forEach(key => {
    window.WebSocket[key] = OriginalWebSocket[key];
  });
  
  // Intercept Pusher if available
  if (window.Pusher) {
    interceptPusher();
  } else {
    // Wait for Pusher to load
    let checkCount = 0;
    const pusherCheck = setInterval(() => {
      if (window.Pusher) {
        clearInterval(pusherCheck);
        interceptPusher();
      } else if (++checkCount > 100) { // 10 seconds timeout
        clearInterval(pusherCheck);
      }
    }, 100);
  }
  
  function interceptPusher() {
    console.log('Intercepting Pusher');
    
    const OriginalPusher = window.Pusher;
    
    // Create proxy for Pusher constructor
    window.Pusher = function(...args) {
      const instance = new OriginalPusher(...args);
      window.__dfsAssistantPusher = instance;
      
      // Intercept subscribe method
      const originalSubscribe = instance.subscribe.bind(instance);
      instance.subscribe = function(channelName) {
        console.log('Subscribing to channel:', channelName);
        const channel = originalSubscribe(channelName);
        
        // Only intercept draft channels
        if (channelName.includes('draft-')) {
          // Store channel reference
          window.__dfsAssistantDraftChannel = channel;
          
          // Intercept bind method
          const originalBind = channel.bind.bind(channel);
          channel.bind = function(eventName, callback) {
            console.log('Binding to event:', eventName);
            
            // Wrap the callback
            const wrappedCallback = function(data) {
              console.log('🎯 PUSHER EVENT:', eventName, data);
              
              // Forward to content script
              window.postMessage({
                type: 'PUSHER_EVENT',
                channel: channelName,
                event: eventName,
                data: data
              }, '*');
              
              return callback(data);
            };
            
            return originalBind(eventName, wrappedCallback);
          };
          
          // Also intercept bind_global if it exists
          if (channel.bind_global) {
            const originalBindGlobal = channel.bind_global.bind(channel);
            channel.bind_global = function(callback) {
              const wrappedCallback = function(eventName, data) {
                // Forward to content script
                window.postMessage({
                  type: 'PUSHER_EVENT',
                  channel: channelName,
                  event: eventName,
                  data: data
                }, '*');
                
                // Call original callback
                return callback(eventName, data);
              };
              
              return originalBindGlobal(wrappedCallback);
            };
          }
        }
        
        return channel;
      };
      
      return instance;
    };
    
    // Copy Pusher static properties
    Object.keys(OriginalPusher).forEach(key => {
      window.Pusher[key] = OriginalPusher[key];
    });
    window.Pusher.prototype = OriginalPusher.prototype;
  }
  
  // Intercept fetch for API monitoring
  window.fetch = function(...args) {
    const [url, config] = args;
    
    // Log draft API calls
    if (url && (url.includes('/v2/drafts/') || url.includes('/v1/picks'))) {
      console.log('API call intercepted:', url);
      
      return OriginalFetch.apply(this, args).then(response => {
        // Clone response to read it
        const clone = response.clone();
        
        clone.json().then(data => {
          // Forward draft data to content script
          window.postMessage({
            type: 'API_RESPONSE',
            url: url,
            method: config?.method || 'GET',
            data: data
          }, '*');
          
          // Special handling for draft data
          if (url.includes('/v2/drafts/') && data.draft) {
            window.__dfsAssistantDraftData = data;
          }
        }).catch(() => {
          // Not JSON response
        });
        
        return response;
      });
    }
    
    return OriginalFetch.apply(this, args);
  };
  
  // Intercept XMLHttpRequest
  window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    let method, url;
    
    xhr.open = function(m, u, ...args) {
      method = m;
      url = u;
      return originalOpen.apply(xhr, [m, u, ...args]);
    };
    
    xhr.send = function(...args) {
      if (url && (url.includes('/v2/drafts/') || url.includes('/v1/picks'))) {
        xhr.addEventListener('load', function() {
          try {
            const data = JSON.parse(xhr.responseText);
            window.postMessage({
              type: 'API_RESPONSE',
              url: url,
              method: method,
              data: data
            }, '*');
          } catch (e) {
            // Not JSON
          }
        });
      }
      
      return originalSend.apply(xhr, args);
    };
    
    return xhr;
  };
  
  // Helper functions exposed to console for debugging
  window.__dfsAssistant = {
    checkConnections: function() {
      console.log('=== DFS Assistant Debug Info ===');
      console.log('WebSocket:', window.__dfsAssistantWebSocket);
      console.log('Pusher instance:', window.__dfsAssistantPusher);
      console.log('Draft channel:', window.__dfsAssistantDraftChannel);
      console.log('Draft data:', window.__dfsAssistantDraftData);
      
      if (window.__dfsAssistantPusher) {
        console.log('Pusher state:', window.__dfsAssistantPusher.connection.state);
        const channels = window.__dfsAssistantPusher.channels;
        console.log('Active channels:', Object.keys(channels.channels || {}));
      }
    },
    
    getDraftData: function() {
      return window.__dfsAssistantDraftData;
    },
    
    simulatePick: function(playerId) {
      // Useful for testing
      window.postMessage({
        type: 'PUSHER_EVENT',
        channel: 'draft-test',
        event: 'pick_made',
        data: {
          appearance_id: playerId,
          number: 1,
          draft_entry_id: 'test'
        }
      }, '*');
    }
  };
  
  console.log('WebSocket interception ready. Use __dfsAssistant.checkConnections() to debug.');
})();

// Queue player function for DFS Assistant
window.queuePlayer = function(playerName) {
  console.log('Queueing:', playerName);
  const playerCells = document.querySelectorAll('[data-testid="player-cell-wrapper"]');
  
  for (const cell of playerCells) {
    const nameEl = cell.querySelector('.styles__playerName__FI3Zf');
    if (nameEl && nameEl.textContent.trim() === playerName) {
      const starBtn = cell.querySelector('button[data-testid="button"]');
      if (starBtn) {
        starBtn.click();
        console.log('Successfully queued:', playerName);
        return;
      }
    }
  }
  console.error('Could not find star button for:', playerName);
};
console.log('Queue function ready');
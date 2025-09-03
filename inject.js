// Injected script to intercept Pusher WebSocket events and API calls
(function() {
  console.log('DFS Assistant WebSocket Interceptor Active');
  
  // Store original constructors
  const OriginalWebSocket = window.WebSocket;
  const OriginalFetch = window.fetch;
  const OriginalXHR = window.XMLHttpRequest;
  
  // IMPROVED: Intercept Pusher BEFORE it loads
  const OriginalPusher = window.Pusher;
  
  Object.defineProperty(window, 'Pusher', {
    get: function() {
      return PusherProxy;
    },
    set: function(value) {
      console.log('🎯 Pusher being loaded, intercepting...');
      createPusherProxy(value);
    },
    configurable: true
  });
  
  function createPusherProxy(RealPusher) {
    PusherProxy = function(...args) {
      console.log('🔌 Pusher instantiated');
      const instance = new RealPusher(...args);
      window.__dfsAssistantPusher = instance;
      
      // Intercept subscribe
      const originalSubscribe = instance.subscribe.bind(instance);
      instance.subscribe = function(channelName) {
        console.log('📡 Subscribing to channel:', channelName);
        const channel = originalSubscribe(channelName);
        
        if (channelName.includes('draft-')) {
          window.__dfsAssistantDraftChannel = channel;
          
          // Intercept bind
          const originalBind = channel.bind.bind(channel);
          channel.bind = function(eventName, callback) {
            console.log('🎯 Binding to event:', eventName);
            
            const wrappedCallback = function(data) {
              console.log(`📥 ${eventName} event:`, data);
              
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
          
          // Also intercept bind_global
          if (channel.bind_global) {
            const originalBindGlobal = channel.bind_global.bind(channel);
            channel.bind_global = function(callback) {
              const wrappedCallback = function(eventName, data) {
                console.log(`📥 Global event: ${eventName}`, data);
                
                window.postMessage({
                  type: 'PUSHER_EVENT',
                  channel: channelName,
                  event: eventName,
                  data: data
                }, '*');
                
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
    
    // Copy static properties
    Object.keys(RealPusher).forEach(key => {
      PusherProxy[key] = RealPusher[key];
    });
    PusherProxy.prototype = RealPusher.prototype;
  }
  
  // Initial proxy (will be updated when real Pusher loads)
  let PusherProxy = OriginalPusher || function() {
    console.warn('Pusher not loaded yet');
  };
  
  if (OriginalPusher) {
    createPusherProxy(OriginalPusher);
  }
  
  // Keep your existing WebSocket interception
  window.WebSocket = function(url, protocols) {
    console.log('WebSocket connection:', url);
    
    const ws = new OriginalWebSocket(url, protocols);
    
    if (url.includes('pusher') || url.includes('ws.underdogfantasy.com')) {
      window.__dfsAssistantWebSocket = ws;
      
      ws.addEventListener('message', function(event) {
        try {
          const data = JSON.parse(event.data);
          
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
          // Not JSON
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
  
  // Keep your existing fetch interceptor
  window.fetch = function(...args) {
    const [url, config] = args;
    
    if (url && (url.includes('/v2/drafts/') || url.includes('/v1/picks'))) {
      console.log('API call intercepted:', url);
      
      return OriginalFetch.apply(this, args).then(response => {
        const clone = response.clone();
        
        clone.json().then(data => {
          window.postMessage({
            type: 'API_RESPONSE',
            url: url,
            method: config?.method || 'GET',
            data: data
          }, '*');
          
          if (url.includes('/v2/drafts/') && data.draft) {
            window.__dfsAssistantDraftData = data;
          }
        }).catch(() => {});
        
        return response;
      });
    }
    
    return OriginalFetch.apply(this, args);
  };
  
  // Keep your existing XHR interceptor
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
          } catch (e) {}
        });
      }
      
      return originalSend.apply(xhr, args);
    };
    
    return xhr;
  };
  
  // Keep your existing helper functions
  window.__dfsAssistant = {
    checkConnections: function() {
      console.log('=== DFS Assistant Debug Info ===');
      console.log('WebSocket:', window.__dfsAssistantWebSocket);
      console.log('Pusher instance:', window.__dfsAssistantPusher);
      console.log('Draft channel:', window.__dfsAssistantDraftChannel);
      console.log('Draft data:', window.__dfsAssistantDraftData);
      
      if (window.__dfsAssistantPusher) {
        console.log('Pusher state:', window.__dfsAssistantPusher.connection?.state);
        const channels = window.__dfsAssistantPusher.channels;
        console.log('Active channels:', channels ? Object.keys(channels.channels || {}) : 'None');
      }
    },
    
    getDraftData: function() {
      return window.__dfsAssistantDraftData;
    },
    
    simulatePick: function(playerId) {
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

// Keep your queue player function
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
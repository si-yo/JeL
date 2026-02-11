/**
 * Lab - Preload Script
 * Bridge securise entre main et renderer
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('labAPI', {
  // Jupyter server
  jupyter: {
    start: (options) => ipcRenderer.invoke('jupyter:start', options),
    stop: () => ipcRenderer.invoke('jupyter:stop'),
    status: () => ipcRenderer.invoke('jupyter:status'),
    onStopped: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('jupyter:stopped', listener);
      return () => ipcRenderer.removeListener('jupyter:stopped', listener);
    },
  },

  // File system
  fs: {
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
    readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  },

  // Dialogs
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },

  // App
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),

  // Project
  project: {
    create: (params) => ipcRenderer.invoke('project:create', params),
    open: (dirPath) => ipcRenderer.invoke('project:open', dirPath),
    save: (dirPath, data) => ipcRenderer.invoke('project:save', dirPath, data),
    listNotebooks: (dirPath) => ipcRenderer.invoke('project:listNotebooks', dirPath),
    getFavorites: () => ipcRenderer.invoke('project:getFavorites'),
    saveFavorites: (favorites) => ipcRenderer.invoke('project:saveFavorites', favorites),
    close: () => ipcRenderer.invoke('project:close'),
  },

  // Venv
  venv: {
    status: () => ipcRenderer.invoke('venv:status'),
  },

  // IPFS
  ipfs: {
    available: () => ipcRenderer.invoke('ipfs:available'),
    repoExists: () => ipcRenderer.invoke('ipfs:repoExists'),
    init: () => ipcRenderer.invoke('ipfs:init'),
    daemonStart: () => ipcRenderer.invoke('ipfs:daemonStart'),
    daemonStop: () => ipcRenderer.invoke('ipfs:daemonStop'),
    status: () => ipcRenderer.invoke('ipfs:status'),
    addData: (params) => ipcRenderer.invoke('ipfs:addData', params),
    cat: (params) => ipcRenderer.invoke('ipfs:cat', params),
    pubsubSubscribe: (params) => ipcRenderer.invoke('ipfs:pubsubSubscribe', params),
    pubsubPublish: (params) => ipcRenderer.invoke('ipfs:pubsubPublish', params),
    pubsubUnsubscribe: (params) => ipcRenderer.invoke('ipfs:pubsubUnsubscribe', params),
    pubsubPeers: (params) => ipcRenderer.invoke('ipfs:pubsubPeers', params),
    swarmPeers: () => ipcRenderer.invoke('ipfs:swarmPeers'),
    getNodeInfo: () => ipcRenderer.invoke('ipfs:getNodeInfo'),
    swarmConnect: (params) => ipcRenderer.invoke('ipfs:swarmConnect', params),
    swarmKeyGenerate: () => ipcRenderer.invoke('ipfs:swarmKeyGenerate'),
    swarmKeyList: () => ipcRenderer.invoke('ipfs:swarmKeyList'),
    swarmKeySave: (entry) => ipcRenderer.invoke('ipfs:swarmKeySave', entry),
    swarmKeyDelete: (name) => ipcRenderer.invoke('ipfs:swarmKeyDelete', name),
    swarmKeyApply: (name) => ipcRenderer.invoke('ipfs:swarmKeyApply', name),
    swarmKeyClear: () => ipcRenderer.invoke('ipfs:swarmKeyClear'),
    swarmKeyActive: () => ipcRenderer.invoke('ipfs:swarmKeyActive'),
    onSwarmChanged: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('ipfs:swarm-changed', listener);
      return () => ipcRenderer.removeListener('ipfs:swarm-changed', listener);
    },
    onPubsubMessage: (callback) => {
      const listener = (_event, msg) => callback(msg);
      ipcRenderer.on('ipfs:pubsub-message', listener);
      return () => ipcRenderer.removeListener('ipfs:pubsub-message', listener);
    },
  },

  // Notebook export
  notebook: {
    exportPDF: (data) => ipcRenderer.invoke('notebook:exportPDF', data),
  },

  // Pip package manager
  pip: {
    install: (params) => ipcRenderer.invoke('pip:install', params),
    list: () => ipcRenderer.invoke('pip:list'),
    onOutput: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('pip:output', listener);
      return () => ipcRenderer.removeListener('pip:output', listener);
    },
  },

  // Mobile bridge
  bridge: {
    start: () => ipcRenderer.invoke('bridge:start'),
    stop: () => ipcRenderer.invoke('bridge:stop'),
    status: () => ipcRenderer.invoke('bridge:status'),
    onClientCount: (callback) => {
      const listener = (_event, count) => callback(count);
      ipcRenderer.on('bridge:client-count', listener);
      return () => ipcRenderer.removeListener('bridge:client-count', listener);
    },
    onRequest: (callback) => {
      const listener = (_event, req) => callback(req);
      ipcRenderer.on('bridge:request', listener);
      return () => ipcRenderer.removeListener('bridge:request', listener);
    },
    respond: (wsId, data) => ipcRenderer.send('bridge:response', { wsId, data }),
    broadcast: (data) => ipcRenderer.send('bridge:broadcast', data),
  },

  // Menu events (main -> renderer)
  onMenuEvent: (callback) => {
    const channels = [
      'menu:new-notebook',
      'menu:open-notebook',
      'menu:save',
      'menu:save-as',
      'menu:start-jupyter',
      'menu:stop-jupyter',
      'menu:restart-kernel',
      'menu:interrupt-kernel',
      'menu:new-project',
      'menu:open-project',
      'menu:close-project',
    ];
    const listeners = channels.map((channel) => {
      const listener = () => callback(channel.replace('menu:', ''));
      ipcRenderer.on(channel, listener);
      return { channel, listener };
    });
    return () => {
      listeners.forEach(({ channel, listener }) => {
        ipcRenderer.removeListener(channel, listener);
      });
    };
  },
});

class StateManager {
  constructor() {
    this._activeSpawns = {};
    this._activeColumns = {};
    this._pendingVerifications = {};
    this._pendingClosures = {};
    this._confirmationMessages = {};
  }

  // Generic getters/setters
  get activeSpawns() { return this._activeSpawns; }
  set activeSpawns(val) { this._activeSpawns = val; }
  get activeColumns() { return this._activeColumns; }
  set activeColumns(val) { this._activeColumns = val; }
  get pendingVerifications() { return this._pendingVerifications; }
  set pendingVerifications(val) { this._pendingVerifications = val; }
  get pendingClosures() { return this._pendingClosures; }
  set pendingClosures(val) { this._pendingClosures = val; }
  get confirmationMessages() { return this._confirmationMessages; }
  set confirmationMessages(val) { this._confirmationMessages = val; }

  // Individual entry management
  addActiveSpawn(threadId, data) { this._activeSpawns[threadId] = data; }
  removeActiveSpawn(threadId) { delete this._activeSpawns[threadId]; }
  getActiveSpawn(threadId) { return this._activeSpawns[threadId]; }

  addPendingVerification(threadId, data) { this._pendingVerifications[threadId] = data; }
  removePendingVerification(threadId) { delete this._pendingVerifications[threadId]; }

  addPendingClosure(threadId, data) { this._pendingClosures[threadId] = data; }
  removePendingClosure(threadId) { delete this._pendingClosures[threadId]; }

  addConfirmationMessage(threadId, msgId) {
    if (!this._confirmationMessages[threadId]) this._confirmationMessages[threadId] = [];
    this._confirmationMessages[threadId].push(msgId);
  }

  clear() {
    this._activeSpawns = {};
    this._activeColumns = {};
    this._pendingVerifications = {};
    this._pendingClosures = {};
    this._confirmationMessages = {};
  }

  getStats() {
    return {
      activeSpawns: Object.keys(this._activeSpawns).length,
      activeColumns: Object.keys(this._activeColumns).length,
      pendingVerifications: Object.keys(this._pendingVerifications).length,
      pendingClosures: Object.keys(this._pendingClosures).length,
      confirmationMessages: Object.keys(this._confirmationMessages).length,
    };
  }
}

const stateManager = new StateManager();
module.exports = stateManager;

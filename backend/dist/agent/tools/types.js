"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingActions = exports.currentScanResult = void 0;
exports.setCurrentScanResult = setCurrentScanResult;
exports.clearPendingActions = clearPendingActions;
// Shared state for the scanned project
exports.currentScanResult = null;
function setCurrentScanResult(repoPath, classes) {
    exports.currentScanResult = { repoPath, classes };
}
// Collector for frontend actions triggered by tools
exports.pendingActions = [];
function clearPendingActions() {
    const actions = [...exports.pendingActions];
    exports.pendingActions = [];
    return actions;
}

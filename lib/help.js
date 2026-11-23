'use strict';

/**
 * The answer of the message `help`: what the instance answers, written for AI agents (e.g. ioBroker.pi-agent,
 * or the MCP server with `send_to`) and script authors. Keep it in sync with `onMessage` in main.js and
 * SCENE_COMMANDS in lib/scenes.js.
 */

/** Every command `onMessage` answers; `write` = the command changes something */
const COMMANDS = [
    { command: 'help', write: false },
    // messages
    { command: 'notify', write: true },
    { command: 'message', write: true },
    { command: 'notifyAck', write: true },
    { command: 'notifyDismiss', write: true },
    // scenes
    { command: 'sceneStatus', write: false },
    { command: 'listScenes', write: false },
    { command: 'sceneDevices', write: false },
    { command: 'saveScene', write: true },
    { command: 'deleteScene', write: true },
    // states and widgets
    { command: 'staggeredWrite', write: true },
    { command: 'listTimers', write: false },
    { command: 'listCountdowns', write: false },
    { command: 'listLists', write: false },
    { command: 'listPanels', write: false },
    { command: 'getRecentLogs', write: false },
    // maintenance (adapter-status and script-status widgets)
    { command: 'adapterUpdates', write: false },
    { command: 'updateInfo', write: true },
    { command: 'restartAdapter', write: true },
    { command: 'upgradeAdapter', write: true },
    { command: 'setScriptEnabled', write: true },
    // dashboards and settings
    { command: 'announcementTest', write: true },
    { command: 'announcementEdit', write: true },
    { command: 'statusDiscover', write: false },
    { command: 'autolistSync', write: true },
    { command: 'auraPing', write: false },
    { command: 'ping', write: false },
    { command: 'checkDps', write: false },
    { command: 'renderReport', write: true },
    { command: 'perfLog', write: true },
    { command: 'getLoadHistory', write: false },
    { command: 'perfBreakdown', write: true },
    { command: 'getPerfBreakdown', write: false },
    { command: 'renameTimer', write: true },
    { command: 'deleteTimer', write: true },
    { command: 'renameCountdown', write: true },
    { command: 'deleteCountdown', write: true },
    { command: 'deleteList', write: true },
    { command: 'deletePanel', write: true },
    { command: 'webComponentsRepo', write: false },
    { command: 'generateMcpToken', write: false },
    { command: 'listWebInstances', write: false },
    { command: 'webInstanceNote', write: false },
    { command: 'listSocketBackends', write: false },
    { command: 'checkBackend', write: true },
];

const HELP = `ioBroker.aura: a dashboard (visualization) for ioBroker in the browser, on wall tablets and phones. Every
open dashboard is a client with its own ID (clients.<id>.info.name holds its name). An agent can show messages
(toasts with buttons) on the dashboards, let them speak or play sounds, open popups, switch tabs, manage scenes,
run countdowns and write a group of states one after another. Dashboards are built with Aura's own MCP server
(POST /mcp, settings "AI access (MCP)"), not with sendTo.

Commands (sendTo aura.0):
- notify (alias message) {title?, text?, html?, image?, icon?, view?, dp?, severity?, id?, durationSec?,
  requireAck?, persist?, priority?, position?, actions?, ackDp?, ackValue?, target?, speak?, ...look} or a plain
  text: shows a message on the dashboards and keeps it in the history: {ok, id, ts} or {ok: false, error}.
  At least one of title, text, html, image or view. severity info (default), success, warning, error.
  title and text may hold HTML and [[<state id>]] for the live value. durationSec: seconds until it closes,
  0 = stays open (default from the settings by severity). requireAck true = only the confirm button closes it.
  id: the same id replaces an earlier message. persist false = not kept in the history. priority 0-100.
  position: top-left, top-center, top-right, center-left, center, center-right, bottom-left ... bottom-right.
  actions: up to 6 buttons [{label, dp, value?, close?}]; a click writes value (empty = true) to the state dp.
  ackDp / ackValue: state and value written on confirmation. target {clients?: [client ids], layout?, tab?}
  (slug, id or name; default all dashboards). speak true = read it out. view: a popup view as content, dp its
  state. icon: a Lucide or Iconify id. look: width, height (px), transparency (0-95), appearance (bar, filled,
  outline, plain), align (left, center, right), color, background, textColor, showTime, timeFormat (time,
  datetime).
- notifyAck / notifyDismiss {id} or the id as text ("*" = all): confirms / closes a message: {ok, id}.
- listScenes: all scenes of the scenes adapter: {ok, scenes: [{id, name, own, enabled, memberCount, members?}]}.
  own = made by Aura (scene.0.aura.*); only these list members [{id, value}]. A scene is switched on by writing
  true to its id (a state), not by sendTo.
- sceneStatus: the scenes adapter: {ok, instance, installed, running}.
- sceneDevices {ids}: states as scene members: {ok, devices: [{id, name, type, unit, min, max, step, states,
  value, problem}]}; problem (invalid, forbidden, missing, no state, read-only) = cannot be a member.
- saveScene {id?, name, members: [<state id> or {id, value?}]}: without id creates scene.0.aura.<name> (needs the
  scenes adapter), with id changes that own scene. A member without value takes its current value. Members:
  writable states outside system.* and scene.*, at most 100: {ok, id, missing: [members without a value]}.
- deleteScene {id}: deletes a scene made by Aura (scene.0.aura.*): {ok}.
- staggeredWrite {key, items: [{id, val, delayMs?}], cancel?}: writes the states (ack false), each delayMs
  (0-600000) after the start, also when no dashboard is open: {ok, scheduled (number of delayed writes)}.
  At most 200 items; not writable states are skipped. key (letters, digits, _ . : -) names the run: a new run
  with the same key replaces the pending writes, {key, cancel: true} drops them: {ok, cancelled}.
- listTimers / listCountdowns / listLists / listPanels: the widgets of that kind with states (timers.<id>,
  countdowns.<id>, lists.<id>, panels.<id>): {ok, items: [{id, name}]}.
- getRecentLogs {sinceSeq?, instances?}: the last 500 log lines of all adapters: {ok, entries: [{seq, severity,
  ts, message, from}], latestSeq}. instances: "zigbee,admin.0" or a list (adapter or instance); sinceSeq: only
  newer lines.
- Maintenance (adapter and script status widgets): adapterUpdates {refresh?} ({ok, updates: {<adapter>:
  {installedVersion, availableVersion, repo}}}), updateInfo {refresh?} (update of Aura), restartAdapter
  {id: "<adapter>.<n>"}, upgradeAdapter {name} (installs the newest version: {ok, exitCode, stdout, stderr}
  when done), setScriptEnabled {id: "script.js...", enabled}: {ok} or {ok: false, error}.
- announcementTest, announcementEdit, statusDiscover, autolistSync, auraPing, ping, checkDps, renderReport,
  perfLog, getLoadHistory, perfBreakdown, getPerfBreakdown, renameTimer, deleteTimer, renameCountdown,
  deleteCountdown, deleteList, deletePanel, webComponentsRepo, generateMcpToken, listWebInstances,
  webInstanceNote, listSocketBackends, checkBackend: for the dashboards and the settings, not for agents.

States (aura.0.*). messages.send, speech.say, popup.* and navigate.url also exist as clients.<id>.* (only that
dashboard), messages.send also as layouts.<slug>.messages.send (only that layout):
- messages.send: a message as JSON (as notify) or plain text. messages.ack / messages.dismiss: an id or "*".
  messages.history (JSON, newest first), messages.unreadCount.
- speech.say: speak a text or play a file: "text", "/0_userdata.0/gong.mp3", "80;text" (volume;text) or JSON
  {text, file, volume, voice, lang, rate, pitch, interrupt, onlyVisible, target}.
- popup.open: a popup view: its name or id, or JSON {view, dp, title, width, height}; popup.close: true.
- navigate.url: a tab slug or a URL to show.
- countdowns.<id>.cmd: start, pause, resume, toggle, stop, end, +N / -N (add / remove seconds or [h:]m:s),
  =N (set the duration); countdowns.<id>.state (idle, running, paused, ended), remainingMs, endTs.
- timers.<id>.enabled: switches the schedule of a timer widget on or off.
- lists.<id>.count / items / text: what a list or status widget shows.

How to talk to the user:
- Ask on which dashboard (client, layout or tab) a message, sound or popup should appear, unless the user wants
  all; take the client ids from clients.*.info.name, call devices by that name.
- Messages and speech reach people in the house: send them only when the user asks. Errors with requireAck stay
  until someone confirms them.
- Saving or deleting scenes, staggeredWrite and setScriptEnabled change the house: only on the user's request.
  restartAdapter and upgradeAdapter only on the user's explicit request, after telling what happens.`;

module.exports = { HELP, COMMANDS };

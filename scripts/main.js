(function () {

var os = java.lang.System.getProperty("os.name").toLowerCase();
if (Vars.headless || os.indexOf("linux") === -1) return;

var AXIS_LX = 0, AXIS_LY = 1, AXIS_L2 = 2;
var AXIS_RX = 3, AXIS_RY = 4, AXIS_R2 = 5;
var AXIS_DPAD_X = 6, AXIS_DPAD_Y = 7;

var ZOOM_IN_SIGN = 1;
var ZOOM_SPEED = 0.05;
var CURSOR_SPEED = 18;
var CAM_PAN_SPEED = 12;
var DEADZONE = 0.16;
var SCENE_FLIP_Y = false;
var cfgEnabled = true;
var SCROLL_SPEED = 20;
var SCROLL_INVERT = false;
var menuDpadCd = 0;
var cmdRow = 0, cmdCol = 0;

var MODE_NORMAL = 0, MODE_BUILD = 1, MODE_COMMAND = 2;

var currentMode = MODE_NORMAL;
var buildSubMode = "category";
var selectedCatIndex = 0;
var selectedBlockIndex = 0;

var pad = { connected: false, axes: [0, 0, -1, 0, 0, -1, 0, 0], buttons: [], prevButtons: [] };
for (var bi = 0; bi < 32; bi++) { pad.buttons.push(false); pad.prevButtons.push(false); }

var suppressed = {};
var wasInUI = true;

var cursorX = -1, cursorY = -1, cursorReady = false;
var dpadCooldown = 0;
var HOLD_FRAMES = 20;
var xHoldFrames = 0, copyArmed = false, copying = false;
var copyStartX = 0, copyStartY = 0, copyEndX = 0, copyEndY = 0;
var clipboard = null;
var pasteView = null, pasteLastTX = -9999, pasteLastTY = -9999;
var TS = 8;
var MAX_LINE = 100;

var placing = false, placeStartX = 0, placeStartY = 0, linePoints = null;
var removing = false, breakStartX = 0, breakStartY = 0, breakEndX = 0, breakEndY = 0;

var miningTile = null;

var nArmed = false, nHold = 0, nDropped = false;
var nHoldBtn = -1, copyBtn = -1;

var cmdSelecting = false, cmdStartX = 0, cmdStartY = 0;

var uiMouseDown = false;
var errLogged = {};

function logOnce(tag, e) {
    if (errLogged[tag]) return;
    errLogged[tag] = true;
    Log.err("[Linux-Gamepad] " + tag + ": " + e);
}
function toast(msg) { try { Vars.ui.hudfrag.showToast(msg); } catch (e) {} }
function runnable(fn) { return new java.lang.Runnable({ run: fn }); }
function buildRot(b) {
    try { if (!b.block.rotate) return 0; return ((Math.round(Number(b.rotation)) % 4) + 4) % 4; } catch (e) { return 0; }
}

var JCoreBlock = Packages.mindustry.world.blocks.storage.CoreBlock;

function isCoreBuild(b) {
    try { return b != null && b.block instanceof JCoreBlock; } catch (e) { return false; }
}

function spawnAtCore(player, unit, alive, core) {
    stopMining(unit);
    try { Vars.control.input.inv.hide(); } catch (e1) {}
    try { Vars.control.input.config.hideConfig(); } catch (e2) {}
    if (alive) Call.unitClear(player);
    if (Vars.net.client()) return;
    try { core.requestSpawn(player); }
    catch (e3) { try { Call.playerSpawn(core.tile, player); } catch (e4) { logOnce("core spawn", e4); } }
    toast("[accent]Respawning at core: [white]" + core.block.localizedName);
}

// cat: 0=General, 1=Normal, 2=Build, 3=Command, 4=Menu, 5=Minimap
var BIND_DEFS = [
    { cat: 0, sub: "Mode switching", key: "GEN_MODE_NORMAL",  def: 6,  label: "Switch to normal mode" },
    { cat: 0, sub: "Mode switching", key: "GEN_MODE_BUILD",   def: 5,  label: "Switch to build mode" },
    { cat: 0, sub: "Mode switching", key: "GEN_MODE_COMMAND", def: 4,  label: "Switch to command mode" },
    { cat: 0, sub: "Camera and minimap", key: "GEN_ZOOM_IN",    def: 11, label: "Camera zoom in" },
    { cat: 0, sub: "Camera and minimap", key: "GEN_ZOOM_OUT",   def: 12, label: "Camera zoom out" },
    { cat: 0, sub: "Camera and minimap", key: "GEN_MINIMAP_1",  def: 11, label: "Open minimap (combo button 1)" },
    { cat: 0, sub: "Camera and minimap", key: "GEN_MINIMAP_2",  def: 12, label: "Open minimap (combo button 2)" },
    { cat: 0, sub: "System", key: "GEN_PAUSE", def: 8, label: "Tactical pause" },
    { cat: 0, sub: "System", key: "GEN_MENU",  def: 9, label: "Open pause menu" },

    { cat: 1, sub: "Shooting and windows", key: "NRM_SHOOT",     def: 7, label: "Fire / shoot (hold)" },
    { cat: 1, sub: "Shooting and windows", key: "NRM_TAP_UI",    def: 0, label: "Click open UI panels in the world" },
    { cat: 1, sub: "Shooting and windows", key: "NRM_RESEARCH",  def: 3, label: "Open research tree" },
    { cat: 1, sub: "Shooting and windows", key: "NRM_SKIP_WAVE", def: 2, label: "Skip wave" },
    { cat: 1, sub: "World interaction", key: "NRM_CONFIG", def: 0, label: "Open / press config of block under cursor" },
    { cat: 1, sub: "World interaction", key: "NRM_INV",    def: 0, label: "Open inventory of block under cursor" },
    { cat: 1, sub: "World interaction", key: "NRM_MINE",   def: 0, label: "Start / stop mining ore under cursor" },
    { cat: 1, sub: "Unit items", key: "NRM_DROP_BUILD",  def: 0, label: "Give items to block under cursor (hold)" },
    { cat: 1, sub: "Unit items", key: "NRM_DROP_GROUND", def: 0, label: "Drop items on the ground at empty spot (hold)" },
    { cat: 1, sub: "Possess and respawn", key: "NRM_POSSESS_UNIT",  def: 1, label: "Possess unit under cursor" },
    { cat: 1, sub: "Possess and respawn", key: "NRM_POSSESS_BUILD", def: 1, label: "Possess block / turret / factory under cursor" },
    { cat: 1, sub: "Possess and respawn", key: "NRM_RESPAWN_CORE",  def: 1, label: "Respawn at core (press on empty spot)" },

    { cat: 2, sub: "Placing and breaking", key: "BLD_PLACE",         def: 7, label: "Build block / line of blocks (hold)" },
    { cat: 2, sub: "Placing and breaking", key: "BLD_PASTE",         def: 7, label: "Paste schematic from clipboard" },
    { cat: 2, sub: "Placing and breaking", key: "BLD_REMOVE",        def: 1, label: "Deconstruct block / select area (hold)" },
    { cat: 2, sub: "Placing and breaking", key: "BLD_CANCEL_PLACE",  def: 1, label: "Cancel line while dragging a build" },
    { cat: 2, sub: "Placing and breaking", key: "BLD_CANCEL_REMOVE", def: 7, label: "Cancel deconstruction while selecting area" },
    { cat: 2, sub: "Selection and rotation", key: "BLD_SUB_CAT",   def: 2, label: "Switch d-pad to category select" },
    { cat: 2, sub: "Selection and rotation", key: "BLD_SUB_BLOCK", def: 3, label: "Switch d-pad to block select" },
    { cat: 2, sub: "Selection and rotation", key: "BLD_ROTATE",    def: 3, label: "Rotate selected block / pasted schematic 90 degrees" },
    { cat: 2, sub: "Copy and cancel", key: "BLD_CANCEL_ACTION", def: 0, label: "Cancel build plans / clear clipboard" },
    { cat: 2, sub: "Copy and cancel", key: "BLD_COPY_BLOCK",    def: 0, label: "Pipette: copy block under cursor" },
    { cat: 2, sub: "Copy and cancel", key: "BLD_COPY_AREA",     def: 0, label: "Copy building area (hold and drag)" },
    { cat: 2, sub: "Copy and cancel", key: "BLD_SAVE_1",        def: 11, label: "Schematics: save from clipboard / open list (combo button 1)" },
    { cat: 2, sub: "Copy and cancel", key: "BLD_SAVE_2",        def: 12, label: "Schematics: save from clipboard / open list (combo button 2)" },

    { cat: 3, sub: "Unit selection", key: "CMD_SELECT_SINGLE", def: 7, label: "Select / deselect unit or factory under cursor" },
    { cat: 3, sub: "Unit selection", key: "CMD_SELECT_RECT",   def: 7, label: "Box-select units (hold and drag)" },
    { cat: 3, sub: "Unit selection", key: "CMD_SELECT_ALL",    def: 2, label: "Select all available units" },
    { cat: 3, sub: "Unit selection", key: "CMD_CLEAR_SEL",     def: 1, label: "Clear selection" },
    { cat: 3, sub: "Orders and panel", key: "CMD_ORDER_MOVE",   def: 0, label: "Order move to point (empty spot)" },
    { cat: 3, sub: "Orders and panel", key: "CMD_ORDER_TARGET", def: 0, label: "Order attack enemy / building under cursor" },
    { cat: 3, sub: "Orders and panel", key: "CMD_PANEL_CLICK",  def: 3, label: "Press selected button on command panel" },

    { cat: 4, sub: "Menu control", key: "MNU_CLICK_1", def: 0, label: "Click / drag sliders (main button)" },
    { cat: 4, sub: "Menu control", key: "MNU_CLICK_2", def: 7, label: "Click / drag sliders (extra button)" },
    { cat: 4, sub: "Menu control", key: "MNU_BACK_1",  def: 1, label: "Back / close window (button 1)" },
    { cat: 4, sub: "Menu control", key: "MNU_BACK_2",  def: 6, label: "Back / close window (button 2)" },
    { cat: 4, sub: "Menu control", key: "MNU_BACK_3",  def: 9, label: "Back / close window (button 3)" },

    { cat: 5, sub: "Minimap zoom",  key: "MAP_ZOOM_IN",       def: 11, label: "Minimap zoom in" },
    { cat: 5, sub: "Minimap zoom",  key: "MAP_ZOOM_OUT",      def: 12, label: "Minimap zoom out" },
    { cat: 5, sub: "Minimap close", key: "MAP_CLOSE_1",       def: 1,  label: "Close minimap (button 1)" },
    { cat: 5, sub: "Minimap close", key: "MAP_CLOSE_2",       def: 9,  label: "Close minimap (button 2)" },
    { cat: 5, sub: "Minimap close", key: "MAP_CLOSE_COMBO_1", def: 11, label: "Close minimap by combo (button 1)" },
    { cat: 5, sub: "Minimap close", key: "MAP_CLOSE_COMBO_2", def: 12, label: "Close minimap by combo (button 2)" }
];
var CFG_KEYS = ["gp-enabled", "gp-cursor", "gp-pan", "gp-zoom", "gp-deadzone", "gp-hold", "gp-invzoom", "gp-flipy", "gp-scroll", "gp-scrollinv"];
var PHYS_NAMES = ["Cross (✕)", "Circle (○)", "Triangle (△)", "Square (□)", "L1", "R1", "L2", "R2", "Share", "Options", "PS", "L3", "R3"];
var bindings = {};
for (var bd = 0; bd < BIND_DEFS.length; bd++) bindings[BIND_DEFS[bd].key] = BIND_DEFS[bd].def;

var CFG_PREFIX = "gpv2-";

function cfgGet(key) {
    try { var v = Core.settings.getString(CFG_PREFIX + key, ""); return (v == null) ? "" : String(v); } catch (e) { return ""; }
}
function cfgInt(key, def) { var n = parseInt(cfgGet(key), 10); return isNaN(n) ? def : n; }
function cfgBool(key, def) {
    var s = cfgGet(key);
    if (s === "1") return true;
    if (s === "0") return false;
    return def;
}
function cfgPut(key, v) { try { Core.settings.put(CFG_PREFIX + key, String(v)); } catch (e) { logOnce("cfg put", e); } }
function cfgRemove(key) { try { Core.settings.remove(CFG_PREFIX + key); } catch (e) {} }
function cfgFlush() { try { Core.settings.forceSave(); } catch (e) {} }

function loadConfig() {
    cfgEnabled = cfgBool("gp-enabled", true);
    CURSOR_SPEED = cfgInt("gp-cursor", 18);
    CAM_PAN_SPEED = cfgInt("gp-pan", 12);
    ZOOM_SPEED = cfgInt("gp-zoom", 50) / 1000;
    DEADZONE = cfgInt("gp-deadzone", 16) / 100;
    HOLD_FRAMES = cfgInt("gp-hold", 20);
    ZOOM_IN_SIGN = cfgBool("gp-invzoom", false) ? -1 : 1;
    SCENE_FLIP_Y = cfgBool("gp-flipy", false);
    SCROLL_SPEED = cfgInt("gp-scroll", 20);
    SCROLL_INVERT = cfgBool("gp-scrollinv", false);
    for (var i = 0; i < BIND_DEFS.length; i++) bindings[BIND_DEFS[i].key] = cfgInt("gp-bind-" + BIND_DEFS[i].key, BIND_DEFS[i].def);
}

function saveInt(key, v) { cfgPut(key, Math.round(v)); }
function saveBool(key, v) { cfgPut(key, v ? "1" : "0"); }

try { loadConfig(); } catch (e) { Log.warn("[Linux-Gamepad] loadConfig: " + e); }

function active() { return pad.connected && cfgEnabled; }

function applyDeadzone(v) {
    v = v || 0;
    var a = Math.abs(v);
    if (a < DEADZONE) return 0;
    return (v < 0 ? -1 : 1) * Math.min(1, (a - DEADZONE) / (1 - DEADZONE));
}

function rawDown(btn) {
    if (btn === 6) return Boolean(pad.buttons[6]) || (pad.axes[AXIS_L2] > 0.3);
    if (btn === 7) return Boolean(pad.buttons[7]) || (pad.axes[AXIS_R2] > 0.3);
    return Boolean(pad.buttons[btn]);
}
function isDown(btn) {
    if (suppressed[btn]) {
        if (!rawDown(btn)) suppressed[btn] = false;
        return false;
    }
    return rawDown(btn);
}
function justPressed(btn) { return isDown(btn) && !pad.prevButtons[btn]; }
function justReleased(btn) { return !isDown(btn) && pad.prevButtons[btn]; }
function savePrevState() { for (var i = 0; i < 20; i++) pad.prevButtons[i] = isDown(i); }
function suppressAllHeld() { for (var i = 0; i < 20; i++) if (rawDown(i)) suppressed[i] = true; }

function sleepMs(ms) { try { java.lang.Thread.sleep(ms); } catch (e) {} }

function findDevice() {
    var denied = false;
    for (var i = 0; i < 8; i++) {
        var f = new java.io.File("/dev/input/js" + i);
        if (f.exists()) {
            if (f.canRead()) return f;
            denied = true;
        }
    }
    if (denied) logOnce("No permission for /dev/input/js*", "add user to input group (sudo usermod -aG input $USER) and relogin");
    return null;
}

function resetPad() {
    for (var i = 0; i < 32; i++) pad.buttons[i] = false;
    for (var a = 0; a < 8; a++) pad.axes[a] = (a === AXIS_L2 || a === AXIS_R2) ? -1 : 0;
}

var readerThread = new java.lang.Thread(new java.lang.Runnable({
    run: function () {
        while (true) {
            var fis = null;
            try {
                var dev = findDevice();
                if (dev == null) { pad.connected = false; sleepMs(2000); continue; }
                fis = new java.io.FileInputStream(dev);
                var buf = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 8);
                pad.connected = true;
                Log.info("[Linux-Gamepad] Controller connected: " + dev.getPath());
                while (fis.read(buf) === 8) {
                    var value = (buf[5] << 8) | (buf[4] & 0xFF);
                    var type = buf[6] & 0x7F;
                    var number = buf[7] & 0xFF;
                    if (number >= 32) continue;
                    if (type === 1) pad.buttons[number] = (value === 1);
                    else if (type === 2 && number < 8) pad.axes[number] = value / 32767.0;
                }
            } catch (e) {
            } finally {
                try { if (fis != null) fis.close(); } catch (e2) {}
                pad.connected = false;
                resetPad();
            }
            sleepMs(1500);
        }
    }
}), "Linux-Joystick-Reader");
readerThread.setDaemon(true);
readerThread.start();

function findField(cls, wanted) {
    var c = cls;
    while (c != null) {
        var fs = c.getDeclaredFields();
        for (var i = 0; i < fs.length; i++) {
            var nm = String(fs[i].getName()).toLowerCase();
            var tp = String(fs[i].getType().getName());
            if (nm === wanted && (tp === "int" || tp === "float")) { fs[i].setAccessible(true); return fs[i]; }
        }
        c = c.getSuperclass();
    }
    return null;
}

var mouseXField = null, mouseYField = null;
try {
    mouseXField = findField(Core.input.getClass(), "mousex");
    mouseYField = findField(Core.input.getClass(), "mousey");
    if (!mouseXField || !mouseYField) Log.warn("[Linux-Gamepad] mouseX/mouseY fields not found in " + Core.input.getClass());
} catch (e) { Log.warn("[Linux-Gamepad] Mouse reflection failed: " + e); }

function setField(f, v) {
    if (!f) return;
    if (String(f.getType().getName()) === "int") f.setInt(Core.input, Math.round(v));
    else f.setFloat(Core.input, v);
}

function sceneY() {
    var y = Math.round(cursorY);
    return SCENE_FLIP_Y ? (Core.graphics.getHeight() - 1 - y) : y;
}

function syncMousePosition() {
    var w = Core.graphics.getWidth(), h = Core.graphics.getHeight();
    if (!cursorReady) { cursorX = w / 2; cursorY = h / 2; cursorReady = true; }
    cursorX = Mathf.clamp(cursorX, 0, w - 1);
    cursorY = Mathf.clamp(cursorY, 0, h - 1);
    try { setField(mouseXField, cursorX); setField(mouseYField, cursorY); } catch (e) { logOnce("mouse field", e); }
    Core.scene.mouseMoved(Math.round(cursorX), sceneY());
}

function moveCursor(sx, sy, dt) {
    cursorX += sx * Math.abs(sx) * CURSOR_SPEED * dt;
    cursorY += sy * Math.abs(sy) * CURSOR_SPEED * dt;
}

function updateMenuMouseClick(clickHeld) {
    var sx = Math.round(cursorX), sy = sceneY();
    if (clickHeld && !uiMouseDown) { uiMouseDown = true; Core.scene.touchDown(sx, sy, 0, KeyCode.mouseLeft); }
    else if (clickHeld && uiMouseDown) Core.scene.touchDragged(sx, sy, 0);
    else if (!clickHeld && uiMouseDown) { uiMouseDown = false; Core.scene.touchUp(sx, sy, 0, KeyCode.mouseLeft); }
}

function clickSceneAtCursor() {
    var sx = Math.round(cursorX), sy = sceneY();
    Core.scene.touchDown(sx, sy, 0, KeyCode.mouseLeft);
    Core.scene.touchUp(sx, sy, 0, KeyCode.mouseLeft);
}

function triggerEscape() {
    if (Core.scene.hasDialog()) { var d = Core.scene.getDialog(); if (d != null) d.hide(); return; }
    if (Vars.state.isGame()) Vars.ui.paused.show();
}

function togglePause() {
    if (Vars.net.active()) return;
    var S = Packages.mindustry.core.GameState.State;
    if (Vars.state.isPaused()) Vars.state.set(S.playing);
    else if (Vars.state.isPlaying()) Vars.state.set(S.paused);
}

function isBlockAvailable(b) {
    if (b == null || b.placeablePlayer === false) return false;
    try { if (!b.isVisible()) return false; } catch (e) {}
    try { if (typeof b.isPlaceable === "function" && !b.isPlaceable()) return false; } catch (e) {}
    try { if (typeof b.environmentBuildable === "function" && !b.environmentBuildable()) return false; } catch (e) {}
    try { if (typeof b.supportsEnv === "function" && !b.supportsEnv(Vars.state.rules.env)) return false; } catch (e) {}
    if (Vars.state.rules.infiniteResources || Vars.state.isEditor()) return true;
    try { if (typeof b.unlockedNowHost === "function") return b.unlockedNowHost(); } catch (e) {}
    return b.unlockedNow();
}

function getBlocksInCategory(catIndex) {
    var cat = Category.all[Mathf.clamp(catIndex, 0, Category.all.length - 1)];
    var list = [];
    var blocks = Vars.content.blocks();
    for (var i = 0; i < blocks.size; i++) {
        var b = blocks.get(i);
        if (b.category === cat && isBlockAvailable(b)) list.push(b);
    }
    return list;
}

function updateSelectedBlock() {
    clipboard = null; pasteView = null;
    var list = getBlocksInCategory(selectedCatIndex);
    if (list.length === 0) { Vars.control.input.block = null; return; }
    selectedBlockIndex = Mathf.clamp(selectedBlockIndex, 0, list.length - 1);
    Vars.control.input.block = list[selectedBlockIndex];
}

function categoryName(i) {
    var n = Category.all[i].name();
    var s = Core.bundle.get("category." + n);
    return (s && s.indexOf("???") === -1) ? s : n;
}

var catField = null;
function getCatField(frag) {
    if (catField) return catField;
    var c = frag.getClass();
    while (c != null) {
        try { var f = c.getDeclaredField("currentCategory"); f.setAccessible(true); catField = f; return f; } catch (e) {}
        c = c.getSuperclass();
    }
    return null;
}

function syncCategoryUI() {
    try {
        var cat = Category.all[selectedCatIndex];
        var frag = Vars.ui.hudfrag.blockfrag;
        var f = getCatField(frag);
        if (f && String(f.get(frag)) === String(cat)) return;
        var el = Core.scene.find("category-" + cat.name());
        if (el != null) { try { el.fireClick(); } catch (e1) {} }
        if (f && String(f.get(frag)) !== String(cat)) f.set(frag, cat);
    } catch (e) { logOnce("category UI", e); }
}

function setMode(m) {
    currentMode = m;
    var input = Vars.control.input;
    try { input.commandMode = (m === MODE_COMMAND); } catch (e) {}
    if (m === MODE_BUILD) {
        for (var k = 0; k < Category.all.length; k++) {
            if (getBlocksInCategory(selectedCatIndex).length > 0) break;
            selectedCatIndex = (selectedCatIndex + 1) % Category.all.length;
        }
        selectedBlockIndex = 0;
        syncCategoryUI();
        updateSelectedBlock();
    } else {
        input.block = null;
    }
    if (m !== MODE_COMMAND) cmdSelecting = false;
    if (m === MODE_COMMAND) { cmdRow = 0; cmdCol = 0; }
    placing = false; removing = false; linePoints = null;
    xHoldFrames = 0; copyArmed = false; copying = false;
    clipboard = null; pasteView = null;
    miningTile = null; nArmed = false; nDropped = false;
}

function seqToArray(x) {
    var out = [];
    if (x == null) return out;
    if (x.size !== undefined) { for (var i = 0; i < x.size; i++) out.push(x.get(i)); }
    else if (x.length !== undefined) { for (var j = 0; j < x.length; j++) out.push(x[j]); }
    return out;
}

function unitIds(units) {
    var ids = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, units.size);
    for (var i = 0; i < units.size; i++) ids[i] = units.get(i).id;
    return ids;
}

function sendUnitsCommand(player, units, buildTarget, unitTarget, pos) {
    if (units.size === 0) return;
    var ids = unitIds(units);
    try { Call.commandUnits(player, ids, buildTarget, unitTarget, pos, false, true); }
    catch (e0) {
        try { Call.commandUnits(player, ids, buildTarget, unitTarget, pos, false); }
        catch (e1) { try { Call.commandUnits(player, ids, buildTarget, unitTarget, pos); } catch (e2) { logOnce("commandUnits", e2); } }
    }
    try { Fx.commandSend.at(pos.x, pos.y); } catch (ef) {}
}

function handleMenu(dt, capturing) {
    placing = false; removing = false; linePoints = null;
    copyArmed = false; copying = false;
    nArmed = false; nDropped = false;

    moveCursor(applyDeadzone(pad.axes[AXIS_LX]), -applyDeadzone(pad.axes[AXIS_LY]), dt);
    syncMousePosition();

    var rsx = applyDeadzone(pad.axes[AXIS_RX]);
    var rsy = applyDeadzone(pad.axes[AXIS_RY]);
    if (rsx !== 0 || rsy !== 0) { try { scrollMenu(rsx, rsy, dt); } catch (e) { logOnce("menu scroll", e); } }

    if (capturing) { if (uiMouseDown) updateMenuMouseClick(false); return; }

    if (menuDpadCd > 0) menuDpadCd -= dt;
    var ddx = Math.round(pad.axes[AXIS_DPAD_X] || 0);
    if (ddx === 0) menuDpadCd = 0;
    else if (menuDpadCd <= 0) { try { if (adjustSliderUnderCursor(ddx)) menuDpadCd = 6; } catch (e2) { logOnce("slider dpad", e2); } }

    updateMenuMouseClick(isDown(bindings.MNU_CLICK_1) || isDown(bindings.MNU_CLICK_2));

    if (justPressed(bindings.MNU_BACK_1) || justPressed(bindings.MNU_BACK_2) || justPressed(bindings.MNU_BACK_3)) triggerEscape();
}

function elementUnderCursor() {
    var v = Core.scene.screenToStageCoordinates(new Vec2(Math.round(cursorX), sceneY()));
    return Core.scene.hit(v.x, v.y, true);
}

function scrollMenu(sx, sy, dt) {
    var dirY = SCROLL_INVERT ? -1 : 1;
    var dx = sx * Math.abs(sx) * SCROLL_SPEED * dt;
    var dy = sy * Math.abs(sy) * SCROLL_SPEED * dt * dirY;
    var el = elementUnderCursor();
    while (el != null) {
        if (el instanceof JScrollPane) {
            var movedY = false, movedX = false;
            if (dy !== 0 && el.getMaxY() > 0) { el.setScrollY(el.getScrollY() + dy); movedY = true; }
            if (dx !== 0 && el.getMaxX() > 0) { el.setScrollX(el.getScrollX() + dx); movedX = true; }
            if (movedY || movedX) return;
        }
        el = el.parent;
    }
    try { Core.scene.scrolled(dx * 0.02, dy * 0.02); } catch (e) {}
}

function adjustSliderUnderCursor(dir) {
    var el = elementUnderCursor();
    while (el != null) {
        if (el instanceof JSlider) { el.setValue(el.getValue() + dir * el.getStepSize()); return true; }
        el = el.parent;
    }
    return false;
}

var mapPanXField = null, mapPanYField = null, mapZoomField = null, mapFieldsInit = false;

function handleMinimap(dt) {
    var mf = Vars.ui.minimapfrag;
    if (!mapFieldsInit && mf != null) {
        mapFieldsInit = true;
        mapPanXField = findField(mf.getClass(), "panx");
        mapPanYField = findField(mf.getClass(), "pany");
        mapZoomField = findField(mf.getClass(), "zoom");
    }

    var mc1 = bindings.MAP_CLOSE_COMBO_1, mc2 = bindings.MAP_CLOSE_COMBO_2;
    var closeCombo = (mc1 === mc2) ? justPressed(mc1) : ((isDown(mc1) && justPressed(mc2)) || (isDown(mc2) && justPressed(mc1)));

    if (closeCombo || justPressed(bindings.MAP_CLOSE_1) || justPressed(bindings.MAP_CLOSE_2)) {
        mf.hide();
        suppressed[mc1] = true; suppressed[mc2] = true;
        suppressed[bindings.MAP_CLOSE_1] = true; suppressed[bindings.MAP_CLOSE_2] = true;
        return;
    }

    var curZoom = 1;
    try { curZoom = Vars.renderer.minimap.getZoom(); } catch (e) {}

    var rx = applyDeadzone(pad.axes[AXIS_RX]);
    var ry = applyDeadzone(pad.axes[AXIS_RY]);
    if ((rx !== 0 || ry !== 0) && mapPanXField != null && mapPanYField != null) {
        try {
            var px = mapPanXField.getFloat(mf), py = mapPanYField.getFloat(mf);
            var step = (CAM_PAN_SPEED * 1.5 / Math.max(curZoom, 0.2)) * dt;
            mapPanXField.setFloat(mf, px + rx * step);
            mapPanYField.setFloat(mf, py + ry * step);
        } catch (e1) { logOnce("map pan", e1); }
    }

    var zDir = (isDown(bindings.MAP_ZOOM_IN) ? 1 : 0) - (isDown(bindings.MAP_ZOOM_OUT) ? 1 : 0);
    if (zDir !== 0) {
        try {
            var nextZ = Mathf.clamp(curZoom * (1 + ZOOM_IN_SIGN * zDir * ZOOM_SPEED * dt * 0.5), 0.25, 16);
            Vars.renderer.minimap.setZoom(nextZ);
            if (mapZoomField != null) mapZoomField.setFloat(mf, nextZ);
        } catch (e2) { logOnce("map zoom", e2); }
    }
}

function handleGame(dt) {
    if (wasInUI) suppressAllHeld();
    if (uiMouseDown) updateMenuMouseClick(false);

    var player = Vars.player;
    if (!player) return;
    var alive = !player.dead();
    var unit = alive ? player.unit() : null;
    var input = Vars.control.input;

    if (Vars.ui.minimapfrag != null) {
        if (Vars.ui.minimapfrag.shown()) { handleMinimap(dt); return; }

        if (currentMode === MODE_BUILD) {
            var sv1 = bindings.BLD_SAVE_1, sv2 = bindings.BLD_SAVE_2;
            var saveCombo = (sv1 === sv2) ? justPressed(sv1) : ((isDown(sv1) && justPressed(sv2)) || (isDown(sv2) && justPressed(sv1)));
            if (saveCombo) {
                if (clipboard != null) openSaveDialog(); else openSchemPicker();
                suppressed[sv1] = true; suppressed[sv2] = true;
                return;
            }
        }

        var mm1 = bindings.GEN_MINIMAP_1, mm2 = bindings.GEN_MINIMAP_2;
        var openMap = (mm1 === mm2) ? justPressed(mm1) : ((isDown(mm1) && justPressed(mm2)) || (isDown(mm2) && justPressed(mm1)));
        if (openMap) {
            Vars.ui.minimapfrag.toggle();
            suppressed[mm1] = true; suppressed[mm2] = true;
            return;
        }
    }

    if (justPressed(bindings.GEN_MENU)) { triggerEscape(); return; }
    if (justPressed(bindings.GEN_PAUSE)) togglePause();

    if (justPressed(bindings.GEN_MODE_NORMAL)) setMode(MODE_NORMAL);
    else if (justPressed(bindings.GEN_MODE_BUILD)) setMode(MODE_BUILD);
    else if (justPressed(bindings.GEN_MODE_COMMAND)) setMode(MODE_COMMAND);

    moveCursor(applyDeadzone(pad.axes[AXIS_RX]), -applyDeadzone(pad.axes[AXIS_RY]), dt);
    syncMousePosition();
    var wp = Core.camera.unproject(Tmp.v1.set(cursorX, cursorY));
    var wx = wp.x, wy = wp.y;
    player.mouseX = wx;
    player.mouseY = wy;

    var lx = applyDeadzone(pad.axes[AXIS_LX]);
    var ly = -applyDeadzone(pad.axes[AXIS_LY]);
    if (unit && (lx !== 0 || ly !== 0)) {
        try { input.panning = false; } catch (e) {}
        var mv = Tmp.v2.set(lx, ly);
        if (mv.len() > 1) mv.nor();
        mv.scl(unit.speed());
        unit.movePref(mv);
    }

    if (isDown(bindings.GEN_ZOOM_IN)) Vars.renderer.scaleCamera(ZOOM_IN_SIGN * ZOOM_SPEED * dt);
    if (isDown(bindings.GEN_ZOOM_OUT)) Vars.renderer.scaleCamera(-ZOOM_IN_SIGN * ZOOM_SPEED * dt);

    var dpadX = Math.round(pad.axes[AXIS_DPAD_X] || 0);
    var dpadY = -Math.round(pad.axes[AXIS_DPAD_Y] || 0);

    if (currentMode === MODE_NORMAL) normalMode(player, unit, alive, wx, wy, dpadX, dpadY, dt);
    else if (currentMode === MODE_BUILD) buildMode(player, unit, alive, wx, wy, dpadX, dpadY, dt);
    else commandMode(player, unit, wx, wy, dpadX, dpadY, dt);
}

function panCamera(dpadX, dpadY, dt) {
    if (dpadX === 0 && dpadY === 0) return;
    try { Vars.control.input.panning = true; } catch (e) {}
    var scale = 4;
    try { scale = Vars.renderer.getScale(); } catch (e2) {}
    var step = (CAM_PAN_SPEED / Math.max(scale, 0.1)) * dt;
    Core.camera.position.add(dpadX * step, dpadY * step);
}

function tryControlBuilding(player, unit, b) {
    if (b == null || b.team !== player.team()) return false;
    if (String(b.block.name).indexOf("core") === 0) return false;

    stopMining(unit);

    try {
        var m = b.getClass().getMethod("unit");
        var bu = m.invoke(b);
        if (bu != null) {
            if (unit === bu) return false;
            Call.unitControl(player, bu);
            toast("[accent]Controlling: [white]" + b.block.localizedName);
            return true;
        }
    } catch (e1) {}

    try {
        if (unit != null && b.canControlSelect(unit)) {
            Call.buildingControlSelect(player, b);
            toast("[accent]Controlling: [white]" + b.block.localizedName);
            return true;
        }
    } catch (e2) {}

    if (!Vars.net.client()) {
        try {
            if (unit != null && unit.type === UnitTypes.block && unit.tile === b) return false;
            var customBu = UnitTypes.block.create(b.team);
            customBu.tile = b;
            customBu.set(b.x, b.y);
            customBu.health = b.health;
            player.unit(customBu);
            toast("[accent]Controlling: [white]" + b.block.localizedName);
            return true;
        } catch (e3) { logOnce("force possess", e3); }
    }
    return false;
}

function invFrag() {
    var input = Vars.control.input;
    try { if (input.inv != null) return input.inv; } catch (e) {}
    try { if (input.frag != null && input.frag.inv != null) return input.frag.inv; } catch (e) {}
    return null;
}

function tileTappedWorld(player, b, allowConfig, allowInv) {
    var input = Vars.control.input;
    var inv = invFrag();
    if (b == null) {
        if (allowInv && inv != null) { try { inv.hide(); } catch (e1) {} }
        if (allowConfig) { try { input.config.hideConfig(); } catch (e2) {} }
        return false;
    }
    var consumed = false;

    if (allowConfig) {
        try {
            if (b.block.configurable && b.interactable(player.team())) {
                consumed = true;
                if ((!input.config.isShown() && b.shouldShowConfigure(player)) ||
                    (input.config.isShown() && input.config.getSelected() != null && input.config.getSelected().onConfigureBuildTapped(b))) {
                    try { Sounds.click.at(b); } catch (es) {}
                    input.config.showConfig(b);
                }
            } else if (!input.config.hasConfigMouse()) {
                if (input.config.isShown() && input.config.getSelected() != null && input.config.getSelected().onConfigureBuildTapped(b)) consumed = true;
                else input.config.hideConfig();
            }
        } catch (e3) { logOnce("config tap", e3); }
    }

    if (allowInv) {
        try {
            var hasStuff = b.block.hasItems && b.items != null && b.items.total() > 0 && b.interactable(player.team()) && b.block.itemCapacity > 0;
            if (hasStuff) {
                if (inv != null) { inv.showFor(b); consumed = true; }
                else { logOnce("inv missing", "inventory fragment not found"); toast("[scarlet]Inventory fragment not found"); }
            } else if (inv != null) {
                inv.hide();
            }
        } catch (e4) { logOnce("inv tap", e4); toast("[scarlet]Inventory failed: " + e4); }
    }
    return consumed;
}

function tapActionForBtn(player, unit, wx, wy, btn) {
    if (btn === bindings.NRM_TAP_UI && elementUnderCursor() != null) { clickSceneAtCursor(); return; }

    var input = Vars.control.input;
    if (btn === bindings.NRM_CONFIG) {
        try { if (input.config.isShown() && input.config.getSelected() != null && input.config.getSelected().onConfigureTapped(wx, wy)) return; } catch (e) {}
    }

    var b = Vars.world.buildWorld(wx, wy);
    if (btn === bindings.NRM_CONFIG || btn === bindings.NRM_INV) {
        if (tileTappedWorld(player, b, btn === bindings.NRM_CONFIG, btn === bindings.NRM_INV)) return;
    }

    if (btn === bindings.NRM_MINE) {
        var ore = Vars.world.tileWorld(wx, wy);
        if (unit && ore != null && ((ore.block() === Blocks.air && ore.drop() != null) || ore.wallDrop() != null)) {
            if (!tryStartMining(unit, ore)) toast("[scarlet]Can't mine here (too far or unit can't)");
        } else {
            stopMining(unit);
        }
    }
}

function dropItemsForBtn(player, unit, wx, wy, btn) {
    if (!unit || unit.stack.amount <= 0) { toast("[lightgray]Unit has no items"); return; }
    var st = unit.stack;
    var b = Vars.world.buildWorld(wx, wy);
    var canGive = false;
    if (b != null) {
        try {
            canGive = b.interactable(player.team()) && b.block.hasItems && b.acceptStack(st.item, st.amount, unit) > 0;
            if (canGive && Vars.state.rules.onlyDepositCore && String(b.block.name).indexOf("core") !== 0) canGive = false;
        } catch (e) { canGive = false; }
    }
    if (canGive && btn === bindings.NRM_DROP_BUILD) {
        var range = (Vars.itemTransferRange !== undefined) ? Vars.itemTransferRange : 220;
        if (!unit.within(b, range)) { toast("[scarlet]Too far"); return; }
        Call.transferInventory(player, b);
        toast("[accent]Transferred to: [white]" + b.block.localizedName);
    } else if (!canGive && btn === bindings.NRM_DROP_GROUND) {
        Call.dropItem(player.angleTo(wx, wy));
        toast("[accent]Items dropped");
    } else if (btn === bindings.NRM_DROP_GROUND && bindings.NRM_DROP_GROUND !== bindings.NRM_DROP_BUILD) {
        Call.dropItem(player.angleTo(wx, wy));
        toast("[accent]Items dropped");
    }
}

function isNormalTapBtn(b) { return b === bindings.NRM_TAP_UI || b === bindings.NRM_CONFIG || b === bindings.NRM_INV || b === bindings.NRM_MINE; }
function isNormalDropBtn(b) { return b === bindings.NRM_DROP_BUILD || b === bindings.NRM_DROP_GROUND; }

function stopMining(unit) {
    miningTile = null;
    try { if (unit) unit.mineTile = null; } catch (e) {}
}

function tryStartMining(unit, tile) {
    var input = Vars.control.input;
    var ok = false;
    try { ok = input.canMine(tile); }
    catch (e) { try { ok = (tile.drop() != null || tile.wallDrop() != null) && unit.canMine() && unit.validMine(tile); } catch (e2) { ok = false; } }
    if (!ok) return false;
    try { input.tryBeginMine(tile); } catch (e3) {}
    if (unit.mineTile == null) unit.mineTile = tile;
    miningTile = tile;
    return true;
}

function normalMode(player, unit, alive, wx, wy, dpadX, dpadY, dt) {
    panCamera(dpadX, dpadY, dt);

    if (miningTile != null) {
        if (!alive || !unit) {
            miningTile = null;
        } else {
            var stillOk = false;
            try { stillOk = unit.validMine(miningTile); } catch (e) {}
            if (!stillOk) stopMining(unit);
            else if (unit.mineTile == null) unit.mineTile = miningTile;
        }
    }

    var nBtns = [bindings.NRM_TAP_UI, bindings.NRM_CONFIG, bindings.NRM_INV, bindings.NRM_MINE, bindings.NRM_DROP_BUILD, bindings.NRM_DROP_GROUND];
    var checked = {};
    for (var i = 0; i < nBtns.length; i++) {
        var b = nBtns[i];
        if (checked[b]) continue;
        checked[b] = true;
        if (justPressed(b)) {
            if (isNormalTapBtn(b) && isNormalDropBtn(b)) { nArmed = true; nHoldBtn = b; nHold = 0; nDropped = false; }
            else if (isNormalDropBtn(b)) { if (alive) dropItemsForBtn(player, unit, wx, wy, b); }
            else if (isNormalTapBtn(b)) tapActionForBtn(player, unit, wx, wy, b);
        }
    }

    if (nArmed) {
        if (isDown(nHoldBtn)) {
            nHold += dt;
            if (nHold >= HOLD_FRAMES && !nDropped) { nDropped = true; if (alive) dropItemsForBtn(player, unit, wx, wy, nHoldBtn); }
        } else {
            nArmed = false;
            if (!nDropped) tapActionForBtn(player, unit, wx, wy, nHoldBtn);
        }
    }

    var didPossess = false;
    if (justPressed(bindings.NRM_POSSESS_UNIT)) {
        var target = Units.closest(player.team(), wx, wy, 12, function (u) {
            return !u.isPlayer() && u.type.playerControllable && !u.dead && u.within(wx, wy, u.hitSize * 0.7 + 2);
        });
        if (target != null) {
            stopMining(unit);
            Call.unitControl(player, target);
            toast("[accent]Controlling: [white]" + target.type.localizedName);
            didPossess = true;
        }
    }

    if (!didPossess && justPressed(bindings.NRM_POSSESS_BUILD)) {
        var bPoss = Vars.world.buildWorld(wx, wy);
        if (bPoss != null && bPoss.team === player.team()) {
            if (isCoreBuild(bPoss)) { spawnAtCore(player, unit, alive, bPoss); didPossess = true; }
            else if (tryControlBuilding(player, unit, bPoss)) didPossess = true;
        }
    }

    if (!didPossess && justPressed(bindings.NRM_RESPAWN_CORE)) {
        var under = Vars.world.buildWorld(wx, wy);
        if (under != null && under.team === player.team() && isCoreBuild(under)) {
            spawnAtCore(player, unit, alive, under);
        } else {
            var onControllableUnit = Units.closest(player.team(), wx, wy, 12, function (u) {
                return !u.isPlayer() && u.type.playerControllable && !u.dead && u.within(wx, wy, u.hitSize * 0.7 + 2);
            }) != null;
            var onFriendlyBuild = (under != null && under.team === player.team());
            if (!onControllableUnit && !onFriendlyBuild) {
                stopMining(unit);
                try { Vars.control.input.inv.hide(); } catch (e1) {}
                try { Vars.control.input.config.hideConfig(); } catch (e2) {}
                Call.unitClear(player);
            }
        }
    }

    if (justPressed(bindings.NRM_RESEARCH)) {
        if (Vars.state.isCampaign()) Vars.ui.research.show();
        else toast("[scarlet]Research is only available in campaign");
    }

    if (justPressed(bindings.NRM_SKIP_WAVE)) {
        if (Vars.net.client()) { if (player.admin) Call.adminRequest(player, Packages.mindustry.net.Packets.AdminAction.wave, null); }
        else Vars.logic.skipWave();
    }

    var shooting = alive && isDown(bindings.NRM_SHOOT);
    player.shooting = shooting;
    if (unit) { unit.aim(wx, wy); unit.controlWeapons(true, shooting); }
}

function buildMode(player, unit, alive, wx, wy, dpadX, dpadY, dt) {
    var input = Vars.control.input;
    player.shooting = false;

    if (justPressed(bindings.BLD_SUB_CAT)) { buildSubMode = "category"; toast("[accent]Category select"); }

    var rotConsumed = false;
    if (clipboard != null && justPressed(bindings.BLD_ROTATE)) { rotateClipboard(); rotConsumed = true; }

    if (bindings.BLD_SUB_BLOCK === bindings.BLD_ROTATE) {
        if (justPressed(bindings.BLD_SUB_BLOCK) && !rotConsumed) {
            if (buildSubMode === "block") input.rotation = (input.rotation + 1) % 4;
            else { buildSubMode = "block"; toast("[accent]Block select"); }
            updateSelectedBlock();
        }
    } else {
        if (justPressed(bindings.BLD_SUB_BLOCK)) { buildSubMode = "block"; toast("[accent]Block select"); updateSelectedBlock(); }
        if (justPressed(bindings.BLD_ROTATE) && !rotConsumed) { input.rotation = (input.rotation + 1) % 4; updateSelectedBlock(); }
    }

    if (dpadCooldown > 0) dpadCooldown -= dt;
    if ((dpadX !== 0 || dpadY !== 0) && dpadCooldown <= 0) {
        dpadCooldown = 10;
        if (buildSubMode === "category") {
            var catCols = 2;
            var totalCats = Category.all.length;
            var cRow = Math.floor(selectedCatIndex / catCols);
            var cCol = selectedCatIndex % catCols;
            if (dpadX !== 0) {
                var nextCol = Mathf.clamp(cCol + dpadX, 0, catCols - 1);
                var candX = cRow * catCols + nextCol;
                if (candX < totalCats) selectedCatIndex = candX;
            }
            if (dpadY !== 0) {
                var candY = selectedCatIndex + (-dpadY * catCols);
                if (candY >= 0 && candY < totalCats) selectedCatIndex = candY;
            }
            selectedBlockIndex = 0;
            syncCategoryUI();
            updateSelectedBlock();
        } else {
            var blocks = getBlocksInCategory(selectedCatIndex);
            if (blocks.length > 0) {
                var blkCols = 4;
                var bRow = Math.floor(selectedBlockIndex / blkCols);
                var bCol = selectedBlockIndex % blkCols;
                if (dpadX !== 0) {
                    var maxCol = Math.min(blkCols - 1, blocks.length - 1 - bRow * blkCols);
                    var nextBCol = Mathf.clamp(bCol + dpadX, 0, maxCol);
                    selectedBlockIndex = bRow * blkCols + nextBCol;
                }
                if (dpadY !== 0) {
                    var candBY = selectedBlockIndex + (-dpadY * blkCols);
                    if (candBY >= 0 && candBY < blocks.length) selectedBlockIndex = candBY;
                }
                updateSelectedBlock();
            }
        }
    }
    if (dpadX === 0 && dpadY === 0) dpadCooldown = 0;

    var blk = input.block;
    var off = blk ? blk.offset : 0;
    var px = World.toTile(wx - off), py = World.toTile(wy - off);
    var tx = World.toTile(wx), ty = World.toTile(wy);
    var canB = unit && unit.canBuild();
    var cancelPlaceConsumed = false;

    if ((clipboard == null || bindings.BLD_PLACE !== bindings.BLD_PASTE) && !placing && !removing && justPressed(bindings.BLD_PLACE) && blk != null && canB) {
        placing = true; placeStartX = px; placeStartY = py;
    }
    if (placing) {
        if (blk == null || !canB) {
            placing = false; linePoints = null;
        } else {
            linePoints = computeLine(placeStartX, placeStartY, px, py, blk, input.rotation);
            for (var i = 0; i < linePoints.length; i++) {
                var lp = linePoints[i];
                lp.valid = Build.validPlace(blk, player.team(), lp.x, lp.y, lp.rot);
            }
            if (justPressed(bindings.BLD_CANCEL_PLACE)) {
                placing = false; linePoints = null; cancelPlaceConsumed = true;
                toast("[lightgray]Build cancelled");
            } else if (!isDown(bindings.BLD_PLACE)) {
                for (var j = 0; j < linePoints.length; j++) {
                    var q = linePoints[j];
                    if (q.valid) unit.addBuild(new BuildPlan(q.x, q.y, q.rot, blk, blk.lastConfig));
                }
                input.isBuilding = true;
                placing = false; linePoints = null;
            }
        }
    }

    if (!removing && !placing && !cancelPlaceConsumed && justPressed(bindings.BLD_REMOVE) && canB) { removing = true; breakStartX = tx; breakStartY = ty; }
    if (removing) {
        breakEndX = Mathf.clamp(tx, breakStartX - (MAX_LINE - 1), breakStartX + (MAX_LINE - 1));
        breakEndY = Mathf.clamp(ty, breakStartY - (MAX_LINE - 1), breakStartY + (MAX_LINE - 1));
        if (!canB || justPressed(bindings.BLD_CANCEL_REMOVE)) { removing = false; toast("[lightgray]Deconstruction cancelled"); }
        else if (!isDown(bindings.BLD_REMOVE)) { commitRemove(player, unit, breakStartX, breakStartY, breakEndX, breakEndY); removing = false; }
    }

    if (clipboard != null) {
        if (tx !== pasteLastTX || ty !== pasteLastTY) {
            pasteLastTX = tx; pasteLastTY = ty;
            pasteView = buildPasteView(player, tx, ty);
        }
        if (justPressed(bindings.BLD_PASTE) && canB && !placing && !removing) {
            var okCount = 0;
            for (var m = 0; m < pasteView.length; m++) {
                var pv = pasteView[m];
                if (pv.valid) { unit.addBuild(new BuildPlan(pv.x, pv.y, pv.rot, pv.block, pv.config)); okCount++; }
            }
            if (okCount > 0) input.isBuilding = true;
            pasteLastTX = -9999;
            toast("[accent]Placed: [white]" + okCount + " of " + pasteView.length);
        }
    }

    var cAct = bindings.BLD_CANCEL_ACTION;
    var cBlk = bindings.BLD_COPY_BLOCK;
    var cArea = bindings.BLD_COPY_AREA;

    if (cAct !== cBlk && cAct !== cArea && justPressed(cAct)) {
        if (placing || removing) { placing = false; linePoints = null; removing = false; toast("[lightgray]Cancelled"); }
        else cancelAll(unit);
    }

    if (cBlk !== cAct && cBlk !== cArea && justPressed(cBlk)) copyBlockAt(player, tx, ty);

    var holdBtnPressed = -1;
    if (justPressed(cArea)) holdBtnPressed = cArea;
    else if (cBlk === cAct && justPressed(cBlk)) holdBtnPressed = cBlk;

    if (holdBtnPressed >= 0) {
        if ((placing || removing) && holdBtnPressed === cAct) {
            placing = false; linePoints = null; removing = false;
            toast("[lightgray]Cancelled");
        } else {
            copyArmed = true; copyBtn = holdBtnPressed; copying = false; xHoldFrames = 0;
            copyStartX = tx; copyStartY = ty; copyEndX = tx; copyEndY = ty;
        }
    }

    if (copyArmed) {
        if (isDown(copyBtn)) {
            xHoldFrames += dt;
            copyEndX = Mathf.clamp(tx, copyStartX - (MAX_LINE - 1), copyStartX + (MAX_LINE - 1));
            copyEndY = Mathf.clamp(ty, copyStartY - (MAX_LINE - 1), copyStartY + (MAX_LINE - 1));
            copying = (xHoldFrames >= HOLD_FRAMES) || (copyBtn === cArea && cArea !== cAct);
        } else {
            if (!copying) {
                if (copyBtn === cAct) cancelAll(unit);
            } else if (copyEndX === copyStartX && copyEndY === copyStartY) {
                if (copyBtn === cBlk) copyBlockAt(player, copyEndX, copyEndY);
                else if (copyBtn === cArea) copyArea(player, copyStartX, copyStartY, copyEndX, copyEndY);
            } else {
                if (copyBtn === cArea) copyArea(player, copyStartX, copyStartY, copyEndX, copyEndY);
                else if (copyBtn === cBlk) copyBlockAt(player, copyEndX, copyEndY);
            }
            copyArmed = false; copying = false; xHoldFrames = 0;
        }
    }
}

function cancelAll(unit) {
    var input = Vars.control.input;
    if (clipboard != null) { clipboard = null; pasteView = null; toast("[lightgray]Clipboard cleared"); return; }
    var hadPlans = unit && unit.plans.size > 0;
    if (unit) unit.clearBuilding();
    try { input.selectPlans.clear(); } catch (e) {}
    if (!hadPlans) input.block = null;
    toast("[accent]Cancelled");
}

var JPoint2 = Packages.arc.math.geom.Point2;

function rotateConfig(cfg) {
    if (cfg == null || typeof cfg.getClass !== "function") return cfg;
    try {
        if (cfg instanceof JPoint2) return new JPoint2(-cfg.y, cfg.x);
        var cls = cfg.getClass();
        if (cls.isArray() && String(cls.getComponentType().getName()) === "arc.math.geom.Point2") {
            var out = java.lang.reflect.Array.newInstance(cls.getComponentType(), cfg.length);
            for (var i = 0; i < cfg.length; i++) out[i] = (cfg[i] == null) ? null : new JPoint2(-cfg[i].y, cfg[i].x);
            return out;
        }
    } catch (e) { logOnce("rotateConfig", e); }
    return cfg;
}

function rotateClipboard() {
    if (clipboard == null) return;
    for (var i = 0; i < clipboard.length; i++) {
        var c = clipboard[i];
        var off = c.block.offset;
        var wx = c.dx * TS + off, wy = c.dy * TS + off;
        var nwx = -wy, nwy = wx;
        c.dx = World.toTile(nwx - off);
        c.dy = World.toTile(nwy - off);
        c.rot = (c.rot + 1) % 4;
        c.config = rotateConfig(c.config);
    }
    pasteLastTX = -9999;
    toast("[accent]Schematic rotated");
}

function buildPasteView(player, tx, ty) {
    var out = [];
    for (var i = 0; i < clipboard.length; i++) {
        var c = clipboard[i];
        var x = tx + c.dx, y = ty + c.dy;
        out.push({ x: x, y: y, rot: c.rot, block: c.block, config: c.config, valid: Build.validPlace(c.block, player.team(), x, y, c.rot) });
    }
    return out;
}

function computeLine(sx, sy, ex, ey, blk, baseRot) {
    var step = Math.max(1, blk.size);
    var dx = ex - sx, dy = ey - sy;
    var horizontal = Math.abs(dx) >= Math.abs(dy);
    var len = Math.min(horizontal ? Math.abs(dx) : Math.abs(dy), MAX_LINE - 1);
    var dirx = horizontal ? (dx < 0 ? -1 : 1) : 0;
    var diry = horizontal ? 0 : (dy < 0 ? -1 : 1);
    var rot = baseRot;
    if (len > 0 && blk.conveyorPlacement) rot = horizontal ? (dirx > 0 ? 0 : 2) : (diry > 0 ? 1 : 3);
    var pts = [];
    for (var i = 0; i <= len; i += step) pts.push({ x: sx + dirx * i, y: sy + diry * i, rot: rot, valid: true });
    return pts;
}

function commitRemove(player, unit, x1, y1, x2, y2) {
    var minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    var minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    var seen = {};
    var count = 0;
    for (var x = minX; x <= maxX; x++) {
        for (var y = minY; y <= maxY; y++) {
            var t = Vars.world.tile(x, y);
            if (t == null) continue;
            if (t.build != null) t = t.build.tile;
            var key = t.x + "," + t.y;
            if (seen[key]) continue;
            seen[key] = true;
            if (Build.validBreak(player.team(), t.x, t.y)) { unit.addBuild(new BuildPlan(t.x, t.y)); count++; }
        }
    }
    if (count > 0) Vars.control.input.isBuilding = true;
}

function copyBlockAt(player, tileX, tileY) {
    var input = Vars.control.input;
    var tb = Vars.world.build(tileX, tileY);
    if (tb == null || tb.team !== player.team() || !isBlockAvailable(tb.block)) return;

    var blk = tb.block, rot = buildRot(tb);
    selectedCatIndex = blk.category.ordinal();
    var list = getBlocksInCategory(selectedCatIndex);
    for (var i = 0; i < list.length; i++) if (list[i] === blk) selectedBlockIndex = i;
    syncCategoryUI();

    clipboard = null; pasteView = null;
    input.block = blk;
    input.rotation = rot;
    if (blk.configurable) blk.lastConfig = tb.config();
    toast("[accent]Copied: [white]" + blk.localizedName);
}

function copyArea(player, x1, y1, x2, y2) {
    var minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    var minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    var ax = Math.floor((minX + maxX) / 2), ay = Math.floor((minY + maxY) / 2);
    var seen = {};
    var list = [];
    for (var x = minX; x <= maxX; x++) {
        for (var y = minY; y <= maxY; y++) {
            var t = Vars.world.tile(x, y);
            if (t == null || t.build == null) continue;
            var b = t.build;
            var key = b.tile.x + "," + b.tile.y;
            if (seen[key]) continue;
            seen[key] = true;
            var blk = b.block;
            if (b.team !== player.team() || !isBlockAvailable(blk) || blk.rebuildable === false) continue;
            list.push({ dx: b.tile.x - ax, dy: b.tile.y - ay, rot: buildRot(b), block: blk, config: blk.configurable ? b.config() : null });
        }
    }
    if (list.length === 0) { toast("[scarlet]Nothing to copy in the selected area"); return; }

    clipboard = list;
    pasteView = null;
    pasteLastTX = -9999;
    Vars.control.input.block = null;
    toast("[accent]Copied buildings: [white]" + list.length);
}

function fireCmdChange() { try { Events.fire(Trigger.unitCommandChange); } catch (e) {} }

function toggleSelectAt(player, sel, wx, wy) {
    var input = Vars.control.input;
    var cb = input.commandBuildings;

    var u = Units.closest(player.team(), wx, wy, 24, function (x) { return x.isCommandable(); });
    var b = Vars.world.buildWorld(wx, wy);
    var factory = (b != null && b.team === player.team() && Boolean(b.block.commandable)) ? b : null;

    if (factory != null && cb != null && (u == null || !u.within(wx, wy, u.hitSize / 2 + 4))) {
        sel.clear();
        if (cb.contains(factory)) cb.remove(factory); else cb.add(factory);
        fireCmdChange();
        return;
    }
    if (u != null) {
        if (cb != null) cb.clear();
        if (sel.contains(u)) sel.remove(u); else sel.add(u);
        fireCmdChange();
    }
}

function sendBuildingsCommand(player, builds, pos) {
    if (builds == null || builds.size === 0) return;
    var ids = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, builds.size);
    for (var i = 0; i < builds.size; i++) ids[i] = builds.get(i).pos();
    try { Call.commandBuilds(player, ids, pos); }
    catch (e) { for (var j = 0; j < builds.size; j++) { try { builds.get(j).onCommand(pos); } catch (e2) { logOnce("commandBuilds", e2); } } }
    try { Fx.commandSend.at(pos.x, pos.y); } catch (ef) {}
    toast("[accent]Rally point set");
}

var JSchematic = Packages.mindustry.game.Schematic;
var JStile = Packages.mindustry.game.Schematic$Stile;
var JStringMap = Packages.arc.struct.StringMap;
var JSeq = Packages.arc.struct.Seq;

var nameDialog = null, nameLbl = null, nameActive = false, nameOpenedAt = 0;
var nameSyms = [], nameDX = 0, nameDY = 0;
var NAME_FACE = [0, 1, 2, 3];
var NAME_FACE_SYM = ["✕", "○", "△", "□"];
var NAME_MAX = 12;

function updateNameLabel() { if (nameLbl != null) nameLbl.setText("[accent]" + nameSyms.join(" ") + "[lightgray]_"); }

function buildNameDialog() {
    nameDialog = new JBaseDialog("Save schematic");
    nameLbl = new JLabel("", JStyles.outlineLabel);
    nameDialog.cont.add("Name with buttons:").row();
    nameDialog.cont.add(nameLbl).padTop(14).padBottom(14).row();
    nameDialog.cont.add("[lightgray]D-pad ← ↑ → ↓ and ✕ ○ △ □ add symbols\nL1 - erase   Options - save   Share - cancel").row();
    try { nameDialog.hidden(runnable(function () { nameActive = false; })); } catch (e) {}
}

function openSaveDialog() {
    if (clipboard == null) return;
    try {
        if (nameDialog == null) buildNameDialog();
        nameSyms = [];
        nameDX = Math.round(pad.axes[AXIS_DPAD_X] || 0);
        nameDY = Math.round(pad.axes[AXIS_DPAD_Y] || 0);
        updateNameLabel();
        nameActive = true;
        nameOpenedAt = java.lang.System.currentTimeMillis();
        nameDialog.show();
    } catch (e) { nameActive = false; logOnce("open save dialog", e); toast("[scarlet]Can't open save dialog: " + e); }
}

function saveClipboardSchematic(name) {
    if (clipboard == null || clipboard.length === 0) throw "clipboard is empty";
    var minx = 1000000, miny = 1000000, maxx = -1000000, maxy = -1000000;
    for (var i = 0; i < clipboard.length; i++) {
        var c = clipboard[i];
        var size = c.block.size;
        var top = Math.floor(size / 2);
        var bot = (size % 2 === 1) ? -Math.floor(size / 2) : -Math.floor((size - 1) / 2);
        minx = Math.min(minx, c.dx + bot); maxx = Math.max(maxx, c.dx + top);
        miny = Math.min(miny, c.dy + bot); maxy = Math.max(maxy, c.dy + top);
    }
    var tiles = new JSeq();
    for (var j = 0; j < clipboard.length; j++) {
        var q = clipboard[j];
        tiles.add(new JStile(q.block, q.dx - minx, q.dy - miny, q.config, q.rot & 3));
    }
    var schem = new JSchematic(tiles, new JStringMap(), maxx - minx + 1, maxy - miny + 1);
    schem.tags.put("name", name);
    Vars.schematics.add(schem);
}

var pickDialog = null, pickLbl = null, pickActive = false, pickOpenedAt = 0;
var pickList = [], pickIdx = 0, pickDY = 0, pickDX = 0, pickCd = 0;
var PICK_ROWS = 9;

function escMarkup(s) { return String(s).replace(/\[/g, "[["); }

function updatePickLabel() {
    if (pickLbl == null) return;
    var n = pickList.length;
    var start = Math.max(0, Math.min(pickIdx - Math.floor(PICK_ROWS / 2), n - PICK_ROWS));
    var end = Math.min(n, start + PICK_ROWS);
    var s = "";
    for (var i = start; i < end; i++) {
        var sc = pickList[i];
        var info = "  [lightgray]" + sc.width + "x" + sc.height + ", blocks: " + sc.tiles.size + "[]";
        if (i === pickIdx) s += "[accent]> " + escMarkup(sc.name()) + "[]" + info + "\n";
        else s += "[white]   " + escMarkup(sc.name()) + "[]" + info + "\n";
    }
    s += "\n[lightgray]" + (pickIdx + 1) + " / " + n;
    pickLbl.setText(s);
}

function buildPickDialog() {
    pickDialog = new JBaseDialog("Schematics");
    pickLbl = new JLabel("", JStyles.outlineLabel);
    pickDialog.cont.add(pickLbl).left().minWidth(420).row();
    pickDialog.cont.add("[lightgray]↑ ↓ - select   ← → - jump 5   ✕ - take schematic   ○ - close").padTop(14).row();
    try { pickDialog.hidden(runnable(function () { pickActive = false; })); } catch (e) {}
}

function openSchemPicker() {
    try {
        pickList = seqToArray(Vars.schematics.all());
        if (pickList.length === 0) { toast("[scarlet]No saved schematics"); return; }
        if (pickDialog == null) buildPickDialog();
        pickIdx = Mathf.clamp(pickIdx, 0, pickList.length - 1);
        pickDY = Math.round(pad.axes[AXIS_DPAD_Y] || 0);
        pickDX = Math.round(pad.axes[AXIS_DPAD_X] || 0);
        pickCd = 0;
        updatePickLabel();
        pickActive = true;
        pickOpenedAt = java.lang.System.currentTimeMillis();
        pickDialog.show();
    } catch (e) { pickActive = false; logOnce("open schematic picker", e); }
}

function loadSchematicToClipboard(schem) {
    var tiles = seqToArray(schem.tiles);
    if (tiles.length === 0) { toast("[scarlet]Schematic is empty"); return; }
    var ax = Math.floor(schem.width / 2), ay = Math.floor(schem.height / 2);
    var list = [];
    for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        list.push({ dx: t.x - ax, dy: t.y - ay, rot: t.rotation, block: t.block, config: t.config });
    }
    clipboard = list;
    pasteView = null;
    pasteLastTX = -9999;
    Vars.control.input.block = null;
    toast("[accent]Schematic in clipboard: [white]" + schem.name());
}

function pickTick(dt) {
    if (!pickActive) return false;
    var now = java.lang.System.currentTimeMillis();
    if (pickDialog == null || (now - pickOpenedAt > 500 && !pickDialog.isShown())) { pickActive = false; return false; }
    var n = pickList.length;
    var dy = Math.round(pad.axes[AXIS_DPAD_Y] || 0);
    var dx = Math.round(pad.axes[AXIS_DPAD_X] || 0);
    var changed = false;

    if (dy !== 0) {
        pickCd -= dt;
        if (dy !== pickDY || pickCd <= 0) {
            pickIdx = Mathf.clamp(pickIdx + (dy > 0 ? 1 : -1), 0, n - 1);
            pickCd = (dy !== pickDY) ? 20 : 6;
            changed = true;
        }
    } else {
        pickCd = 0;
    }
    if (dx !== 0 && dx !== pickDX) { pickIdx = Mathf.clamp(pickIdx + dx * 5, 0, n - 1); changed = true; }
    pickDY = dy; pickDX = dx;
    if (changed) updatePickLabel();

    if (justPressed(bindings.MNU_CLICK_1) || justPressed(bindings.MNU_CLICK_2)) {
        var chosen = pickList[pickIdx];
        pickActive = false;
        pickDialog.hide();
        loadSchematicToClipboard(chosen);
    } else if (justPressed(bindings.MNU_BACK_1) || justPressed(bindings.MNU_BACK_2) || justPressed(bindings.MNU_BACK_3)) {
        pickActive = false;
        pickDialog.hide();
    }
    return true;
}

function nameTick() {
    if (!nameActive) return false;
    var now = java.lang.System.currentTimeMillis();
    if (nameDialog == null || (now - nameOpenedAt > 500 && !nameDialog.isShown())) { nameActive = false; return false; }
    var changed = false;

    var dx = Math.round(pad.axes[AXIS_DPAD_X] || 0);
    var dy = Math.round(pad.axes[AXIS_DPAD_Y] || 0);
    if (dx !== 0 && dx !== nameDX && nameSyms.length < NAME_MAX) { nameSyms.push(dx > 0 ? "→" : "←"); changed = true; }
    if (dy !== 0 && dy !== nameDY && nameSyms.length < NAME_MAX) { nameSyms.push(dy > 0 ? "↓" : "↑"); changed = true; }
    nameDX = dx; nameDY = dy;

    for (var i = 0; i < NAME_FACE.length; i++) {
        if (justPressed(NAME_FACE[i]) && nameSyms.length < NAME_MAX) { nameSyms.push(NAME_FACE_SYM[i]); changed = true; }
    }
    if (justPressed(4) && nameSyms.length > 0) { nameSyms.pop(); changed = true; }
    if (changed) updateNameLabel();

    if (justPressed(9)) {
        if (nameSyms.length === 0) {
            toast("[scarlet]Enter at least one symbol");
        } else {
            try {
                saveClipboardSchematic(nameSyms.join(""));
                toast("[accent]Schematic saved: [white]" + nameSyms.join(""));
                nameActive = false;
                nameDialog.hide();
            } catch (e) { logOnce("save schematic", e); toast("[scarlet]Save failed: " + e); }
        }
    } else if (justPressed(8)) {
        nameActive = false;
        nameDialog.hide();
    }
    return true;
}

function commandMode(player, unit, wx, wy, dpadX, dpadY, dt) {
    var input = Vars.control.input;
    var sel = input.selectedUnits;
    var cb = input.commandBuildings;
    player.shooting = false;
    input.commandMode = true;

    var pdata = cmdPanelData();
    cmdPanelNav(pdata, dpadX, dpadY, dt);

    var bSingle = bindings.CMD_SELECT_SINGLE;
    var bRect = bindings.CMD_SELECT_RECT;

    if (bSingle !== bRect && justPressed(bSingle)) toggleSelectAt(player, sel, wx, wy);

    if (justPressed(bRect)) {
        cmdSelecting = true; cmdStartX = wx; cmdStartY = wy;
    } else if (justReleased(bRect) && cmdSelecting) {
        cmdSelecting = false;
        if (Mathf.dst(cmdStartX, cmdStartY, wx, wy) < 12) {
            if (bSingle === bRect) toggleSelectAt(player, sel, wx, wy);
        } else {
            var minX = Math.min(cmdStartX, wx), maxX = Math.max(cmdStartX, wx);
            var minY = Math.min(cmdStartY, wy), maxY = Math.max(cmdStartY, wy);
            sel.clear();
            if (cb != null) cb.clear();
            Groups.unit.each(function (x) {
                if (x.team === player.team() && x.isCommandable() && x.x >= minX && x.x <= maxX && x.y >= minY && x.y <= maxY) sel.add(x);
            });
            fireCmdChange();
        }
    }

    var eu = Units.closestEnemy(player.team(), wx, wy, 20, function (x) { return true; });
    var eb = Vars.world.buildWorld(wx, wy);
    if (eb != null && eb.team === player.team()) eb = null;
    var hasTarget = (eu != null || eb != null);

    var orderTarget = hasTarget && justPressed(bindings.CMD_ORDER_TARGET);
    var orderMove = !orderTarget && justPressed(bindings.CMD_ORDER_MOVE) && (!hasTarget || bindings.CMD_ORDER_MOVE !== bindings.CMD_ORDER_TARGET);

    if (orderTarget) {
        sendUnitsCommand(player, sel, eb, eu, new Vec2(wx, wy));
        sendBuildingsCommand(player, cb, new Vec2(wx, wy));
    } else if (orderMove) {
        sendUnitsCommand(player, sel, null, null, new Vec2(wx, wy));
        sendBuildingsCommand(player, cb, new Vec2(wx, wy));
    }

    if (justPressed(bindings.CMD_CLEAR_SEL)) { sel.clear(); if (cb != null) cb.clear(); fireCmdChange(); }

    if (justPressed(bindings.CMD_SELECT_ALL)) {
        sel.clear();
        if (cb != null) cb.clear();
        Groups.unit.each(function (x) { if (x.team === player.team() && x.isCommandable()) sel.add(x); });
        fireCmdChange();
    }

    if (justPressed(bindings.CMD_PANEL_CLICK)) cmdPanelActivate(player, sel, pdata);
}

var JTable = Packages.arc.scene.ui.layout.Table;
var JStack = Packages.arc.scene.ui.layout.Stack;
var JSlider = Packages.arc.scene.ui.Slider;
var JLabel = Packages.arc.scene.ui.Label;
var JCheckBox = Packages.arc.scene.ui.CheckBox;
var JScrollPane = Packages.arc.scene.ui.ScrollPane;
var JTouchable = Packages.arc.scene.event.Touchable;
var JBaseDialog = Packages.mindustry.ui.dialogs.BaseDialog;
var JStyles = Packages.mindustry.ui.Styles;
var JIcon = Packages.mindustry.gen.Icon;

var ctrlDialog = null, ctrlContent = null, ctrlBtn = null;
var menuObj = null, menuSearched = false;
var currentTab = 0;

var TAB_NAMES = ["1. General", "2. Normal", "3. Build", "4. Command", "5. Menu", "6. Minimap"];

var bindButtons = {}, bindLabels = {}, capShownSec = -1;
var capKey = null, capEnd = 0, capStart = 0, capWaitRelease = true;
var CAP_TIMEOUT_MS = 8000;

function physName(i) {
    var n = (i >= 0 && i < PHYS_NAMES.length) ? PHYS_NAMES[i] : "Button";
    return "#" + i + " " + n;
}

function rowWidth() { return Math.min(Core.graphics.getWidth() / 1.12, 760); }

function addHeader(t, text) {
    t.add(text).color(Pal.accent).padTop(16).padBottom(4).left().row();
    t.image().color(Pal.accent).height(3).growX().padBottom(6).row();
}

function addDivider(t) { t.image().color(Pal.darkerGray).height(1).growX().padTop(3).padBottom(3).row(); }

function addBindRow(t, def) {
    var isDefault = (bindings[def.key] === def.def);
    var row = new JTable();
    row.add(def.label).left().growX().wrap().padRight(12);

    var keyLbl = new JLabel(physName(bindings[def.key]), JStyles.outlineLabel);
    row.add(keyLbl).color(isDefault ? Pal.accent : Color.white).width(150).right().padRight(12);
    bindLabels[def.key] = keyLbl;

    var cell = row.button("Change", runnable(function () { if (capKey === def.key) endCapture(); else beginCapture(def.key); })).size(140, 42).padRight(6);
    bindButtons[def.key] = cell.get();

    row.button("Reset", runnable(function () {
        capKey = null;
        bindings[def.key] = def.def;
        saveInt("gp-bind-" + def.key, def.def);
        cfgFlush();
        rebuildCtrlContent();
    })).size(115, 42);

    t.add(row).width(rowWidth()).left().padTop(2).row();
    addDivider(t);
}

function addSlider(t, title, key, def, min, max, step, fmt) {
    var row = new JTable();
    var slider = new JSlider(min, max, step, false);
    slider.setValue(cfgInt(key, def));

    var value = new JLabel("", JStyles.outlineLabel);
    var content = new JTable();
    content.add(title, JStyles.outlineLabel).left().growX().wrap();
    content.add(value).color(Pal.accent).padLeft(10).right();
    content.margin(3, 24, 3, 24);
    content.touchable = JTouchable.disabled;

    value.setText(fmt(Math.round(slider.getValue())));
    slider.changed(runnable(function () {
        var v = Math.round(slider.getValue());
        saveInt(key, v);
        value.setText(fmt(v));
        loadConfig();
    }));

    var st = new JStack();
    st.add(slider);
    st.add(content);

    row.add(st).growX().padRight(8);
    row.button("Reset", runnable(function () { cfgRemove(key); loadConfig(); cfgFlush(); rebuildCtrlContent(); })).size(115, 42);

    t.add(row).width(rowWidth()).left().padTop(4).row();
    addDivider(t);
}

function addCheck(t, title, key, def) {
    var row = new JTable();
    var cb = new JCheckBox(title);
    cb.setChecked(cfgBool(key, def));
    cb.changed(runnable(function () { saveBool(key, cb.isChecked()); loadConfig(); }));

    row.add(cb).left().growX().padRight(8);
    row.button("Reset", runnable(function () { cfgRemove(key); loadConfig(); cfgFlush(); rebuildCtrlContent(); })).size(115, 42);

    t.add(row).width(rowWidth()).left().padTop(4).row();
    addDivider(t);
}

function resetCurrentCategory() {
    capKey = null;
    if (currentTab === 0) for (var i = 0; i < CFG_KEYS.length; i++) cfgRemove(CFG_KEYS[i]);
    for (var j = 0; j < BIND_DEFS.length; j++) if (BIND_DEFS[j].cat === currentTab) cfgRemove("gp-bind-" + BIND_DEFS[j].key);
    loadConfig();
    cfgFlush();
    rebuildCtrlContent();
    toast("[accent]Tab \"" + TAB_NAMES[currentTab] + "\" reset");
}

function resetControllerSettings() {
    capKey = null;
    for (var i = 0; i < CFG_KEYS.length; i++) cfgRemove(CFG_KEYS[i]);
    for (var j = 0; j < BIND_DEFS.length; j++) cfgRemove("gp-bind-" + BIND_DEFS[j].key);
    loadConfig();
    cfgFlush();
    rebuildCtrlContent();
    toast("[accent]All controller settings reset");
}

function addTabButton(bar, idx, w) {
    var label = (currentTab === idx) ? ("[accent]" + TAB_NAMES[idx]) : TAB_NAMES[idx];
    bar.button(label, runnable(function () { currentTab = idx; rebuildCtrlContent(); })).size(w, 44).pad(3);
}

function rebuildCtrlContent() {
    var t = ctrlContent;
    if (t == null) return;
    capKey = null;
    bindButtons = {};
    bindLabels = {};
    t.clearChildren();
    t.top();

    var statusRow = new JTable();
    statusRow.add(pad.connected ? "[green]● Controller connected" : "[scarlet]● Controller not found (/dev/input/js*)").left().growX();
    statusRow.button("Reset tab", runnable(resetCurrentCategory)).size(190, 38);
    t.add(statusRow).width(rowWidth()).left().padTop(6).padBottom(6).row();

    var tabBar = new JTable();
    var btnW = Math.floor((rowWidth() - 18) / 3);
    for (var ti = 0; ti < 6; ti++) {
        addTabButton(tabBar, ti, btnW);
        if (ti === 2 || ti === 5) tabBar.row();
    }
    t.add(tabBar).width(rowWidth()).left().padBottom(8).row();

    if (currentTab === 0) {
        addHeader(t, "Main settings");
        addCheck(t, "Enable controller support", "gp-enabled", true);

        addHeader(t, "Stick and camera sensitivity");
        addSlider(t, "Cursor speed (stick)", "gp-cursor", 18, 4, 50, 1, function (v) { return "" + v; });
        addSlider(t, "Camera speed (d-pad)", "gp-pan", 12, 2, 40, 1, function (v) { return "" + v; });
        addSlider(t, "Zoom speed", "gp-zoom", 50, 5, 200, 5, function (v) { return (v / 1000).toFixed(3); });
        addSlider(t, "Stick deadzone", "gp-deadzone", 16, 0, 50, 1, function (v) { return v + "%"; });
        addSlider(t, "Button hold time", "gp-hold", 20, 5, 60, 1, function (v) { return (v / 60).toFixed(2) + " s"; });
        addSlider(t, "Menu scroll speed (right stick)", "gp-scroll", 20, 2, 80, 1, function (v) { return "" + v; });

        addHeader(t, "Axis inversion");
        addCheck(t, "Invert zoom", "gp-invzoom", false);
        addCheck(t, "Invert cursor Y axis in menus", "gp-flipy", false);
        addCheck(t, "Invert menu scroll", "gp-scrollinv", false);
    }

    var lastSub = "";
    for (var i = 0; i < BIND_DEFS.length; i++) {
        var d = BIND_DEFS[i];
        if (d.cat !== currentTab) continue;
        var subName = d.sub || TAB_NAMES[currentTab];
        if (subName !== lastSub) { lastSub = subName; addHeader(t, subName); }
        addBindRow(t, d);
    }
}

function buildCtrlDialog() {
    ctrlDialog = new JBaseDialog("Controller settings");
    ctrlDialog.addCloseButton();
    ctrlDialog.buttons.button("Reset all", JIcon.refresh, runnable(resetControllerSettings)).size(240, 64);
    try { ctrlDialog.hidden(runnable(function () { capKey = null; cfgFlush(); })); } catch (eh) {}

    ctrlContent = new JTable();
    var pane = new JScrollPane(ctrlContent);
    pane.setScrollingDisabled(true, false);
    pane.setFlickScroll(false);
    pane.setFadeScrollBars(false);
    ctrlDialog.cont.add(pane).grow();
}

function openCtrlSettings() {
    try {
        if (ctrlDialog == null) buildCtrlDialog();
        rebuildCtrlContent();
        ctrlDialog.show();
    } catch (e) { logOnce("open controller settings", e); }
}

function refreshBindButtons() {
    var now = java.lang.System.currentTimeMillis();
    for (var i = 0; i < BIND_DEFS.length; i++) {
        var k = BIND_DEFS[i].key;
        var btn = bindButtons[k];
        var lbl = bindLabels[k];
        if (btn == null) continue;
        try {
            if (capKey === k) {
                var rem = Math.max(0, Math.ceil((capEnd - now) / 1000));
                btn.setText("[accent]Press... " + rem);
                if (lbl != null) lbl.setText("...");
            } else {
                btn.setText("Change");
                if (lbl != null) lbl.setText(physName(bindings[k]));
            }
        } catch (e) {}
    }
}

function beginCapture(key) {
    capKey = key;
    capStart = java.lang.System.currentTimeMillis();
    capEnd = capStart + CAP_TIMEOUT_MS;
    capWaitRelease = true;
    capShownSec = -1;
    refreshBindButtons();
}

function endCapture() { capKey = null; refreshBindButtons(); }

function bindButton(key, idx) {
    bindings[key] = idx;
    saveInt("gp-bind-" + key, idx);
    cfgFlush();
    rebuildCtrlContent();
}

function captureTick() {
    if (capKey == null) return false;
    var now = java.lang.System.currentTimeMillis();
    if (ctrlDialog == null || (now - capStart > 500 && !ctrlDialog.isShown())) { capKey = null; return false; }
    if (now >= capEnd) { endCapture(); return false; }
    var sec = Math.ceil((capEnd - now) / 1000);
    if (sec !== capShownSec) { capShownSec = sec; refreshBindButtons(); }

    if (capWaitRelease) {
        var any = false;
        for (var i = 0; i < 20; i++) if (rawDown(i)) { any = true; break; }
        if (!any) capWaitRelease = false;
        return true;
    }
    for (var b = 0; b < 20; b++) {
        if (rawDown(b)) {
            var key = capKey;
            capKey = null;
            bindButton(key, b);
            suppressAllHeld();
            return true;
        }
    }
    return true;
}

function cellText(a) { try { return String(a.getText()); } catch (e) { return null; } }

function menuHasControls(tbl, ctrlText) {
    try {
        var cells = tbl.getCells();
        for (var i = 0; i < cells.size; i++) {
            var a = cells.get(i).get();
            if (a != null && cellText(a) === ctrlText) return true;
        }
    } catch (e) {}
    return false;
}

function findSettingsMenu(dlg) {
    var ctrlText = String(Core.bundle.get("settings.controls"));
    var c = dlg.getClass();
    while (c != null) {
        var fs = c.getDeclaredFields();
        for (var i = 0; i < fs.length; i++) {
            try {
                fs[i].setAccessible(true);
                var v = fs[i].get(dlg);
                if (v != null && typeof v.getCells === "function" && menuHasControls(v, ctrlText)) return v;
            } catch (e) {}
        }
        c = c.getSuperclass();
    }
    return null;
}

function createCtrlButton() {
    var tmp = new JTable();
    var ic = JIcon.wrench;
    if (ic == null) ic = JIcon.settings;
    var isz = (Vars.iconMed != null) ? Vars.iconMed : 32;
    var b = tmp.button("Controller", ic, JStyles.flatt, isz, runnable(openCtrlSettings)).get();
    try { b.marginLeft(8); } catch (e) {}
    b.name = "gamepad-settings-button";
    return b;
}

function ensureCtrlButton() {
    if (Vars.ui == null || Vars.ui.settings == null) return;
    if (!menuSearched) {
        menuSearched = true;
        menuObj = findSettingsMenu(Vars.ui.settings);
        if (menuObj == null) Log.warn("[Linux-Gamepad] Settings menu table not found; controller settings button not added");
    }
    var menu = menuObj;
    if (menu == null) return;
    if (ctrlBtn == null) ctrlBtn = createCtrlButton();
    if (ctrlBtn.parent === menu) return;

    var cells = menu.getCells();
    var actors = [];
    for (var i = 0; i < cells.size; i++) {
        var a = cells.get(i).get();
        if (a != null && a !== ctrlBtn) actors.push(a);
    }

    var ctrlText = String(Core.bundle.get("settings.controls"));
    var at = -1;
    for (var j = 0; j < actors.length; j++) if (cellText(actors[j]) === ctrlText) { at = j; break; }
    if (at < 0) at = Math.min(4, actors.length - 1);

    menu.clearChildren();
    menu.defaults().size(300, 60);
    try { ctrlBtn.remove(); } catch (e) {}
    for (var k = 0; k < actors.length; k++) {
        menu.add(actors[k]).row();
        if (k === at) menu.add(ctrlBtn).row();
    }
    if (actors.length === 0) menu.add(ctrlBtn).row();
}

function uiTick() { ensureCtrlButton(); }

var JButton = Packages.arc.scene.ui.Button;
var elemVisField = null;

function isElemVisible(el) {
    if (el == null) return false;
    try {
        if (elemVisField == null) {
            var c = el.getClass();
            while (c != null) {
                try { var f = c.getDeclaredField("visible"); f.setAccessible(true); elemVisField = f; break; } catch (e0) {}
                c = c.getSuperclass();
            }
        }
        if (elemVisField != null) return Boolean(elemVisField.getBoolean(el));
    } catch (e) {}
    return true;
}

function findCmdHeaderLabel(el, title) {
    if (!isElemVisible(el)) return null;
    if (cellText(el) === title) return el;
    try {
        var ch = el.getChildren();
        for (var i = 0; i < ch.size; i++) {
            var found = findCmdHeaderLabel(ch.get(i), title);
            if (found != null) return found;
        }
    } catch (e) {}
    return null;
}

function findCmdPanelRoot() {
    try {
        var title = String(Core.bundle.get("commandmode.name"));
        var lbl = findCmdHeaderLabel(Vars.ui.hudGroup, title);
        if (lbl != null) {
            var p = lbl.parent;
            while (p != null && p.parent != null && p.parent !== Vars.ui.hudGroup) p = p.parent;
            return p;
        }
    } catch (e) {}
    return null;
}

function collectCmdButtons(el, out, sx, sy, limitArea) {
    if (!isElemVisible(el)) return;
    if (el instanceof JButton) {
        var w = el.getWidth() * sx, h = el.getHeight() * sy;
        if (w > 10 && h > 10) {
            var p = el.localToStageCoordinates(Tmp.v1.set(0, 0));
            var bx = p.x * sx, by = p.y * sy;
            if (!limitArea || (bx < Core.graphics.getWidth() * 0.45 && by < Core.graphics.getHeight() * 0.55)) out.push({ btn: el, x: bx, y: by, w: w, h: h });
        }
        return;
    }
    try {
        var ch = el.getChildren();
        for (var i = 0; i < ch.size; i++) collectCmdButtons(ch.get(i), out, sx, sy, limitArea);
    } catch (e) {}
}

function cmdPanelData() {
    var raw = [];
    try {
        var sx = Core.graphics.getWidth() / Math.max(1, Core.scene.getWidth());
        var sy = Core.graphics.getHeight() / Math.max(1, Core.scene.getHeight());
        var root = findCmdPanelRoot();
        if (root != null) collectCmdButtons(root, raw, sx, sy, false);
        else collectCmdButtons(Vars.ui.hudGroup, raw, sx, sy, true);
    } catch (e) {}

    raw.sort(function (a, b) { return b.y - a.y; });
    var rows = [];
    for (var i = 0; i < raw.length; i++) {
        var it = raw[i];
        var placed = false;
        for (var r = 0; r < rows.length; r++) {
            if (Math.abs(rows[r][0].y - it.y) < 14) { rows[r].push(it); placed = true; break; }
        }
        if (!placed) rows.push([it]);
    }
    for (var k = 0; k < rows.length; k++) rows[k].sort(function (a, b) { return a.x - b.x; });
    return rows;
}

function cmdPanelClamp(rows) {
    if (rows.length === 0) { cmdRow = 0; cmdCol = 0; return; }
    cmdRow = Mathf.clamp(cmdRow, 0, rows.length - 1);
    cmdCol = Mathf.clamp(cmdCol, 0, rows[cmdRow].length - 1);
}

function cmdPanelNav(rows, dpadX, dpadY, dt) {
    if (dpadCooldown > 0) dpadCooldown -= dt;
    if (dpadX === 0 && dpadY === 0) { dpadCooldown = 0; return; }
    if (dpadCooldown > 0 || rows.length === 0) return;
    dpadCooldown = 10;

    cmdPanelClamp(rows);
    if (dpadY !== 0) cmdRow = Mathf.clamp(cmdRow - dpadY, 0, rows.length - 1);
    cmdPanelClamp(rows);
    if (dpadX !== 0) cmdCol = Mathf.clamp(cmdCol + dpadX, 0, rows[cmdRow].length - 1);
}

function cmdPanelActivate(player, sel, rows) {
    cmdPanelClamp(rows);
    if (rows.length === 0 || rows[cmdRow].length === 0) return;
    var f = rows[cmdRow][cmdCol];
    try {
        var cx = Math.round(f.x + f.w / 2);
        var cy = Math.round(f.y + f.h / 2);
        var sy = SCENE_FLIP_Y ? (Core.graphics.getHeight() - 1 - cy) : cy;
        Core.scene.touchDown(cx, sy, 0, KeyCode.mouseLeft);
        Core.scene.touchUp(cx, sy, 0, KeyCode.mouseLeft);
        syncMousePosition();
    } catch (e) { logOnce("cmd click", e); }
}

function drawCommandPanel() {
    var rows = cmdPanelData();
    if (rows.length === 0) return;
    cmdPanelClamp(rows);
    var focused = rows[cmdRow][cmdCol];
    Lines.stroke(4, Color.black);
    Lines.rect(focused.x - 3, focused.y - 3, focused.w + 6, focused.h + 6);
    Lines.stroke(2, Color.white);
    Lines.rect(focused.x - 3, focused.y - 3, focused.w + 6, focused.h + 6);
    Draw.reset();
}

function onFrame() {
    if (!active()) { if (uiMouseDown) updateMenuMouseClick(false); return; }
    var dt = Math.min(Core.graphics.getDeltaTime() * 60, 4);
    var inUI = Vars.state.isMenu() || Core.scene.hasDialog();

    if (captureTick() || nameTick() || pickTick(dt)) {
        handleMenu(dt, true);
        wasInUI = true;
        savePrevState();
        return;
    }

    if (inUI) handleMenu(dt, false);
    else handleGame(dt);

    wasInUI = inUI;
    savePrevState();
}

Core.app.post(new java.lang.Runnable({
    run: function () {
        try { loadConfig(); } catch (e0) { logOnce("loadConfig", e0); }
        Core.app.addListener(new ApplicationListener({
            update: function () {
                try { uiTick(); } catch (e1) { logOnce("settings ui", e1); }
                try { onFrame(); } catch (e) { logOnce("update", e); }
            }
        }));
    }
}));

Events.run(Trigger.draw, function () {
    try {
        if (!active() || !Vars.state.isGame()) return;
        Vars.control.input.commandMode = (currentMode === MODE_COMMAND);
        if (currentMode === MODE_BUILD) {
            Draw.z(Layer.overlayUI);
            var pb = Vars.control.input.block;
            if (placing && linePoints != null && pb != null) {
                for (var i = 0; i < linePoints.length; i++) {
                    var p = linePoints[i];
                    var cx = p.x * TS + pb.offset, cy = p.y * TS + pb.offset;
                    Draw.color(p.valid ? Color.white : Pal.remove, 0.65);
                    Draw.rect(pb.uiIcon, cx, cy, pb.size * TS, pb.size * TS, pb.rotate ? p.rot * 90 : 0);
                    Lines.stroke(1, p.valid ? Pal.accent : Pal.remove);
                    Lines.square(cx, cy, pb.size * TS / 2);
                }
            }
            if (clipboard != null && pasteView != null) {
                for (var k = 0; k < pasteView.length; k++) {
                    var pp = pasteView[k];
                    var pcx = pp.x * TS + pp.block.offset, pcy = pp.y * TS + pp.block.offset;
                    Draw.color(pp.valid ? Color.white : Pal.remove, 0.6);
                    Draw.rect(pp.block.uiIcon, pcx, pcy, pp.block.size * TS, pp.block.size * TS, pp.block.rotate ? pp.rot * 90 : 0);
                    Lines.stroke(1, pp.valid ? Pal.accent : Pal.remove);
                    Lines.square(pcx, pcy, pp.block.size * TS / 2);
                }
            }
            if (copying) {
                var cx0 = Math.min(copyStartX, copyEndX) * TS - TS / 2;
                var cy0 = Math.min(copyStartY, copyEndY) * TS - TS / 2;
                Lines.stroke(1.5, Pal.heal);
                Lines.rect(cx0, cy0, (Math.abs(copyEndX - copyStartX) + 1) * TS, (Math.abs(copyEndY - copyStartY) + 1) * TS);
            }
            if (removing) {
                var rx = Math.min(breakStartX, breakEndX) * TS - TS / 2;
                var ry = Math.min(breakStartY, breakEndY) * TS - TS / 2;
                Lines.stroke(1.5, Pal.remove);
                Lines.rect(rx, ry, (Math.abs(breakEndX - breakStartX) + 1) * TS, (Math.abs(breakEndY - breakStartY) + 1) * TS);
            }
            Draw.reset();
        }

        if (currentMode === MODE_COMMAND) {
            var cbs = Vars.control.input.commandBuildings;
            if (cbs != null && cbs.size > 0) {
                Draw.z(Layer.overlayUI);
                Lines.stroke(1.5, Pal.heal);
                for (var qi = 0; qi < cbs.size; qi++) {
                    var qb = cbs.get(qi);
                    if (qb != null && qb.isValid()) Lines.square(qb.x, qb.y, qb.block.size * TS / 2 + 1);
                }
                Draw.reset();
            }
        }

        if (currentMode === MODE_COMMAND && cmdSelecting) {
            var wp = Core.camera.unproject(Tmp.v1.set(cursorX, cursorY));
            Draw.z(Layer.overlayUI);
            Lines.stroke(1.5, Pal.heal);
            Lines.rect(Math.min(cmdStartX, wp.x), Math.min(cmdStartY, wp.y), Math.abs(wp.x - cmdStartX), Math.abs(wp.y - cmdStartY));
            Draw.reset();
        }
    } catch (e) { logOnce("draw world", e); }
});

try {
    Events.run(Trigger.uiDrawEnd, function () {
        try {
            if (!active() || !cursorReady) return;
            if (Vars.ui.minimapfrag != null && Vars.ui.minimapfrag.shown()) return;
            var w = Core.graphics.getWidth(), h = Core.graphics.getHeight();
            Draw.proj(Tmp.m1.setOrtho(0, 0, w, h));

            var inUI = Vars.state.isMenu() || Core.scene.hasDialog();
            var col = inUI ? Color.white : (currentMode === MODE_NORMAL) ? Pal.accent : (currentMode === MODE_BUILD) ? Pal.place : Pal.heal;

            if (!inUI && Vars.state.isGame() && currentMode === MODE_COMMAND) drawCommandPanel();

            Lines.stroke(4, Color.black);
            Lines.circle(cursorX, cursorY, 6);
            Lines.stroke(2, col);
            Lines.circle(cursorX, cursorY, 6);
            Lines.line(cursorX - 12, cursorY, cursorX - 4, cursorY);
            Lines.line(cursorX + 4, cursorY, cursorX + 12, cursorY);
            Lines.line(cursorX, cursorY - 12, cursorX, cursorY - 4);
            Lines.line(cursorX, cursorY + 4, cursorX, cursorY + 12);
            Draw.reset();

            if (!inUI && Vars.state.isGame()) {
                var l1 = "", l2 = null;
                if (currentMode === MODE_NORMAL) {
                    l1 = "[accent]NORMAL";
                } else if (currentMode === MODE_BUILD) {
                    var blk = Vars.control.input.block;
                    var dirs = ["→", "↑", "←", "↓"];
                    l1 = "[#9aa8ff]BUILD " + (buildSubMode === "category" ? "[△ category]" : "[□ block]");
                    l2 = "[lightgray]" + categoryName(selectedCatIndex) + ": [white]" + (blk ? blk.localizedName + " " + dirs[Vars.control.input.rotation] : "—");
                } else {
                    var cbn = Vars.control.input.commandBuildings;
                    l1 = "[green]COMMAND (" + Vars.control.input.selectedUnits.size + (cbn != null && cbn.size > 0 ? " + " + cbn.size + " bld" : "") + ")";
                }
                var f = Fonts.outline;
                f.draw(l1, cursorX, cursorY + (l2 ? 42 : 30), Align.center);
                if (l2) f.draw(l2, cursorX, cursorY + 28, Align.center);
                Draw.reset();
            }
            Draw.flush();
        } catch (e) { logOnce("draw ui", e); }
    });
} catch (e) { Log.warn("[Linux-Gamepad] Trigger.uiDrawEnd unavailable, screen cursor will not be drawn: " + e); }

})();
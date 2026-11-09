(function () {

var os = java.lang.System.getProperty("os.name").toLowerCase();
if (Vars.headless || os.indexOf("linux") === -1) return;

// ---------------------------------------------------------------------------
//  Физические индексы кнопок (меняются в Настройки -> Контроллер)
// ---------------------------------------------------------------------------
var BTN_CROSS = 0;
var BTN_CIRCLE = 1;
var BTN_TRIANGLE = 2;
var BTN_SQUARE = 3;
var BTN_L1 = 4;
var BTN_R1 = 5;
var BTN_L2 = 6;
var BTN_R2 = 7;
var BTN_SHARE = 8;
var BTN_OPTIONS = 9;
var BTN_L3 = 11;
var BTN_R3 = 12;

var AXIS_LX = 0, AXIS_LY = 1, AXIS_L2 = 2;
var AXIS_RX = 3, AXIS_RY = 4, AXIS_R2 = 5;
var AXIS_DPAD_X = 6, AXIS_DPAD_Y = 7;

// Значения по умолчанию (перезаписываются из настроек в loadConfig)
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
var stanceLocal = {}, cmdLocalCmd = null;
var pendingCtl = null;

var MODE_NORMAL = 0, MODE_BUILD = 1, MODE_COMMAND = 2;

var currentMode = MODE_NORMAL;
var buildSubMode = "category";
var selectedCatIndex = 0;
var selectedBlockIndex = 0;

var pad = {
    connected: false,
    axes: [0, 0, -1, 0, 0, -1, 0, 0],
    buttons: [],
    prevButtons: []
};
for (var bi = 0; bi < 32; bi++) { pad.buttons.push(false); pad.prevButtons.push(false); }

var suppressed = {};
var wasInUI = true;

var cursorX = -1, cursorY = -1;
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

var cArmed = false, cHold = 0, cActed = false;
var inspectBuild = null;
var inspectHoverItem = null;
var PANEL_X = 20, PANEL_W = 210, PANEL_ROW_H = 30, PANEL_GAP = 4;

var cmdSelecting = false, cmdStartX = 0, cmdStartY = 0;
var cmdCycleIndex = 0;

var uiMouseDown = false;
var errLogged = {};

function logOnce(tag, e) {
    if (errLogged[tag]) return;
    errLogged[tag] = true;
    Log.err("[Linux-Gamepad] " + tag + ": " + e);
}
function toast(msg) {
    try { Vars.ui.hudfrag.showToast(msg); } catch (e) {}
}
function runnable(fn) {
    return new java.lang.Runnable({ run: fn });
}

// ---------------------------------------------------------------------------
//  Конфигурация (хранится в Core.settings, ключи "gp-*")
// ---------------------------------------------------------------------------
var BIND_DEFS = [
    { key: "CROSS",    def: 0,  label: "Cross: клик в меню, действие, удержание — бросить / копировать" },
    { key: "CIRCLE",   def: 1,  label: "Circle: назад, отмена, удержание — осмотр хранилища" },
    { key: "TRIANGLE", def: 2,  label: "Triangle: пропуск волны, категории, выбрать всех юнитов" },
    { key: "SQUARE",   def: 3,  label: "Square: исследования, выбор блока, поворот, режим юнитов" },
    { key: "L1",       def: 4,  label: "L1: режим командования" },
    { key: "R1",       def: 5,  label: "R1: режим строительства" },
    { key: "L2",       def: 6,  label: "L2: обычный режим, закрыть окно" },
    { key: "R2",       def: 7,  label: "R2: огонь, строить, выделять, клик в меню" },
    { key: "SHARE",    def: 8,  label: "Share: пауза" },
    { key: "OPTIONS",  def: 9,  label: "Options: меню паузы / назад" },
    { key: "L3",       def: 11, label: "L3 (нажатие стика): приблизить камеру" },
    { key: "R3",       def: 12, label: "R3 (нажатие стика): отдалить камеру" }
];
var CFG_KEYS = ["gp-enabled", "gp-cursor", "gp-pan", "gp-zoom", "gp-deadzone", "gp-hold", "gp-invzoom", "gp-flipy", "gp-scroll", "gp-scrollinv"];
var PHYS_NAMES = ["Cross", "Circle", "Triangle", "Square", "L1", "R1", "L2", "R2", "Share", "Options", "PS", "L3", "R3"];
var bindings = {};
for (var bd = 0; bd < BIND_DEFS.length; bd++) bindings[BIND_DEFS[bd].key] = BIND_DEFS[bd].def;

function applyBindings() {
    BTN_CROSS = bindings.CROSS;
    BTN_CIRCLE = bindings.CIRCLE;
    BTN_TRIANGLE = bindings.TRIANGLE;
    BTN_SQUARE = bindings.SQUARE;
    BTN_L1 = bindings.L1;
    BTN_R1 = bindings.R1;
    BTN_L2 = bindings.L2;
    BTN_R2 = bindings.R2;
    BTN_SHARE = bindings.SHARE;
    BTN_OPTIONS = bindings.OPTIONS;
    BTN_L3 = bindings.L3;
    BTN_R3 = bindings.R3;
}

// Все значения хранятся СТРОКАМИ: так Rhino/Arc не путают типы (Integer/Double),
// из-за чего раньше getInt() мог падать, и настройки не применялись.
var CFG_PREFIX = "gpv2-";

function cfgGet(key) {
    try {
        var v = Core.settings.getString(CFG_PREFIX + key, "");
        return (v == null) ? "" : String(v);
    } catch (e) { return ""; }
}
function cfgInt(key, def) {
    var n = parseInt(cfgGet(key), 10);
    return isNaN(n) ? def : n;
}
function cfgBool(key, def) {
    var s = cfgGet(key);
    if (s === "1") return true;
    if (s === "0") return false;
    return def;
}
function cfgPut(key, v) {
    try { Core.settings.put(CFG_PREFIX + key, String(v)); } catch (e) { logOnce("cfg put", e); }
}
function cfgRemove(key) {
    try { Core.settings.remove(CFG_PREFIX + key); } catch (e) {}
}
function cfgFlush() {
    try { Core.settings.forceSave(); } catch (e) {}
}

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
    for (var i = 0; i < BIND_DEFS.length; i++) {
        var d = BIND_DEFS[i];
        bindings[d.key] = cfgInt("gp-bind-" + d.key, d.def);
    }
    applyBindings();
}

function saveInt(key, v) { cfgPut(key, Math.round(v)); }
function saveBool(key, v) { cfgPut(key, v ? "1" : "0"); }

try { loadConfig(); } catch (e) { Log.warn("[Linux-Gamepad] loadConfig: " + e); }

function active() {
    return pad.connected && cfgEnabled;
}

// ---------------------------------------------------------------------------
//  Ввод
// ---------------------------------------------------------------------------
function applyDeadzone(v) {
    v = v || 0;
    var a = Math.abs(v);
    if (a < DEADZONE) return 0;
    return (v < 0 ? -1 : 1) * Math.min(1, (a - DEADZONE) / (1 - DEADZONE));
}

// Физические кнопки 6 и 7 — триггеры: у них есть запасной вариант через оси.
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
function savePrevState() {
    for (var i = 0; i < 20; i++) pad.prevButtons[i] = isDown(i);
}
function suppressAllHeld() {
    for (var i = 0; i < 20; i++) if (rawDown(i)) suppressed[i] = true;
}

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
            if (nm === wanted && (tp === "int" || tp === "float")) {
                fs[i].setAccessible(true);
                return fs[i];
            }
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
} catch (e) {
    Log.warn("[Linux-Gamepad] Mouse reflection failed: " + e);
}

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
    if (cursorX < 0) { cursorX = w / 2; cursorY = h / 2; }
    cursorX = Mathf.clamp(cursorX, 0, w - 1);
    cursorY = Mathf.clamp(cursorY, 0, h - 1);
    try {
        setField(mouseXField, cursorX);
        setField(mouseYField, cursorY);
    } catch (e) { logOnce("mouse field", e); }
    Core.scene.mouseMoved(Math.round(cursorX), sceneY());
}

function moveCursor(sx, sy, dt) {
    cursorX += sx * Math.abs(sx) * CURSOR_SPEED * dt;
    cursorY += sy * Math.abs(sy) * CURSOR_SPEED * dt;
}

function updateMenuMouseClick(clickHeld) {
    var sx = Math.round(cursorX);
    var sy = sceneY();
    if (clickHeld && !uiMouseDown) {
        uiMouseDown = true;
        Core.scene.touchDown(sx, sy, 0, KeyCode.mouseLeft);
    } else if (clickHeld && uiMouseDown) {
        Core.scene.touchDragged(sx, sy, 0);
    } else if (!clickHeld && uiMouseDown) {
        uiMouseDown = false;
        Core.scene.touchUp(sx, sy, 0, KeyCode.mouseLeft);
    }
}

function triggerEscape() {
    if (Core.scene.hasDialog()) {
        var d = Core.scene.getDialog();
        if (d != null) d.hide();
        return;
    }
    if (Vars.state.isGame()) Vars.ui.paused.show();
}

function togglePause() {
    if (Vars.net.active()) return;
    var S = Packages.mindustry.core.GameState.State;
    if (Vars.state.isPaused()) Vars.state.set(S.playing);
    else if (Vars.state.isPlaying()) Vars.state.set(S.paused);
}

function getBlocksInCategory(catIndex) {
    var cat = Category.all[Mathf.clamp(catIndex, 0, Category.all.length - 1)];
    var list = [];
    var blocks = Vars.content.blocks();
    for (var i = 0; i < blocks.size; i++) {
        var b = blocks.get(i);
        if (b.category === cat && b.isVisible() && b.unlockedNow() && b.placeablePlayer !== false) {
            list.push(b);
        }
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
        try {
            var f = c.getDeclaredField("currentCategory");
            f.setAccessible(true);
            catField = f;
            return f;
        } catch (e) {}
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
        if (el != null) {
            try { el.fireClick(); } catch (e1) {}
        }
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
    cArmed = false; cActed = false;
    inspectBuild = null; inspectHoverItem = null;
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
    try {
        Call.commandUnits(player, ids, buildTarget, unitTarget, pos);
    } catch (e1) {
        try {
            Call.commandUnits(player, ids, buildTarget, unitTarget, pos, false);
        } catch (e2) {
            logOnce("commandUnits", e2);
        }
    }
}

function cycleUnitMode(player, units) {
    if (units.size === 0) return;
    var first = units.get(0);
    var opts = [];
    var cmds = seqToArray(first.type.commands);
    for (var i = 0; i < cmds.length; i++) opts.push({ kind: "cmd", obj: cmds[i] });
    try {
        var sts = seqToArray(first.type.stances);
        for (var j = 0; j < sts.length; j++) opts.push({ kind: "stance", obj: sts[j] });
    } catch (e) {}
    if (opts.length === 0) return;

    cmdCycleIndex = (cmdCycleIndex + 1) % opts.length;
    var o = opts[cmdCycleIndex];
    var ids = unitIds(units);
    try {
        if (o.kind === "cmd") {
            Call.setUnitCommand(player, ids, o.obj);
        } else {
            try { Call.setUnitStance(player, ids, o.obj, true); }
            catch (e3) { Call.setUnitStance(player, ids, o.obj); }
        }
        toast("[accent]Unit mode: [white]" + o.obj.localized());
    } catch (e2) {
        logOnce("unit mode change", e2);
    }
}

function handleMenu(dt, capturing) {
    placing = false; removing = false; linePoints = null;
    copyArmed = false; copying = false;
    cArmed = false; cActed = false;
    inspectBuild = null; inspectHoverItem = null;
    nArmed = false; nDropped = false;

    // Левый стик — курсор, правый стик — прокрутка (как колёсико мыши)
    var mx = applyDeadzone(pad.axes[AXIS_LX]);
    var my = -applyDeadzone(pad.axes[AXIS_LY]);
    moveCursor(mx, my, dt);
    syncMousePosition();

    var rsx = applyDeadzone(pad.axes[AXIS_RX]);
    var rsy = applyDeadzone(pad.axes[AXIS_RY]);
    if (rsx !== 0 || rsy !== 0) {
        try { scrollMenu(rsx, rsy, dt); } catch (e) { logOnce("menu scroll", e); }
    }

    // Пока ждём назначения кнопки — клики и выход из меню отключены
    if (capturing) {
        if (uiMouseDown) updateMenuMouseClick(false);
        return;
    }

    // Крестовина влево/вправо над ползунком — точная подстройка значения
    if (menuDpadCd > 0) menuDpadCd -= dt;
    var ddx = Math.round(pad.axes[AXIS_DPAD_X] || 0);
    if (ddx === 0) {
        menuDpadCd = 0;
    } else if (menuDpadCd <= 0) {
        try { if (adjustSliderUnderCursor(ddx)) menuDpadCd = 6; } catch (e2) { logOnce("slider dpad", e2); }
    }

    updateMenuMouseClick(isDown(BTN_CROSS) || isDown(BTN_R2));

    if (justPressed(BTN_CIRCLE) || justPressed(BTN_L2) || justPressed(BTN_OPTIONS)) triggerEscape();
}

// --- поиск элемента под курсором, прокрутка и подстройка ползунков ---
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
    // Запасной вариант — обычное событие колёсика
    try { Core.scene.scrolled(dx * 0.02, dy * 0.02); } catch (e) {}
}

function adjustSliderUnderCursor(dir) {
    var el = elementUnderCursor();
    while (el != null) {
        if (el instanceof JSlider) {
            el.setValue(el.getValue() + dir * el.getStepSize());
            return true;
        }
        el = el.parent;
    }
    return false;
}

function handleGame(dt) {
    if (wasInUI) suppressAllHeld();
    if (uiMouseDown) updateMenuMouseClick(false);

    var player = Vars.player;
    if (!player) return;
    var alive = !player.dead();
    var unit = alive ? player.unit() : null;
    var input = Vars.control.input;

    processPendingControl(player);

    if (justPressed(BTN_OPTIONS)) { triggerEscape(); return; }
    if (justPressed(BTN_SHARE)) togglePause();

    if (justPressed(BTN_L2)) setMode(MODE_NORMAL);
    else if (justPressed(BTN_R1)) setMode(MODE_BUILD);
    else if (justPressed(BTN_L1)) setMode(MODE_COMMAND);

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

    if (isDown(BTN_L3)) Vars.renderer.scaleCamera(ZOOM_IN_SIGN * ZOOM_SPEED * dt);
    if (isDown(BTN_R3)) Vars.renderer.scaleCamera(-ZOOM_IN_SIGN * ZOOM_SPEED * dt);

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

// Вселение в турель / управляемый блок.
// Сначала пробуем штатный вызов игры; если игра не переключила управление
// (в одиночной игре) — переключаем напрямую через player.unit(blockUnit).
function tryControlBuilding(player, unit, b) {
    var can = false;
    try { can = !!b.canControlSelect(unit); } catch (e) { can = false; }
    var bu = null;
    try { bu = b.unit(); } catch (e2) { bu = null; }
    if (!can && bu == null) return false;

    stopMining(unit);
    try { Call.buildingControlSelect(player, b); } catch (e3) { logOnce("buildingControlSelect", e3); }
    pendingCtl = { b: b, t: 0 };
    return true;
}

function processPendingControl(player) {
    if (pendingCtl == null) return;
    pendingCtl.t += 1;
    if (pendingCtl.t < 6) return;
    var pb = pendingCtl.b;
    pendingCtl = null;
    try {
        if (!pb.isValid() || player.dead()) return;
        var bu = pb.unit();
        if (bu == null) return;
        if (player.unit() === bu) {
            toast("[accent]Управление: [white]" + pb.block.localizedName);
            return;
        }
        if (Vars.net.active()) { toast("[scarlet]Не удалось вселиться в " + pb.block.localizedName); return; }
        var okCtl = true;
        try { if (typeof pb.canControl === "function") okCtl = !!pb.canControl(); } catch (e0) {}
        if (!okCtl) { toast("[scarlet]Эта турель не поддаётся ручному управлению"); return; }
        player.unit(bu);
        toast("[accent]Управление: [white]" + pb.block.localizedName);
    } catch (e) { logOnce("control fallback", e); }
}

function tapAction(player, unit, wx, wy) {
    var target = Units.closest(player.team(), wx, wy, 30, function (u) {
        return !u.isPlayer() && u.type.playerControllable && !u.dead;
    });
    if (target != null) {
        stopMining(unit);
        Call.unitControl(player, target);
        return;
    }
    var b = Vars.world.buildWorld(wx, wy);
    if (b != null && b.team === player.team() && unit != null) {
        if (tryControlBuilding(player, unit, b)) return;
    }
    var ore = Vars.world.tileWorld(wx, wy);
    if (unit && ore != null && ore.block() === Blocks.air && ore.drop() != null) {
        if (!tryStartMining(unit, ore)) toast("[scarlet]Cannot mine here (too far or incompatible unit)");
    } else {
        stopMining(unit);
    }
}

function dropItems(player, unit, wx, wy) {
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
    if (canGive) {
        var range = Vars.itemTransferRange;
        if (range === undefined) range = 24;
        if (!unit.within(b, range)) { toast("[scarlet]Too far"); return; }
        Call.transferInventory(player, b);
        toast("[accent]Items transferred: [white]" + b.block.localizedName);
    } else {
        Call.dropItem(player.angleTo(wx, wy));
        toast("[accent]Items dropped");
    }
}

function getInspectItems(b) {
    var out = [];
    if (b == null || !b.isValid() || b.items == null || !b.block.hasItems) return out;
    var all = Vars.content.items();
    for (var i = 0; i < all.size; i++) {
        var it = all.get(i);
        var amt = b.items.get(it);
        if (amt > 0) out.push({ item: it, amount: amt });
    }
    return out;
}

function updateInspectHover() {
    inspectHoverItem = null;
    if (inspectBuild == null) return;
    var list = getInspectItems(inspectBuild);
    if (list.length === 0) return;

    var topY = Math.round(Core.graphics.getHeight() * 0.65);
    for (var i = 0; i < list.length; i++) {
        var ry = topY - (i + 1) * (PANEL_ROW_H + PANEL_GAP);
        if (cursorX >= PANEL_X && cursorX <= PANEL_X + PANEL_W &&
            cursorY >= ry && cursorY <= ry + PANEL_ROW_H) {
            inspectHoverItem = list[i].item;
            return;
        }
    }
}

function openInspectAt(player, unit, wx, wy) {
    var b = Vars.world.buildWorld(wx, wy);
    if (b == null || !b.interactable(player.team()) || !b.block.hasItems || b.items == null) {
        inspectBuild = null;
        toast("[lightgray]No storage/building with items under cursor");
        return;
    }
    var range = (Vars.itemTransferRange !== undefined) ? Vars.itemTransferRange : 220;
    if (unit && !unit.within(b, range)) {
        toast("[scarlet]Too far");
        return;
    }
    if (getInspectItems(b).length === 0) {
        inspectBuild = null;
        toast("[lightgray]Building is empty: [white]" + b.block.localizedName);
        return;
    }
    inspectBuild = b;
    toast("[accent]Contents: [white]" + b.block.localizedName);
}

function takeFromInspect(player, unit, b, item) {
    if (!unit) return;
    if (b == null || !b.isValid() || b.items == null || b.items.get(item) <= 0) {
        toast("[scarlet]This item is no longer available");
        return;
    }
    var range = (Vars.itemTransferRange !== undefined) ? Vars.itemTransferRange : 220;
    if (!unit.within(b, range)) {
        toast("[scarlet]Too far");
        return;
    }
    var maxFit = unit.maxAccepted(item);
    if (maxFit <= 0) {
        if (unit.stack.amount > 0 && unit.stack.item !== item) {
            toast("[scarlet]Drop " + unit.stack.item.localizedName + " first (hold X)");
        } else {
            toast("[lightgray]Unit inventory is full");
        }
        return;
    }
    var toTake = Math.min(b.items.get(item), maxFit);
    Call.requestItem(player, b, item, toTake);
    toast("[accent]Taken: [white]" + item.localizedName + " x" + toTake);
}

function stopMining(unit) {
    miningTile = null;
    try { if (unit) unit.mineTile = null; } catch (e) {}
}

function tryStartMining(unit, tile) {
    var input = Vars.control.input;
    var ok = false;
    try {
        ok = input.canMine(tile);
    } catch (e) {
        try {
            ok = tile.drop() != null && unit.canMine() && unit.validMine(tile) && tile.block() === Blocks.air;
        } catch (e2) { ok = false; }
    }
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
            try {
                stillOk = unit.validMine(miningTile) && miningTile.drop() != null && miningTile.block() === Blocks.air;
            } catch (e) {}
            if (!stillOk) stopMining(unit);
            else if (unit.mineTile == null) unit.mineTile = miningTile;
        }
    }

    if (justPressed(BTN_CROSS) && alive) {
        nArmed = true; nHold = 0; nDropped = false;
    }
    if (nArmed) {
        if (!alive) {
            nArmed = false;
        } else if (isDown(BTN_CROSS)) {
            nHold += dt;
            if (nHold >= HOLD_FRAMES && !nDropped) {
                nDropped = true;
                dropItems(player, unit, wx, wy);
            }
        } else {
            nArmed = false;
            if (!nDropped) tapAction(player, unit, wx, wy);
        }
    }

    if (inspectBuild != null) {
        var rRange = (Vars.itemTransferRange !== undefined) ? Vars.itemTransferRange : 220;
        if (!alive || !unit || !inspectBuild.isValid() ||
            !inspectBuild.interactable(player.team()) || !unit.within(inspectBuild, rRange)) {
            inspectBuild = null;
            inspectHoverItem = null;
        }
    }
    updateInspectHover();

    if (justPressed(BTN_CIRCLE) && alive) {
        cArmed = true; cHold = 0; cActed = false;
    }
    if (cArmed) {
        if (!alive) {
            cArmed = false;
        } else if (isDown(BTN_CIRCLE)) {
            cHold += dt;
            if (cHold >= HOLD_FRAMES && !cActed) {
                cActed = true;
                if (inspectBuild != null && inspectHoverItem != null) {
                    takeFromInspect(player, unit, inspectBuild, inspectHoverItem);
                } else {
                    openInspectAt(player, unit, wx, wy);
                }
            }
        } else {
            cArmed = false;
            if (!cActed) {
                if (inspectBuild != null) {
                    inspectBuild = null;
                    inspectHoverItem = null;
                    toast("[lightgray]Panel closed");
                } else {
                    Call.unitClear(player);
                }
            }
        }
    }

    if (justPressed(BTN_SQUARE)) {
        if (Vars.state.isCampaign()) Vars.ui.research.show();
        else toast("[scarlet]Research is only available in campaign");
    }

    if (justPressed(BTN_TRIANGLE)) {
        if (Vars.net.client()) {
            if (player.admin) Call.adminRequest(player, Packages.mindustry.net.Packets.AdminAction.wave, null);
        } else {
            Vars.logic.skipWave();
        }
    }

    var shooting = alive && isDown(BTN_R2);
    player.shooting = shooting;
    if (unit) {
        unit.aim(wx, wy);
        unit.controlWeapons(true, shooting);
    }
}

function buildMode(player, unit, alive, wx, wy, dpadX, dpadY, dt) {
    var input = Vars.control.input;
    player.shooting = false;

    if (justPressed(BTN_TRIANGLE)) {
        buildSubMode = "category";
        toast("[accent]Select category");
    }
    if (justPressed(BTN_SQUARE)) {
        if (buildSubMode === "block") {
            input.rotation = (input.rotation + 1) % 4;
        } else {
            buildSubMode = "block";
            toast("[accent]Select block");
        }
        updateSelectedBlock();
    }

    if (dpadCooldown > 0) dpadCooldown -= dt;
    if ((dpadX !== 0 || dpadY !== 0) && dpadCooldown <= 0) {
        dpadCooldown = 10;
        if (buildSubMode === "category") {
            var total = Category.all.length;
            var step = ((dpadX !== 0) ? dpadX : -dpadY) > 0 ? 1 : -1;
            for (var k = 0; k < total; k++) {
                selectedCatIndex = (selectedCatIndex + step + total) % total;
                if (getBlocksInCategory(selectedCatIndex).length > 0) break;
            }
            selectedBlockIndex = 0;
            syncCategoryUI();
            updateSelectedBlock();
        } else {
            var blocks = getBlocksInCategory(selectedCatIndex);
            if (blocks.length > 0) {
                var delta = dpadX + (-dpadY * 4);
                selectedBlockIndex = (selectedBlockIndex + delta + blocks.length * 4) % blocks.length;
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
    var circleConsumed = false;

    if (clipboard == null && !placing && !removing && justPressed(BTN_R2) && blk != null && canB) {
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
            if (justPressed(BTN_CIRCLE)) {
                placing = false; linePoints = null; circleConsumed = true;
                toast("[lightgray]Placement cancelled");
            } else if (!isDown(BTN_R2)) {
                for (var j = 0; j < linePoints.length; j++) {
                    var q = linePoints[j];
                    if (q.valid) unit.addBuild(new BuildPlan(q.x, q.y, q.rot, blk, blk.lastConfig));
                }
                input.isBuilding = true;
                placing = false; linePoints = null;
            }
        }
    }

    if (!removing && !placing && !circleConsumed && justPressed(BTN_CIRCLE) && canB) {
        removing = true; breakStartX = tx; breakStartY = ty;
    }
    if (removing) {
        breakEndX = Mathf.clamp(tx, breakStartX - (MAX_LINE - 1), breakStartX + (MAX_LINE - 1));
        breakEndY = Mathf.clamp(ty, breakStartY - (MAX_LINE - 1), breakStartY + (MAX_LINE - 1));
        if (!canB || justPressed(BTN_R2)) {
            removing = false;
        } else if (!isDown(BTN_CIRCLE)) {
            commitRemove(player, unit, breakStartX, breakStartY, breakEndX, breakEndY);
            removing = false;
        }
    }

    if (clipboard != null) {
        if (tx !== pasteLastTX || ty !== pasteLastTY) {
            pasteLastTX = tx; pasteLastTY = ty;
            pasteView = buildPasteView(player, tx, ty);
        }
        if (justPressed(BTN_R2) && canB && !placing && !removing) {
            var okCount = 0;
            for (var m = 0; m < pasteView.length; m++) {
                var pv = pasteView[m];
                if (pv.valid) {
                    unit.addBuild(new BuildPlan(pv.x, pv.y, pv.rot, pv.block, pv.config));
                    okCount++;
                }
            }
            if (okCount > 0) input.isBuilding = true;
            pasteLastTX = -9999;
            toast("[accent]Placed: [white]" + okCount + " of " + pasteView.length);
        }
    }

    if (justPressed(BTN_CROSS)) {
        if (placing || removing) {
            placing = false; linePoints = null; removing = false;
            toast("[lightgray]Cancelled");
        } else {
            copyArmed = true; copying = false; xHoldFrames = 0;
            copyStartX = tx; copyStartY = ty; copyEndX = tx; copyEndY = ty;
        }
    }
    if (copyArmed) {
        if (isDown(BTN_CROSS)) {
            xHoldFrames += dt;
            copyEndX = Mathf.clamp(tx, copyStartX - (MAX_LINE - 1), copyStartX + (MAX_LINE - 1));
            copyEndY = Mathf.clamp(ty, copyStartY - (MAX_LINE - 1), copyStartY + (MAX_LINE - 1));
            copying = xHoldFrames >= HOLD_FRAMES;
        } else {
            if (!copying) {
                cancelAll(unit);
            } else if (copyEndX === copyStartX && copyEndY === copyStartY) {
                copyBlockAt(player, copyEndX, copyEndY);
            } else {
                copyArea(player, copyStartX, copyStartY, copyEndX, copyEndY);
            }
            copyArmed = false; copying = false; xHoldFrames = 0;
        }
    }
}

function cancelAll(unit) {
    var input = Vars.control.input;
    if (clipboard != null) {
        clipboard = null; pasteView = null;
        toast("[lightgray]Clipboard cleared");
        return;
    }
    var hadPlans = unit && unit.plans.size > 0;
    if (unit) unit.clearBuilding();
    try { input.selectPlans.clear(); } catch (e) {}
    if (!hadPlans) input.block = null;
    toast("[accent]Cancelled");
}

function buildPasteView(player, tx, ty) {
    var out = [];
    for (var i = 0; i < clipboard.length; i++) {
        var c = clipboard[i];
        var x = tx + c.dx, y = ty + c.dy;
        out.push({
            x: x, y: y, rot: c.rot, block: c.block, config: c.config,
            valid: Build.validPlace(c.block, player.team(), x, y, c.rot)
        });
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
    if (len > 0 && blk.conveyorPlacement) {
        rot = horizontal ? (dirx > 0 ? 0 : 2) : (diry > 0 ? 1 : 3);
    }
    var pts = [];
    for (var i = 0; i <= len; i += step) {
        pts.push({ x: sx + dirx * i, y: sy + diry * i, rot: rot, valid: true });
    }
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
            if (Build.validBreak(player.team(), t.x, t.y)) {
                unit.addBuild(new BuildPlan(t.x, t.y));
                count++;
            }
        }
    }
    if (count > 0) Vars.control.input.isBuilding = true;
}

function copyBlockAt(player, tileX, tileY) {
    var input = Vars.control.input;
    var tb = Vars.world.build(tileX, tileY);
    if (tb == null || tb.team !== player.team() || !tb.block.unlockedNow()) return;

    var blk = tb.block, rot = tb.rotation;
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
            if (b.team !== player.team() || !blk.isVisible() || !blk.unlockedNow() || blk.rebuildable === false) continue;
            list.push({
                dx: b.tile.x - ax, dy: b.tile.y - ay, rot: b.rotation,
                block: blk, config: blk.configurable ? b.config() : null
            });
        }
    }
    if (list.length === 0) { toast("[scarlet]Nothing to copy in area"); return; }

    clipboard = list;
    pasteView = null;
    pasteLastTX = -9999;
    Vars.control.input.block = null;
    toast("[accent]Copied buildings: [white]" + list.length + "[accent]. R2 - paste, X - clear");
}

function commandMode(player, unit, wx, wy, dpadX, dpadY, dt) {
    var input = Vars.control.input;
    var sel = input.selectedUnits;
    player.shooting = false;
    try { input.commandMode = true; } catch (e) {}

    // Крестовина — перемещение по панели команд / стоек
    var pdata = cmdPanelData(sel);
    cmdPanelNav(pdata, dpadX, dpadY, dt);

    if (justPressed(BTN_R2)) {
        cmdSelecting = true; cmdStartX = wx; cmdStartY = wy;
    } else if (justReleased(BTN_R2) && cmdSelecting) {
        cmdSelecting = false;
        if (Mathf.dst(cmdStartX, cmdStartY, wx, wy) < 12) {
            var u = Units.closest(player.team(), wx, wy, 24, function (x) { return x.isCommandable(); });
            if (u != null) {
                if (sel.contains(u)) sel.remove(u); else sel.add(u);
            }
        } else {
            var minX = Math.min(cmdStartX, wx), maxX = Math.max(cmdStartX, wx);
            var minY = Math.min(cmdStartY, wy), maxY = Math.max(cmdStartY, wy);
            sel.clear();
            Groups.unit.each(function (x) {
                if (x.team === player.team() && x.isCommandable() &&
                    x.x >= minX && x.x <= maxX && x.y >= minY && x.y <= maxY) sel.add(x);
            });
        }
    }

    if (justPressed(BTN_CROSS)) {
        var eu = Units.closestEnemy(player.team(), wx, wy, 20, function (x) { return true; });
        var eb = Vars.world.buildWorld(wx, wy);
        if (eb != null && eb.team === player.team()) eb = null;
        sendUnitsCommand(player, sel, eb, eu, new Vec2(wx, wy));
    }

    if (justPressed(BTN_CIRCLE)) {
        sel.clear();
        try { input.commandBuildings.clear(); } catch (e2) {}
    }

    if (justPressed(BTN_TRIANGLE)) {
        sel.clear();
        Groups.unit.each(function (x) {
            if (x.team === player.team() && x.isCommandable()) sel.add(x);
        });
    }

    // Квадрат — выбрать / отменить пункт панели под курсором-рамкой
    if (justPressed(BTN_SQUARE)) cmdPanelActivate(player, sel, pdata);
}

// ---------------------------------------------------------------------------
//  Настройки -> Контроллер (страница вставляется сразу после «Управление»)
// ---------------------------------------------------------------------------
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

var bindButtons = {}, capShownSec = -1;
var capKey = null, capEnd = 0, capStart = 0, capWaitRelease = true;
var CAP_TIMEOUT_MS = 8000;

function physName(i) {
    var n = (i >= 0 && i < PHYS_NAMES.length) ? PHYS_NAMES[i] : "Button";
    return "#" + i + " " + n;
}

function rowWidth() {
    return Math.min(Core.graphics.getWidth() / 1.2, 560);
}

function addHeader(t, text) {
    t.add(text).color(Pal.accent).padTop(14).padBottom(4).left().row();
    t.image().color(Pal.accent).height(3).growX().padBottom(6).row();
}

function addSlider(t, title, key, def, min, max, step, fmt) {
    var slider = new JSlider(min, max, step, false);
    slider.setValue(cfgInt(key, def));

    var value = new JLabel("", JStyles.outlineLabel);
    var content = new JTable();
    content.add(title, JStyles.outlineLabel).left().growX().wrap();
    content.add(value).padLeft(10).right();
    content.margin(3, 33, 3, 33);
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
    t.add(st).width(rowWidth()).left().padTop(4).row();
}

function addCheck(t, title, key, def) {
    var cb = new JCheckBox(title);
    cb.setChecked(cfgBool(key, def));
    cb.changed(runnable(function () {
        saveBool(key, cb.isChecked());
        loadConfig();
    }));
    t.add(cb).left().padTop(4).row();
}

function addBindRow(t, def) {
    var row = new JTable();
    row.add(def.label).left().growX().wrap().padRight(12);
    var cell = row.button(physName(bindings[def.key]), runnable(function () {
        if (capKey === def.key) endCapture(); else beginCapture(def.key);
    }));
    cell.size(210, 44);
    bindButtons[def.key] = cell.get();
    t.add(row).width(rowWidth()).left().padTop(4).row();
}

function resetControllerSettings() {
    for (var i = 0; i < CFG_KEYS.length; i++) cfgRemove(CFG_KEYS[i]);
    for (var j = 0; j < BIND_DEFS.length; j++) cfgRemove("gp-bind-" + BIND_DEFS[j].key);
    loadConfig();
    rebuildCtrlContent();
    toast("[accent]Настройки контроллера сброшены");
}

function rebuildCtrlContent() {
    var t = ctrlContent;
    if (t == null) return;
    capKey = null;
    bindButtons = {};
    t.clearChildren();
    t.top();

    t.add(pad.connected ? "[green]Контроллер подключён" : "[scarlet]Контроллер не найден (/dev/input/js*)").left().padTop(6).row();
    t.add("[lightgray]Меню: левый стик — курсор, правый стик — прокрутка, крестовина ←/→ над ползунком — точная настройка").left().width(rowWidth()).wrap().padTop(4).row();

    addHeader(t, "Общие");
    addCheck(t, "Включить поддержку контроллера", "gp-enabled", true);

    addHeader(t, "Чувствительность");
    addSlider(t, "Скорость курсора", "gp-cursor", 18, 4, 50, 1, function (v) { return "" + v; });
    addSlider(t, "Скорость камеры (крестовина)", "gp-pan", 12, 2, 40, 1, function (v) { return "" + v; });
    addSlider(t, "Скорость зума", "gp-zoom", 50, 5, 200, 5, function (v) { return (v / 1000).toFixed(3); });
    addSlider(t, "Мёртвая зона стиков", "gp-deadzone", 16, 0, 50, 1, function (v) { return v + "%"; });
    addSlider(t, "Время удержания кнопки", "gp-hold", 20, 5, 60, 1, function (v) { return (v / 60).toFixed(2) + " с"; });
    addSlider(t, "Скорость прокрутки в меню (правый стик)", "gp-scroll", 20, 2, 80, 1, function (v) { return "" + v; });

    addHeader(t, "Дополнительно");
    addCheck(t, "Инвертировать зум (L3 / R3)", "gp-invzoom", false);
    addCheck(t, "Инвертировать ось Y курсора в меню", "gp-flipy", false);
    addCheck(t, "Инвертировать прокрутку в меню", "gp-scrollinv", false);

    addHeader(t, "Назначение кнопок");
    for (var i = 0; i < BIND_DEFS.length; i++) addBindRow(t, BIND_DEFS[i]);

    t.button("Сбросить всё по умолчанию", JIcon.refresh, runnable(resetControllerSettings)).size(320, 54).padTop(20).padBottom(10).row();
}

function buildCtrlDialog() {
    ctrlDialog = new JBaseDialog("Настройки контроллера");
    ctrlDialog.addCloseButton();
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

// --- назначение кнопки (прямо в строке, курсор при этом продолжает работать) ---
function bindingLabel(key) {
    for (var i = 0; i < BIND_DEFS.length; i++) if (BIND_DEFS[i].key === key) return BIND_DEFS[i].label.split(":")[0];
    return key;
}

function refreshBindButtons() {
    var now = java.lang.System.currentTimeMillis();
    for (var i = 0; i < BIND_DEFS.length; i++) {
        var k = BIND_DEFS[i].key;
        var btn = bindButtons[k];
        if (btn == null) continue;
        try {
            if (capKey === k) btn.setText("Нажмите кнопку... " + Math.max(0, Math.ceil((capEnd - now) / 1000)));
            else btn.setText(physName(bindings[k]));
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

function endCapture() {
    capKey = null;
    refreshBindButtons();
}

function bindButton(key, idx) {
    var old = bindings[key];
    var swapped = null;
    for (var i = 0; i < BIND_DEFS.length; i++) {
        var d = BIND_DEFS[i];
        if (d.key !== key && bindings[d.key] === idx) {
            bindings[d.key] = old;
            saveInt("gp-bind-" + d.key, old);
            swapped = d.key;
        }
    }
    bindings[key] = idx;
    saveInt("gp-bind-" + key, idx);
    applyBindings();
    cfgFlush();
    refreshBindButtons();
    if (swapped != null) toast("[accent]" + bindingLabel(swapped) + " получила " + physName(old));
}

// Возвращает true, пока идёт ожидание нажатия.
function captureTick() {
    if (capKey == null) return false;
    var now = java.lang.System.currentTimeMillis();
    if (ctrlDialog == null || (now - capStart > 500 && !ctrlDialog.isShown())) {
        capKey = null;
        return false;
    }
    if (now >= capEnd) {
        endCapture();
        return false;
    }
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

// --- вставка кнопки в меню настроек сразу после «Управление» ---
function cellText(a) {
    try { return String(a.getText()); } catch (e) { return null; }
}

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
    var b = tmp.button("Контроллер", ic, JStyles.flatt, isz, runnable(openCtrlSettings)).get();
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
    for (var j = 0; j < actors.length; j++) {
        if (cellText(actors[j]) === ctrlText) { at = j; break; }
    }
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

function uiTick() {
    ensureCtrlButton();
}

// ---------------------------------------------------------------------------
//  Панель «Режим командования» (всегда видна в режиме командования)
// ---------------------------------------------------------------------------
function cmdPanelData(sel) {
    var first = (sel.size > 0) ? sel.get(0) : null;
    var d = { first: first, count: sel.size, cmds: [], stances: [] };
    if (first != null) {
        try { d.cmds = seqToArray(first.type.commands); } catch (e) {}
        try { d.stances = seqToArray(first.type.stances); } catch (e2) {}
    }
    return d;
}

function cmdPanelClamp(data) {
    var rows = [data.cmds, data.stances];
    if (rows[cmdRow].length === 0 && rows[1 - cmdRow].length > 0) cmdRow = 1 - cmdRow;
    var n = rows[cmdRow].length;
    cmdCol = (n === 0) ? 0 : Mathf.clamp(cmdCol, 0, n - 1);
}

function cmdPanelNav(data, dpadX, dpadY, dt) {
    if (dpadCooldown > 0) dpadCooldown -= dt;
    if (dpadX === 0 && dpadY === 0) { dpadCooldown = 0; return; }
    if (dpadCooldown > 0) return;
    dpadCooldown = 10;

    cmdPanelClamp(data);
    var rows = [data.cmds, data.stances];
    if (dpadY !== 0) {
        var other = 1 - cmdRow;
        if (rows[other].length > 0) cmdRow = other;
    }
    if (dpadX !== 0) {
        var n = rows[cmdRow].length;
        if (n > 0) cmdCol = (cmdCol + dpadX + n) % n;
    }
    cmdPanelClamp(data);
}

function cmdItemName(o) {
    try { return String(o.localized()); } catch (e) { return String(o.name); }
}

function cmdItemIcon(o) {
    try { var ic = o.getIcon(); if (ic != null) return ic; } catch (e) {}
    try { var ic2 = JIcon.icons.get(o.icon); if (ic2 != null) return ic2; } catch (e2) {}
    return null;
}

function isCmdActive(first, obj) {
    if (first == null) return false;
    try {
        var c = first.controller();
        if (c.command !== undefined) return c.command === obj;
    } catch (e) {}
    return cmdLocalCmd === obj;
}

function isStanceActive(first, st) {
    if (first == null) return false;
    try {
        var c = first.controller();
        if (typeof c.hasStance === "function") return !!c.hasStance(st);
    } catch (e) {}
    try {
        var c2 = first.controller();
        if (c2.stances != null && typeof c2.stances.contains === "function") return !!c2.stances.contains(st);
    } catch (e2) {}
    return !!stanceLocal[String(st.name)];
}

function cmdPanelActivate(player, sel, data) {
    cmdPanelClamp(data);
    var row = (cmdRow === 0) ? data.cmds : data.stances;
    if (sel.size === 0 || row.length === 0) { toast("[lightgray]Сначала выберите юнитов (R2 / △)"); return; }
    var obj = row[cmdCol];
    var ids = unitIds(sel);
    try {
        if (cmdRow === 0) {
            var target = obj;
            if (isCmdActive(data.first, obj)) {
                // «Отмена» команды — возвращаем обычное перемещение
                var def = null;
                try { def = UnitCommand.moveCommand; } catch (e0) {}
                if (def == null && data.cmds.length > 0) def = data.cmds[0];
                if (def != null) target = def;
            }
            Call.setUnitCommand(player, ids, target);
            cmdLocalCmd = target;
            toast((target === obj ? "[accent]Команда: [white]" : "[lightgray]Отмена, команда: [white]") + cmdItemName(target));
        } else {
            var on = !isStanceActive(data.first, obj);
            try { Call.setUnitStance(player, ids, obj, on); }
            catch (e1) { Call.setUnitStance(player, ids, obj); }
            stanceLocal[String(obj.name)] = on;
            toast((on ? "[accent]Стойка включена: [white]" : "[lightgray]Стойка отключена: [white]") + cmdItemName(obj));
        }
    } catch (e) { logOnce("cmd panel activate", e); }
}

function drawCommandPanel(w, h) {
    var sel = Vars.control.input.selectedUnits;
    var data = cmdPanelData(sel);
    cmdPanelClamp(data);

    var ITEM = 46, GAP = 6, PAD = 12;
    var nMax = Math.max(data.cmds.length, data.stances.length, 4);
    var pw = Math.max(340, PAD * 2 + nMax * (ITEM + GAP) - GAP);
    var ph = 262;
    var px = 20, py = Math.round(h * 0.55) - ph;
    var f = Fonts.outline;

    Draw.color(0, 0, 0, 0.78);
    Fill.rect(px + pw / 2, py + ph / 2, pw, ph);
    Lines.stroke(2, Pal.accent);
    Lines.rect(px, py, pw, ph);
    Draw.reset();

    var y = py + ph - PAD;
    f.draw("[accent]Режим командования", px + pw / 2, y, Align.center);
    y -= 28;
    Lines.stroke(2, Pal.accent);
    Lines.line(px + PAD, y, px + pw - PAD, y);
    Draw.reset();
    y -= 8;

    if (data.first != null) {
        try { Draw.rect(data.first.type.uiIcon, px + PAD + 18, y - 18, 32, 32); } catch (e) {}
        Draw.reset();
        f.draw("[white]Выбрано: " + data.count, px + PAD + 44, y - 10, Align.left);
    } else {
        f.draw("[scarlet]Нет выбранных юнитов", px + PAD, y - 10, Align.left);
    }
    y -= 40;

    var labels = ["Команды", "Стойки"];
    var rows = [data.cmds, data.stances];
    for (var r = 0; r < 2; r++) {
        f.draw("[lightgray]" + labels[r], px + PAD, y, Align.left);
        y -= 18;
        var items = rows[r];
        for (var i = 0; i < items.length; i++) {
            var o = items[i];
            var ix = px + PAD + i * (ITEM + GAP), iy = y - ITEM;
            var focused = (cmdRow === r && cmdCol === i);
            var on = (r === 0) ? isCmdActive(data.first, o) : isStanceActive(data.first, o);

            Draw.color(0.08, 0.08, 0.08, 0.95);
            Fill.rect(ix + ITEM / 2, iy + ITEM / 2, ITEM, ITEM);
            if (on) {
                Draw.color(Pal.accent, 0.35);
                Fill.rect(ix + ITEM / 2, iy + ITEM / 2, ITEM, ITEM);
            }
            Draw.reset();

            var ic = cmdItemIcon(o);
            if (ic != null) {
                try { Draw.color(Color.white); ic.draw(ix + 8, iy + 8, ITEM - 16, ITEM - 16); } catch (e1) {}
                Draw.reset();
            } else {
                f.draw("[white]" + cmdItemName(o).substring(0, 3), ix + ITEM / 2, iy + ITEM / 2 + 6, Align.center);
            }

            Lines.stroke(focused ? 3 : 1, focused ? Pal.accent : Color.gray);
            Lines.rect(ix, iy, ITEM, ITEM);
            Draw.reset();
        }
        y -= ITEM + 8;
    }

    var fr = (cmdRow === 0) ? data.cmds : data.stances;
    if (data.count === 0) {
        f.draw("[lightgray]Выберите юнитов: R2 или △ (всех)", px + PAD, y, Align.left);
    } else {
        var nm = (fr.length > 0) ? "[accent]" + cmdItemName(fr[cmdCol]) + "  " : "";
        f.draw(nm + "[lightgray]□ — выбрать/отмена", px + PAD, y, Align.left);
    }
    Draw.reset();
}

// ---------------------------------------------------------------------------
//  Главный цикл
// ---------------------------------------------------------------------------
function onFrame() {
    if (!active()) {
        if (uiMouseDown) updateMenuMouseClick(false);
        return;
    }
    var dt = Math.min(Core.graphics.getDeltaTime() * 60, 4);
    var inUI = Vars.state.isMenu() || Core.scene.hasDialog();

    if (captureTick()) {
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
                var rw = (Math.abs(breakEndX - breakStartX) + 1) * TS;
                var rh = (Math.abs(breakEndY - breakStartY) + 1) * TS;
                Lines.stroke(1.5, Pal.remove);
                Lines.rect(rx, ry, rw, rh);
            }
            Draw.reset();
        }
        if (currentMode === MODE_COMMAND && cmdSelecting) {
            var wp = Core.camera.unproject(Tmp.v1.set(cursorX, cursorY));
            Draw.z(Layer.overlayUI);
            Lines.stroke(1.5, Pal.heal);
            Lines.rect(Math.min(cmdStartX, wp.x), Math.min(cmdStartY, wp.y),
                       Math.abs(wp.x - cmdStartX), Math.abs(wp.y - cmdStartY));
            Draw.reset();
        }
    } catch (e) { logOnce("draw world", e); }
});

try {
    Events.run(Trigger.uiDrawEnd, function () {
        try {
            if (!active() || cursorX < 0) return;
            var w = Core.graphics.getWidth(), h = Core.graphics.getHeight();
            Draw.proj(Tmp.m1.setOrtho(0, 0, w, h));

            var inUI = Vars.state.isMenu() || Core.scene.hasDialog();
            var col = inUI ? Color.white :
                      (currentMode === MODE_NORMAL) ? Pal.accent :
                      (currentMode === MODE_BUILD) ? Pal.place : Pal.heal;

            if (!inUI && Vars.state.isGame() && currentMode === MODE_NORMAL && inspectBuild != null) {
                var items = getInspectItems(inspectBuild);
                var topY = Math.round(h * 0.65);

                Fonts.outline.draw(
                    "[accent]" + inspectBuild.block.localizedName + " [lightgray](O - take / close)",
                    PANEL_X, topY + 18, Align.left
                );

                if (items.length === 0) {
                    Fonts.outline.draw("[lightgray]Empty", PANEL_X, topY - 10, Align.left);
                } else {
                    for (var ii = 0; ii < items.length; ii++) {
                        var entry = items[ii];
                        var ry = topY - (ii + 1) * (PANEL_ROW_H + PANEL_GAP);
                        var hovered = (inspectHoverItem === entry.item);

                        Draw.color(0, 0, 0, hovered ? 0.85 : 0.6);
                        Fill.rect(PANEL_X + PANEL_W / 2, ry + PANEL_ROW_H / 2, PANEL_W, PANEL_ROW_H);

                        if (hovered && cArmed && isDown(BTN_CIRCLE) && !cActed) {
                            var prog = Mathf.clamp(cHold / HOLD_FRAMES, 0, 1);
                            Draw.color(Pal.accent, 0.45);
                            Fill.rect(PANEL_X + (PANEL_W * prog) / 2, ry + PANEL_ROW_H / 2, PANEL_W * prog, PANEL_ROW_H);
                        }

                        Lines.stroke(hovered ? 2 : 1, hovered ? Pal.accent : Color.gray);
                        Lines.rect(PANEL_X, ry, PANEL_W, PANEL_ROW_H);
                        Draw.reset();

                        Draw.rect(entry.item.uiIcon, PANEL_X + 16, ry + PANEL_ROW_H / 2, 20, 20);
                        Fonts.outline.draw(
                            (hovered ? "[accent]" : "[white]") + entry.item.localizedName + ": [lightgray]" + entry.amount,
                            PANEL_X + 32, ry + PANEL_ROW_H / 2 + 6, Align.left
                        );
                    }
                }
                Draw.reset();
            }

            if (!inUI && Vars.state.isGame() && currentMode === MODE_COMMAND) drawCommandPanel(w, h);

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
                    l2 = "[lightgray]" + categoryName(selectedCatIndex) + ": [white]" +
                         (blk ? blk.localizedName + " " + dirs[Vars.control.input.rotation] : "—");
                } else {
                    l1 = "[green]COMMAND (" + Vars.control.input.selectedUnits.size + ")";
                }
                var f = Fonts.outline;
                f.draw(l1, cursorX, cursorY + (l2 ? 42 : 30), Align.center);
                if (l2) f.draw(l2, cursorX, cursorY + 28, Align.center);
                Draw.reset();
            }
            Draw.flush();
        } catch (e) { logOnce("draw ui", e); }
    });
} catch (e) {
    Log.warn("[Linux-Gamepad] Trigger.uiDrawEnd unavailable, screen cursor will not be drawn: " + e);
}

})();
(function () {

var os = java.lang.System.getProperty("os.name").toLowerCase();
if (Vars.headless || os.indexOf("linux") === -1) return;

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

var ZOOM_IN_SIGN = 1;
var ZOOM_SPEED = 0.05;
var CURSOR_SPEED = 18;
var CAM_PAN_SPEED = 12;
var DEADZONE = 0.16;
var SCENE_FLIP_Y = false;

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

function applyDeadzone(v) {
    v = v || 0;
    var a = Math.abs(v);
    if (a < DEADZONE) return 0;
    return (v < 0 ? -1 : 1) * Math.min(1, (a - DEADZONE) / (1 - DEADZONE));
}

function rawDown(btn) {
    if (btn === BTN_L2) return Boolean(pad.buttons[BTN_L2]) || (pad.axes[AXIS_L2] > 0.3);
    if (btn === BTN_R2) return Boolean(pad.buttons[BTN_R2]) || (pad.axes[AXIS_R2] > 0.3);
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

function handleMenu(dt) {
    placing = false; removing = false; linePoints = null;
    copyArmed = false; copying = false;
    cArmed = false; cActed = false;
    inspectBuild = null; inspectHoverItem = null;
    nArmed = false; nDropped = false;
    var mx = Mathf.clamp(applyDeadzone(pad.axes[AXIS_RX]) + applyDeadzone(pad.axes[AXIS_LX]), -1, 1);
    var my = Mathf.clamp(-applyDeadzone(pad.axes[AXIS_RY]) - applyDeadzone(pad.axes[AXIS_LY]), -1, 1);
    moveCursor(mx, my, dt);
    syncMousePosition();

    updateMenuMouseClick(isDown(BTN_CROSS) || isDown(BTN_R2));

    if (justPressed(BTN_CIRCLE) || justPressed(BTN_L2) || justPressed(BTN_OPTIONS)) triggerEscape();
}

function handleGame(dt) {
    if (wasInUI) suppressAllHeld();
    if (uiMouseDown) updateMenuMouseClick(false);

    var player = Vars.player;
    if (!player) return;
    var alive = !player.dead();
    var unit = alive ? player.unit() : null;
    var input = Vars.control.input;

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
    if (b != null && b.team === player.team() && unit != null && b.canControlSelect(unit)) {
        stopMining(unit);
        Call.buildingControlSelect(player, b);
        return;
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

    panCamera(dpadX, dpadY, dt);

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

    if (justPressed(BTN_SQUARE)) cycleUnitMode(player, sel);
}

function onFrame() {
    if (!pad.connected) {
        if (uiMouseDown) updateMenuMouseClick(false);
        return;
    }
    var dt = Math.min(Core.graphics.getDeltaTime() * 60, 4);
    var inUI = Vars.state.isMenu() || Core.scene.hasDialog();

    if (inUI) handleMenu(dt);
    else handleGame(dt);

    wasInUI = inUI;
    savePrevState();
}

Core.app.post(new java.lang.Runnable({
    run: function () {
        Core.app.addListener(new ApplicationListener({
            update: function () {
                try { onFrame(); } catch (e) { logOnce("update", e); }
            }
        }));
    }
}));

Events.run(Trigger.draw, function () {
    try {
        if (!pad.connected || !Vars.state.isGame()) return;
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
            if (!pad.connected || cursorX < 0) return;
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
# 🎮 Gamepad Support for Linux — Mindustry Mod

**[English](#-english) | [Русский](#-русский)**

---

## 🌐 English

Native controller support for **Mindustry** on Linux, written entirely in `scripts/main.js`.  
Instead of bundling external native binaries (`.so`), the mod reads Linux joystick events directly from `/dev/input/js0`–`js7` in a background daemon thread. It is strictly client-side (`hidden: true`) and works on any multiplayer server.

### ✨ Features
* **Zero Dependencies:** Pure Mindustry JS script reading `/dev/input/js*` directly.
* **Plug & Play Hot-Swapping:** Automatically detects and reconnects controllers on the fly.
* **Three Dedicated Modes:** Seamlessly switch between **Normal (`L2`)**, **Build (`R1`)**, and **Command (`L1`)** modes with an on-screen HUD indicator around the crosshair.
* **Full Building Suite:** Category/block grid navigation via D-Pad, straight-line placement with automatic conveyor rotation, area deconstruction, block pipette, and rectangular area copy & paste.
* **Inventory Management:** Hold **Cross (`X`)** to deposit/drop items, or hold **Circle (`O`)** on a building to open a live side-panel of its stored resources and withdraw items directly into your unit.
* **RTS Unit Command:** Single-click or box-select units, issue move/attack orders, and cycle unit commands & stances.
* **Menu & Dialog Support:** Virtual cursor works in the main menu, pause screen, and research tree.

---

### ⚙️ Requirements & Installation

1. **OS:** Linux (client-side only).
2. **Permissions:** Ensure your user has read permissions for `/dev/input/js*`. If the controller is not detected, add your user to the `input` group and re-login:
   ```bash
   sudo usermod -aG input $USER
   ```
3. **Install:**
   * Download or clone this repository into `~/.local/share/Mindustry/mods/`:
     ```bash
        git clone [https://github.com/](https://github.com/)NTT335/Gamepad-support-for-linux-mindustry-mod.git ~/.local/share/Mindustry/mods/gamepad-support-linux
     ```
   * Or import the `.zip` archive directly in Mindustry via **Mods → Import Mod → Import File**.

---

### 🎮 Controls (DualSense / DualShock 4 Layout)

#### Global & Menus
| Input | In-Game Action | In Menu / Dialogs |
| :--- | :--- | :--- |
| **Left Stick** | Move unit | Move cursor |
| **Right Stick** | Move virtual cursor / Aim | Move cursor |
| **L2 / R1 / L1** | Switch Mode: **Normal** (`L2`) / **Build** (`R1`) / **Command** (`L1`) | `L2` — Back / Close |
| **L3 / R3** | Zoom In (`L3`) / Zoom Out (`R3`) | — |
| **Options** | Open Pause Menu / Close Dialog (`Esc`) | Back / Close (`Esc`) |
| **Share / Create** | Toggle Pause (Singleplayer) | — |
| **Cross (`X`) / R2** | Mode-specific action | Left Mouse Click / Drag |

---

#### 1. Normal Mode (`L2`)
| Input | Action |
| :--- | :--- |
| **R2 (Hold)** | Shoot / Fire weapons at cursor |
| **D-Pad** | Pan camera (detaches camera from player) |
| **Cross (`X`) — Tap** | Possess unit or turret under cursor / Start mining ore / Stop mining |
| **Cross (`X`) — Hold** | Deposit carried items into building under cursor (or drop items toward cursor) |
| **Circle (`O`) — Hold** | Inspect building inventory in the left side-panel. Hold `O` over a resource row in the panel to take max capacity |
| **Circle (`O`) — Tap** | Close resource side-panel (if open) or respawn at Core |
| **Square (`□`)** | Open Research Tree (Campaign) |
| **Triangle (`△`)** | Skip Wave (Singleplayer / Admin) |

---

#### 2. Build Mode (`R1`)
| Input | Action |
| :--- | :--- |
| **Triangle (`△`)** | Switch D-Pad to **Category Selection** mode |
| **Square (`□`)** | Switch D-Pad to **Block Selection** mode (press again to **rotate** block 90°) |
| **D-Pad** | Navigate categories (in `△` mode) or block grid (in `□` mode) |
| **R2 — Tap / Hold & Drag** | Place single block or drag a straight line (press `O` while dragging to cancel). Also pastes copied area if clipboard is active |
| **Circle (`O`) — Tap / Hold & Drag** | Deconstruct single block or drag a rectangular area (press `R2` while dragging to cancel) |
| **Cross (`X`) — Tap** | Cancel: clears copied clipboard → clears build queue → deselects block |
| **Cross (`X`) — Hold in place** | Pipette: pick block and configuration under cursor |
| **Cross (`X`) — Hold & Drag** | Copy all friendly buildings in the rectangle to clipboard |

---

#### 3. Command Mode (`L1`)
| Input | Action |
| :--- | :--- |
| **R2 — Tap** | Select / Deselect unit under cursor |
| **R2 — Hold & Drag** | Box-select commandable units |
| **Cross (`X`)** | Order selected units to move to cursor or attack target |
| **Circle (`O`)** | Clear unit & building selection |
| **Triangle (`△`)** | Select all commandable units on the map |
| **Square (`□`)** | Cycle unit commands (Move, Mine, Rebuild, Assist…) and stances |
| **D-Pad** | Pan camera |

---

### 🔧 Customization
If your controller driver maps buttons or axes differently, open `scripts/main.js` and edit Section `1. НАСТРОЙКИ И ИНДЕКСЫ` at the very top of the file:
* `BTN_*` and `AXIS_*` — button and axis indices from `/dev/input/js*`.
* `CURSOR_SPEED` (default `18`) & `DEADZONE` (default `0.16`) — stick sensitivity and deadzone.
* `ZOOM_IN_SIGN` (`1` or `-1`) — invert zoom direction if needed.

---
---

## 🇷🇺 Русский

Нативная поддержка геймпада для **Mindustry** на Linux, полностью реализованная в `scripts/main.js`.  
Мод читает бинарный поток событий напрямую из `/dev/input/js0`–`js7` в отдельном фоновом потоке и не требует сторонних нативных библиотек (`.so`). Работает исключительно на клиенте (`hidden: true`) и полностью совместим с любыми серверами.

### ✨ Возможности
* **Без внешних зависимостей:** Чистый скрипт Mindustry, работающий напрямую с `/dev/input/js*`.
* **Горячее подключение:** Автоматически подхватывает геймпад при подключении или переподключении на лету.
* **Три полноценных режима:** Переключение между **Обычным (`L2`)**, **Строительным (`R1`)** и **Командным (`L1`)** режимами с индикацией прямо у прицела.
* **Продвинутое строительство:** Выбор категорий и блоков крестовиной, постройка ровной линией с автоповоротом конвейеров, снос прямоугольной областью, пипетка блока и копирование/вставка целых схем.
* **Работа с инвентарём зданий:** Удержание **Креста (`X`)** загружает предметы в блок или выбрасывает их, а удержание **Круга (`O`)** открывает боковую панель со списком всех ресурсов внутри здания, откуда их можно забрать в юнита.
* **Командование юнитами (RTS):** Поштучный выбор и выделение рамкой, приказы движения/атаки, переключение команд и стоек по кругу.
* **Управление в меню:** Виртуальный курсор работает в главном меню, на паузе и в дереве исследований.

---

### ⚙️ Требования и установка

1. **ОС:** Linux (только клиент).
2. **Права доступа:** У пользователя должны быть права на чтение `/dev/input/js*`. Если геймпад не определяется, добавь пользователя в группу `input` и перелогинься в систему:
   ```bash
   sudo usermod -aG input $USER
   ```
3. **Установка:**
   * Клонируй репозиторий в папку модов Mindustry (`~/.local/share/Mindustry/mods/`):
     ```bash
     git clone [https://github.com/](https://github.com/)NTT335/Gamepad-support-for-linux-mindustry-mod.git ~/.local/share/Mindustry/mods/gamepad-support-linux
     ```
   * Либо импортируй `.zip`-архив внутри игры через **Моды → Импортировать мод → Импортировать файл**.

---

### 🎮 Управление (раскладка DualSense / DualShock 4)

#### Общее и меню
| Кнопка / Стик | В игре | В меню и диалогах |
| :--- | :--- | :--- |
| **Левый стик** | Движение юнита | Движение курсора |
| **Правый стик** | Движение курсора / Прицеливание | Движение курсора |
| **L2 / R1 / L1** | Режим: **Обычный** (`L2`) / **Стройка** (`R1`) / **Командование** (`L1`) | `L2` — Назад / Закрыть |
| **L3 / R3** | Приблизить камеру (`L3`) / Отдалить камеру (`R3`) | — |
| **Options** | Меню паузы / Закрыть окно (`Esc`) | Назад / Закрыть (`Esc`) |
| **Share / Create** | Пауза (в одиночной игре) | — |
| **Крест (`X`) / R2** | Действие текущего режима | ЛКМ / Перетаскивание |

---

#### 1. Обычный режим (`L2`)
| Кнопка | Действие |
| :--- | :--- |
| **R2 (Удержание)** | Стрельба в точку курсора |
| **Крестовина (D-Pad)** | Свободное перемещение камеры без движения юнита |
| **Крест (`X`) — Тап** | Вселиться в юнита/турель под курсором / Начать копать руду / Прекратить добычу |
| **Крест (`X`) — Удержание** | Положить предметы из юнита в здание под курсором (если пусто — выбросить в сторону курсора) |
| **Круг (`O`) — Удержание** | Открыть список ресурсов здания слева на экране. Наведи курсор на ресурс в списке и зажми `O`, чтобы забрать максимум в юнита |
| **Круг (`O`) — Тап** | Закрыть панель ресурсов (если открыта) или вернуться в Ядро |
| **Квадрат (`□`)** | Открыть дерево исследований (в кампании) |
| **Треугольник (`△`)** | Пропустить волну (в одиночной игре или с правами админа) |

---

#### 2. Режим строительства (`R1`)
| Кнопка | Действие |
| :--- | :--- |
| **Треугольник (`△`)** | Переключить крестовину на **выбор категории** |
| **Квадрат (`□`)** | Переключить крестовину на **выбор строения** (повторное нажатие — **повернуть** блок на 90°) |
| **Крестовина (D-Pad)** | Навигация по категориям (`△`) или сетке блоков (`□`) |
| **R2 — Тап / Зажать и вести** | Поставить блок или провести ровную линию (нажми `O` во время ведения для отмены). Если скопирована область — вставляет её |
| **Круг (`O`) — Тап / Зажать и вести** | Снести один блок или выделить прямоугольную область под снос (нажми `R2` для отмены) |
| **Крест (`X`) — Тап** | Отмена по шагам: сбросить скопированную область → очистить очередь постройки → снять выбор блока |
| **Крест (`X`) — Удержать на месте** | Пипетка: скопировать блок и его конфигурацию под курсором |
| **Крест (`X`) — Зажать и вести** | Скопировать все свои постройки в выделенном прямоугольнике в буфер |

---

#### 3. Режим командования (`L1`)
| Кнопка | Действие |
| :--- | :--- |
| **R2 — Тап** | Выбрать / Снять выбор с юнита под курсором |
| **R2 — Зажать и вести** | Выделить юнитов прямоугольной рамкой |
| **Крест (`X`)** | Приказать выбранным юнитам идти к курсору или атаковать цель |
| **Круг (`O`)** | Сбросить выделение юнитов |
| **Треугольник (`△`)** | Выбрать всех доступных для командования юнитов на карте |
| **Квадрат (`□`)** | Переключить по кругу команду (Идти, Добывать, Чинить, Помогать…) или стойку юнитов |
| **Крестовина (D-Pad)** | Свободное перемещение камеры |

---

### 🔧 Тонкая настройка
Если на твоём драйвере индексы кнопок или осей отличаются, открой `scripts/main.js` и измени значения в блоке `1. НАСТРОЙКИ И ИНДЕКСЫ` в самом начале файла:
* `BTN_*` и `AXIS_*` — индексы кнопок и осей из `/dev/input/js*`.
* `CURSOR_SPEED` (по умолчанию `18`) и `DEADZONE` (по умолчанию `0.16`) — скорость курсора и мёртвая зона стиков.
* `ZOOM_IN_SIGN` (`1` или `-1`) — инверсия приближения/отдаления камеры на `L3`/`R3`.

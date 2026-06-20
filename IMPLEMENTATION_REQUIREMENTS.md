# ТЗ: Local-first Counter

Нужно реализовать приложение `Local-first Counter` для деплоя в app.onreza.ru: frontend + Node backend process.

## Стек

- Node.js project с `"type": "module"`.
- Frontend: чистый HTML/CSS/JS без фреймворков.
- Backend: Node HTTP server без фреймворков.
- Хранение локального состояния: IndexedDB через `idb-keyval`.
- Деплой: app.onreza.ru.
- База данных: Supabase Postgres через `postgres`.

## Зависимости

```json
{
  "idb-keyval": "^6.2.5",
  "postgres": "^3.4.7"
}
```

## Скрипты

```json
{
  "build": "node scripts/build.js",
  "start": "node dist/server.js",
  "postinstall": "npm run build"
}
```

`npm run build` должен:

- удалить старую папку `dist`;
- скопировать содержимое `public` в `dist`;
- скопировать `server/server.js` в `dist/server.js`;
- создать `dist/.onreza/manifest.json`.

Manifest должен явно описывать process-деплой:

```json
{
  "version": 1,
  "layers": [
    {
      "name": "app",
      "target": "PROCESS",
      "directory": ".",
      "entry": "server.js"
    }
  ],
  "routes": [
    {
      "pattern": "^/.*$",
      "layer": "app",
      "priority": 0
    }
  ],
  "meta": {
    "framework": {
      "name": "node"
    }
  }
}
```

## Структура проекта

```txt
public/
  index.html
  style.css
  counter.js
  dom.js
  utils.js
  vendor/
    idb-keyval.js
    idb-keyval.LICENSE
scripts/
  build.js
server/
  server.js
package.json
README.md
```

Build output:

```txt
dist/
  .onreza/
    manifest.json
  index.html
  style.css
  counter.js
  dom.js
  utils.js
  server.js
  vendor/
    idb-keyval.js
    idb-keyval.LICENSE
```

## Frontend

Главная страница: `public/index.html`.

Язык страницы: `ru`.

Title при загрузке:

```txt
Local-first Counter
```

После инициализации JS title должен обновляться в формат:

```txt
Счётчик: {count}
```

### Интерфейс

На странице должен быть центральный блок шириной до `480px`.

Содержимое:

1. Заголовок:

```txt
Local-first Counter
```

2. Описание:

```txt
Счётчик обновляется сразу и синхронизируется с API при открытии страницы.
```

3. Блок счетчика:
   - большое значение счетчика;
   - кнопка `+1`;
   - кнопка `-1`;
   - кнопка `Сброс`.

4. Блок статуса:
   - статус сети с точкой-индикатором:
     - `Онлайн`;
     - `Офлайн`;
     - `Офлайн (тест)`;
   - кнопка имитации сети:
     - `Имитировать offline`;
     - после включения: `Вернуть online`;
   - строка локального изменения:
     - если изменений не было: `Локальных изменений пока нет`;
     - если были: `Локально изменено: {дата}`;
   - строка серверного значения:

```txt
Серверное значение: {remoteCount}
```

Если ответа сервера еще не было:

```txt
Серверное значение: нет ответа
```

   - строка статуса синхронизации:
     - до первого запроса: `Сетевой запрос ещё не выполнялся`;
     - во время синхронизации: `Синхронизация с API. В очереди: {queueSize}`;
     - если есть очередь и сеть недоступна: `Ожидает сети: {queueSize}`;
     - после успешной синхронизации: `Синхронизировано: {дата}`;
     - при ошибке: `Ошибка синхронизации: {message}. В очереди: {queueSize}`.

### CSS

Визуально приложение должно быть минималистичным:

- светлый фон `#f6f7f9`;
- белая карточка;
- радиус карточки и кнопок `8px`;
- основной текст `#14171f`;
- muted-текст `#667085`;
- primary-кнопка синяя `#1f6feb`;
- danger-текст `#b42318`;
- значение счетчика крупное:
  - desktop: `64px`;
  - mobile: `56px`;
- на экранах до `520px` блок счетчика становится вертикальным.

## Local-first логика

Состояние хранить в IndexedDB.

Database name:

```txt
local-first-counter
```

Store name:

```txt
state
```

State key:

```txt
local-first-counter:v1
```

Форма состояния:

```js
{
  count: 0,
  updatedAt: null,
  remoteCount: null,
  syncedAt: null,
  pendingOperations: [],
  syncError: null
}
```

Допустимые операции очереди:

```js
["plus", "minus", "reset"]
```

При чтении состояния из IndexedDB нужно нормализовать данные:

- `count` должен быть finite number, иначе `0`;
- `updatedAt` или `null`;
- `remoteCount` finite number или `null`;
- `syncedAt` или `null`;
- `pendingOperations` только массив допустимых операций;
- `syncError` или `null`.

Если IndexedDB недоступна или чтение упало, использовать начальное состояние.

## Поведение кнопок

### `+1`

- Сразу локально увеличить `count` на `1`.
- Обновить `updatedAt`.
- Добавить операцию `"plus"` в `pendingOperations`.
- Запустить синхронизацию.

### `-1`

- Сразу локально уменьшить `count` на `1`.
- Обновить `updatedAt`.
- Добавить операцию `"minus"` в `pendingOperations`.
- Запустить синхронизацию.

### `Сброс`

- Сразу локально установить `count = 0`.
- Обновить `updatedAt`.
- Очередь заменить на `["reset"]`.
- Запустить синхронизацию.

Важно: операция `reset` должна заменять все предыдущие ожидающие операции.

## API contract

Frontend обращается к API по относительным URL:

```txt
GET  /api/counter
POST /api/counter/plus
POST /api/counter/minus
POST /api/counter/reset
```

Backend для этих маршрутов реализуется в `server/server.js` и подключается к Supabase через `SUPABASE_DATABASE_URL`.

Backend должен:

- запускаться командой `node dist/server.js`;
- слушать порт из `process.env.PORT`, fallback `3000`;
- отдавать статические файлы из папки `dist`;
- для неизвестных frontend route возвращать `index.html`;
- поддерживать CORS для API;
- создавать таблицу `app_counter`, если она еще не существует.

SQL-схема:

```sql
CREATE TABLE IF NOT EXISTS app_counter (
  id text PRIMARY KEY,
  value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_counter (id, value)
VALUES ('main', 0)
ON CONFLICT (id) DO NOTHING;
```

Все запросы должны использовать:

```js
{ cache: "no-store" }
```

POST-запросы должны отправляться без body.

Ответ API всегда ожидается в формате:

```json
{
  "value": 123
}
```

Если HTTP-ответ не `ok`, frontend должен считать это ошибкой синхронизации.

## Синхронизация

1. Если уже идет синхронизация, новый запуск игнорировать.
2. Если сеть недоступна, обновить UI в offline-статус и запланировать повтор через `5000ms`.
3. Если очередь пустая:
   - выполнить `GET /api/counter`;
   - записать ответ в `remoteCount`;
   - если очередь все еще пустая, заменить локальный `count` серверным значением.
4. Если очередь не пустая:
   - последовательно отправлять операции из начала очереди;
   - для `"plus"` вызвать `POST /api/counter/plus`;
   - для `"minus"` вызвать `POST /api/counter/minus`;
   - для `"reset"` вызвать `POST /api/counter/reset`;
   - после успешной операции удалить ее из очереди;
   - обновить `remoteCount`;
   - если очередь стала пустой, заменить локальный `count` серверным значением.
5. После успешной операции обновлять `syncedAt`.
6. При ошибке:
   - сохранить `syncError`;
   - показать offline-статус;
   - запланировать повтор через `5000ms`.

## Offline режим

Состояние сети определяется так:

```js
navigator.onLine && !isNetworkSimulatedOffline
```

Нужна кнопка имитации offline:

- при включении приложение считает сеть недоступной;
- при выключении снова пытается синхронизироваться.

Также нужно слушать события:

```js
window.addEventListener("online", ...)
window.addEventListener("offline", ...)
window.addEventListener("focus", ...)
window.addEventListener("pageshow", ...)
document.addEventListener("visibilitychange", ...)
```

При возврате вкладки в активное состояние нужно запускать синхронизацию.

## Multi-tab sync

Если браузер поддерживает `BroadcastChannel`, использовать канал:

```txt
local-first-counter
```

При сохранении состояния отправлять его в другие вкладки.

При получении сообщения из канала:

- заменить локальное состояние на полученное;
- перерисовать UI;
- сохранить состояние без повторной отправки в канал.

## Критерии приемки

1. `npm install` и `npm run build` создают папку `dist`.
2. `dist/.onreza/manifest.json` существует и описывает `PROCESS` деплой с entrypoint `server.js`.
3. При открытии страницы счетчик сразу показывает локальное значение из IndexedDB.
4. Если локального состояния нет, показывается `0`.
5. Нажатие `+1`, `-1`, `Сброс` мгновенно меняет UI без ожидания API.
6. При online-режиме операции отправляются на API и очередь очищается.
7. При offline-режиме операции остаются в очереди и UI продолжает работать.
8. После возврата online очередь отправляется на API по порядку.
9. `reset` заменяет все предыдущие операции в очереди.
10. Серверное значение отображается отдельно от локального.
11. Ошибки синхронизации показываются пользователю.
12. Несколько вкладок синхронизируют состояние через `BroadcastChannel`.

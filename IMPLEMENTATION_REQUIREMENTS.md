# ТЗ: Local-first Counter

Нужно реализовать приложение `Local-first Counter`: простой счетчик с frontend-интерфейсом, local-first поведением, очередью офлайн-операций и serverless API на Netlify + Neon Postgres.

## Стек

- Node.js project с `"type": "module"`.
- Frontend: чистый HTML/CSS/JS без фреймворков.
- Хранение локального состояния: IndexedDB через `idb-keyval`.
- Backend: Netlify Functions.
- Database: Neon Postgres через `@neondatabase/serverless`.
- Dev command: `netlify dev`.
- Prod deploy: через Netlify Dashboard или `netlify deploy --prod`.

## Зависимости

```json
{
  "@neondatabase/serverless": "latest",
  "idb-keyval": "^6.2.5"
}
```

Dev dependency:

```json
{
  "netlify-cli": "latest"
}
```

## Структура проекта

```txt
lib/
  db.js
netlify/
  functions/
    counter.js
    counter-plus.js
    counter-minus.js
    counter-reset.js
public/
  index.html
  style.css
  counter.js
  dom.js
  utils.js
  vendor/
    idb-keyval.js
    idb-keyval.LICENSE
netlify.toml
package.json
README.md
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

## Синхронизация

API base URL в текущей реализации должен указывать на Netlify-домен проекта:

```txt
https://{netlify-site-name}.netlify.app
```

Для локальной разработки можно использовать относительные URL или `http://localhost:{port}`. Внешний контракт API должен оставаться таким же: frontend обращается к `/api/counter...`, а Netlify перенаправляет эти URL на functions.

Эндпоинты:

```txt
GET  /api/counter
POST /api/counter/plus
POST /api/counter/minus
POST /api/counter/reset
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

Если HTTP-ответ не `ok`, нужно выбрасывать ошибку:

```txt
{actionLabel}: HTTP {status}
```

Если в JSON нет finite number `value`, нужно выбрасывать ошибку:

```txt
{actionLabel} вернул ответ без value
```

### Алгоритм синхронизации

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

## Backend API

Файл `lib/db.js`:

- импортировать `neon` из `@neondatabase/serverless`;
- требовать env-переменную `DATABASE_URL`;
- экспортировать `sql`;
- экспортировать `COUNTER_ID = "main"`;
- экспортировать `corsHeaders`.

CORS-заголовки:

```txt
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Все Netlify Functions должны:

- экспортировать `handler`;
- читать HTTP-метод из `event.httpMethod`;
- возвращать объект Netlify response:

```js
{
  statusCode: 200,
  headers: corsHeaders,
  body: JSON.stringify(data)
}
```

- на `OPTIONS` отвечать `200` с пустым `body`;
- на неподдерживаемый метод отвечать `405`:

```json
{
  "error": "Method not allowed"
}
```

## Netlify config

Нужен файл `netlify.toml`:

```toml
[build]
  publish = "public"
  functions = "netlify/functions"

[[redirects]]
  from = "/api/counter"
  to = "/.netlify/functions/counter"
  status = 200

[[redirects]]
  from = "/api/counter/plus"
  to = "/.netlify/functions/counter-plus"
  status = 200

[[redirects]]
  from = "/api/counter/minus"
  to = "/.netlify/functions/counter-minus"
  status = 200

[[redirects]]
  from = "/api/counter/reset"
  to = "/.netlify/functions/counter-reset"
  status = 200
```

### `GET /api/counter`

Файл:

```txt
netlify/functions/counter.js
```

Метод: только `GET`.

SQL:

```sql
SELECT value
FROM app_counter
WHERE id = 'main'
```

Успешный ответ:

```json
{
  "value": 0
}
```

Если строки нет, вернуть `0`.

При ошибке вернуть `500`:

```json
{
  "error": "Failed to get counter"
}
```

### `POST /api/counter/plus`

Файл:

```txt
netlify/functions/counter-plus.js
```

Метод: только `POST`.

SQL:

```sql
UPDATE app_counter
SET value = value + 1, updated_at = now()
WHERE id = 'main'
RETURNING value
```

При ошибке вернуть `500`:

```json
{
  "error": "Failed to increment counter"
}
```

### `POST /api/counter/minus`

Файл:

```txt
netlify/functions/counter-minus.js
```

Метод: только `POST`.

SQL:

```sql
UPDATE app_counter
SET value = value - 1, updated_at = now()
WHERE id = 'main'
RETURNING value
```

При ошибке вернуть `500`:

```json
{
  "error": "Failed to decrement counter"
}
```

### `POST /api/counter/reset`

Файл:

```txt
netlify/functions/counter-reset.js
```

Метод: только `POST`.

SQL:

```sql
UPDATE app_counter
SET value = 0, updated_at = now()
WHERE id = 'main'
RETURNING value
```

При ошибке вернуть `500`:

```json
{
  "error": "Failed to reset counter"
}
```

## Database

Нужна таблица Postgres:

```sql
CREATE TABLE app_counter (
  id text PRIMARY KEY,
  value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_counter (id, value)
VALUES ('main', 0)
ON CONFLICT (id) DO NOTHING;
```

## README

README должен описывать:

- это простой проект со счетчиком;
- проект доступен по URL;
- frontend сделан по local-first подходу;
- для local-first используется `idb-keyval`;
- при отсутствии сети действия сохраняются в очередь;
- при восстановлении сети очередь отправляется на API;
- счетчик умеет показывать значение, увеличивать, уменьшать и сбрасывать;
- API реализовано в `netlify/functions`, публичные маршруты доступны как `/api/counter`, `/api/counter/plus`, `/api/counter/minus`, `/api/counter/reset`.

## Критерии приемки

1. При открытии страницы счетчик сразу показывает локальное значение из IndexedDB.
2. Если локального состояния нет, показывается `0`.
3. Нажатие `+1`, `-1`, `Сброс` мгновенно меняет UI без ожидания API.
4. При online-режиме операции отправляются на сервер и очередь очищается.
5. При offline-режиме операции остаются в очереди и UI продолжает работать.
6. После возврата online очередь отправляется на сервер по порядку.
7. `reset` заменяет все предыдущие операции в очереди.
8. Серверное значение отображается отдельно от локального.
9. Ошибки синхронизации показываются пользователю.
10. Несколько вкладок синхронизируют состояние через `BroadcastChannel`.
11. Все API endpoints возвращают JSON `{ "value": number }` при успехе.
12. CORS работает для GET, POST и OPTIONS.

# Counter API

Простой проект со счетчиком.

Проект рассчитан на деплой в сервисе app.onreza.ru.

Для app.onreza.ru frontend собирается в папку `dist`, потому что сервис ожидает одну из стандартных output-папок: `dist`, `.output`, `build`, `out`, `_site`, `www`.

Команда сборки:

```bash
npm run build
```

Также сборка запускается автоматически после `npm install` через `postinstall`, чтобы app.onreza.ru получил папку `dist` перед проверкой build output.
Во время сборки также создается `dist/.onreza/manifest.json`, который явно указывает `COMPUTE` слой и entrypoint `server.js`.

В проекте есть frontend. Он выполнен по подходу local-first: интерфейс сразу работает локально и синхронизирует значение с API.
Для local-first используется готовая библиотека `idb-keyval`.

Если сеть недоступна, frontend сохраняет действия пользователя в очередь. Когда сеть появляется снова, очередь отправляется на API, а сервер применяет изменения к счетчику.

Счетчик умеет:

- показывать текущее значение;
- увеличивать значение на 1;
- уменьшать значение на 1;
- сбрасывать значение до 0.

Исходники frontend лежат в папке `public`, build output создается в папке `dist`.

Backend находится в `server/server.js`. Во время сборки он бандлится через `esbuild` в `dist/server.js`, а `dist/.onreza/manifest.json` указывает Onreza запускать его как `COMPUTE`.

Backend:

- отдает статические файлы frontend из `dist`;
- обслуживает API `/api/counter`, `/api/counter/plus`, `/api/counter/minus`, `/api/counter/reset`;
- подключается к Supabase Postgres через `SUPABASE_DATABASE_URL`;
- создает таблицу `app_counter`, если она еще не существует.

Для деплоя нужно задать env:

```txt
SUPABASE_DATABASE_URL
```

# mini-nest — Part 3: complete request lifecycle

Навчальна реалізація mini-Nest без HTTP-фреймворків: IoC-контейнер із першої
частини створює контролери та сервіси, router читає декоратори маршрутів, а
dispatcher обслуговує запити через `node:http` і валідує DTO.

## Запуск і тести

```bash
npm ci
npm test
```

Понад двадцять тестів перевіряють IoC-контейнер, HTTP routing, точний порядок
lifecycle, authorization, Zod validation, exception mapping та ізоляцію десяти
одночасних request contexts.

Запуск тестів у Docker-образі з ДЗ #5:

```bash
docker compose build api
docker compose run --rm api npm test
```

API та PostgreSQL, як і раніше, запускаються однією командою:

```bash
docker compose up -d --build
curl http://localhost:3000/health
curl -H 'Authorization: Bearer demo' http://localhost:3000/users
curl -H 'Authorization: Bearer demo' http://localhost:3000/users/42
curl -H 'Authorization: Bearer demo' 'http://localhost:3000/users?limit=1'
curl -X POST http://localhost:3000/users \
  -H 'Authorization: Bearer demo' \
  -H 'content-type: application/json' \
  -d '{"name":"Lin","email":"lin@example.com"}'
```

Налаштування беруться з `.env`; безпечний шаблон для нового середовища лежить
у `.env.example`. Не комітьте справжні паролі з `.env`.

## Як це працює

Коли `experimentalDecorators` і `emitDecoratorMetadata` увімкнені, TypeScript
додає до декорованого класу runtime-метадані типів параметрів конструктора.
`@Injectable()` позначає клас і зберігає його scope, а `Container.resolve()`
читає `Reflect.getMetadata("design:paramtypes", Target)` та рекурсивно резолвить
кожну залежність. Без `emitDecoratorMetadata` компілятор не генерує
`design:paramtypes`, тому контейнер не знає, які класи передати в конструктор.

Інтерфейси стираються під час компіляції та в metadata стають `Object`. Для них
`@Inject(token)` зберігає явний string/Symbol/class token за індексом параметра,
а контейнер підставляє зареєстрований provider. Singleton-кеш належить окремому
екземпляру контейнера; transient provider щоразу створюється заново. Під час
рекурсії контейнер також веде поточний шлях класів і повідомляє повний ланцюг,
якщо клас зустрічається повторно.

## Як параметр-декоратор знає, куди підставити значення

TypeScript викликає параметр-декоратор із `target`, `propertyKey` та
`parameterIndex`. `@Body()`, `@Param(name)` і `@Query(name)` записують у metadata
методу мапу `parameterIndex -> source`. Під час HTTP-запиту dispatcher читає цю
мапу, створює масив аргументів і кладе кожне значення саме за його індексом,
після чого викликає handler через `method.apply(controller, args)`. Для
`@Body()` він додатково читає `design:paramtypes`, створює екземпляр відповідного
DTO та передає його у validation pipe; тому handler отримує не plain object, а
екземпляр `CreateUserDto`. Якщо TypeScript-тип стертий до `any`/`Object`, DTO
можна задати явно: `@Body(CreateUserDto)`.

## HTTP routing і DTO

`@Controller(prefix)` зберігає базовий шлях класу, а `@Get(path)` і
`@Post(path)` — HTTP-метод та локальний шлях handler-а. `Router` склеює їх,
компілює сегменти на кшталт `:id` і під час запиту повертає знайдений route із
path parameters. Статичні сегменти сортуються перед динамічними, тому
`/users/special` не перехоплюється маршрутом `/users/:id`. Список URL у коді не
підтримується вручну: джерелом маршрутів є metadata декораторів.

`CreateUserDto` містить Zod 4 schema. `ZodValidationPipe` запускається
безпосередньо перед handler, перетворює перевірене тіло на екземпляр DTO та
перетворює `error.issues` на `[{ field, constraints }]`. Zod object schema також
відкидає невідомі поля на кшталт `isAdmin`.

## Життєвий цикл запиту

```text
Request
  │
  ▼
Middleware
  │
  ▼
Guard ── false ──► 403
  │ true
  ▼
Interceptor (before)
  │
  ▼
Zod Pipe ──► Handler
  │             │
  └─────────────┘
        ▼
Interceptor (after)
        │
        ▼
JSON Response

Будь-яка помилка з усього ланцюга ──► Exception Filter
```

Guard відповідає лише на питання, чи дозволено продовжувати запит, і працює до
валідації. Interceptor обгортає pipe та handler через `next()`, тому бачить як
вхід, так і результат або помилку після виконання. `ExceptionFilter` стоїть у
найзовнішньому `try/catch`: `NotFoundError` стає 404, `ValidationError` — 400,
а невідома помилка — безпечним 500 без stack trace у відповіді.

## Чому AsyncLocalStorage, а не глобальна змінна

Поки один HTTP-запит очікує `await`, event loop починає обробляти інший. Звичайна
глобальна змінна в цей момент була б перезаписана чужим request id, і логи або
відповіді змішалися б. `AsyncLocalStorage` прив'язує окреме сховище до
асинхронного ланцюга кожного запиту. Dispatcher обгортає весь lifecycle у
`RequestContext.run()`, тому repository на два рівні нижче handler-а читає той
самий id без додавання параметра до сигнатур методів. Значення також повертається
клієнту в заголовку `X-Request-Id`.

## Docker

Фінальний multi-stage образ і dev builder запускаються від `USER node` та
містять лише потрібні для свого режиму залежності. Dev override монтує `src/` і
`test/`, вмикає hot-reload та відкриває порт 3000. PostgreSQL 17 використовує
іменований volume `postgres_data`, а `db/init.sql` запечений у похідний образ,
тому базовий CI Compose не залежить від bind mount із хоста. Healthcheck читає
той самий `PORT`, що й сервер.

| Образ | Розмір |
| --- | ---: |
| multi-stage (`node:22-slim`) | 250 MB |
| single-stage (`node:22`) | 1.19 GB |

Multi-stage образ менший, бо dev-залежності, тести та вихідні `.ts` файли не
потрапляють у runner-стадію.

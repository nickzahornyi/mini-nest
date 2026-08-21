# mini-nest — Part 2: HTTP routing and validation

Навчальна реалізація mini-Nest без HTTP-фреймворків: IoC-контейнер із першої
частини створює контролери та сервіси, router читає декоратори маршрутів, а
dispatcher обслуговує запити через `node:http` і валідує DTO.

## Запуск і тести

```bash
npm ci
npm test
```

Шістнадцять тестів перевіряють IoC-контейнер, маршрути, `@Param`, `@Query`,
`@Body`, DTO validation, HTTP 400/404 та створення controller dependencies
саме контейнером.

Запуск тестів у Docker-образі з ДЗ #5:

```bash
docker compose build api
docker compose run --rm api npm test
```

API та PostgreSQL, як і раніше, запускаються однією командою:

```bash
docker compose up -d --build
curl http://localhost:3000/health
curl http://localhost:3000/users
curl http://localhost:3000/users/42
curl 'http://localhost:3000/users?limit=1'
curl -X POST http://localhost:3000/users \
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

Власні `@IsString()` та `@IsEmail()` записують правила DTO. `ValidationPipe`
перетворює JSON body на екземпляр класу, копіює лише поля з validation rules,
збирає помилки всіх полів і повертає їх як `[{ field, constraints }]` з HTTP
400. Виклик handler-а винесений у composable execution pipeline — наступна
частина зможе додати guards та interceptors через `dispatcher.use(stage)`.

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

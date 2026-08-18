# mini-nest — Part 1: IoC container

Навчальна реалізація IoC-контейнера з constructor injection, токенами,
singleton/transient scopes і детекцією циклічних залежностей. Сторонні
DI-контейнери не використовуються.

## Запуск і тести

```bash
npm ci
npm test
```

Тести перевіряють рекурсивний граф `A -> B -> C`, singleton, transient,
`@Inject(Symbol)` і зрозумілу помилку для циклу `A -> B -> A`.

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

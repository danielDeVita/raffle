# Plan de Migración a AWS

## Contexto

Hoy Luk depende de varios proveedores:

- `Render` para frontend, backend y worker
- `Neon` para PostgreSQL
- `Cloudinary` para imágenes
- `Brevo` para emails

La decisión para esta etapa es pasar a una infraestructura **AWS-only real**, pero sin sobrediseñar una plataforma cara antes de tiempo.

La app todavía está en desarrollo. Por eso, el objetivo no es montar una arquitectura máxima desde el día uno, sino una base profesional, ordenada y lista para crecer después sin rehacer todo.

## Objetivo de esta etapa

La arquitectura inicial debe cumplir esto:

- un solo entorno real en AWS
- costo contenido
- Docker como estándar de despliegue
- sin serverless para la aplicación
- sin depender más de `Cloudinary` ni `Brevo`
- con camino claro para subir luego a `Multi-AZ`, `CloudFront`, `Redis` y ambientes adicionales

## Arquitectura Elegida para la Fase Inicial

Servicios AWS a usar ahora:

- `Amazon ECR`: registro de imágenes Docker
- `Amazon ECS Fargate`: ejecución de contenedores
- `Application Load Balancer (ALB)`: entrada HTTP/HTTPS
- `Amazon RDS for PostgreSQL`: base de datos principal
- `Amazon S3`: almacenamiento de imágenes
- `Amazon SES`: envío de emails transaccionales
- `Amazon CloudWatch`: logs y monitoreo básico
- `Amazon Route 53`: DNS
- `AWS Certificate Manager (ACM)`: certificados TLS
- `AWS Systems Manager Parameter Store`: configuración y secretos

Servicios que quedan fuera de esta primera fase:

- `Amazon ElastiCache for Redis`
- `Amazon CloudFront`
- `AWS Secrets Manager`
- `RDS Multi-AZ`
- `staging` permanente
- `AWS WAF`

## Cómo queda la plataforma

Se despliega un único entorno real, llamado `prod`.

Ese entorno tiene:

- `frontend` en `ECS Fargate` con `1` task
- `backend` en `ECS Fargate` con `1` task
- `worker` en `ECS Fargate` con `1` task
- `1` `ALB` para enrutar frontend y backend
- `RDS PostgreSQL Single-AZ`
- `S3` para uploads
- `SES` para email

La app sigue corriendo en contenedores Docker. No se migra a Lambda ni a una arquitectura serverless de aplicación.

## Dominios

La estructura recomendada es:

- `app.<dominio>` para frontend
- `api.<dominio>` para backend

En esta fase no hace falta agregar `assets.<dominio>`, porque las imágenes pueden servirse directamente desde `S3`.

Más adelante, si se agrega `CloudFront`, ahí sí conviene pasar a:

- `assets.<dominio>` para imágenes públicas

## Qué significa Single-AZ

`AZ` significa `Availability Zone`.

Una `Single-AZ` database corre en una sola zona de disponibilidad dentro de una región de AWS.

Ventajas:

- menor costo
- menos complejidad inicial
- suficiente para una app pre-launch

Desventaja:

- si esa zona falla, la base de datos puede quedar fuera de servicio hasta recuperación

Más adelante se puede pasar a `Multi-AZ`.

`Multi-AZ` agrega una réplica standby en otra zona y failover automático. Eso mejora disponibilidad, pero sube bastante el costo.

## Pub/Sub explicado simple

`Pub/Sub` significa `publish / subscribe`.

Es un patrón donde una parte del sistema publica un evento y otra parte se suscribe para recibirlo.

Ejemplo simple:

- el backend publica `nuevo ganador`
- los clientes conectados que están suscriptos reciben ese evento en tiempo real

Hoy el proyecto usa `PubSub` en memoria en [notifications.module.ts](/Users/danieldevita/Desktop/p/luk/backend/src/notifications/notifications.module.ts).

Eso funciona bien mientras haya una sola instancia de backend.

Problema:

- si mañana hay `2` backends, cada uno tiene su propia memoria
- un evento publicado en el backend `A` no necesariamente llega a los clientes conectados al backend `B`

Por eso, cuando llegue el momento de escalar horizontalmente el backend, habrá que reemplazar ese `PubSub` en memoria por un `PubSub` compartido, típicamente soportado por `Redis`.

## Por qué Redis queda afuera por ahora

Hoy el proyecto ya soporta cache en Redis si existe `REDIS_URL`, pero también puede caer a memoria si no existe, como se ve en [cache.module.ts](/Users/danieldevita/Desktop/p/luk/backend/src/common/cache/cache.module.ts).

Como en esta fase inicial el backend va a correr con una sola task:

- el cache en memoria no rompe la arquitectura
- el `PubSub` en memoria tampoco rompe la arquitectura

Por eso `Redis` no es estrictamente necesario ahora.

Se agrega después cuando ocurra una de estas cosas:

- el backend pase a `2+` réplicas
- haga falta cache compartida real
- haga falta pub/sub compartido para notifications o subscriptions

## Variables de entorno sin Secrets Manager

En esta fase la recomendación es usar `AWS Systems Manager Parameter Store`.

Separación sugerida:

- parámetros normales para config no sensible
- `SecureString` para secretos

Ejemplos de config no sensible:

- `FRONTEND_URL`
- `BACKEND_URL`
- `CORS_ORIGIN`
- flags de features

Ejemplos de secretos:

- `DATABASE_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `GOOGLE_CLIENT_SECRET`
- `MP_ACCESS_TOKEN`
- cualquier clave privada de integración

La idea no es meter secretos en el código ni en la task definition. `ECS` puede inyectarlos como variables de entorno leyendo desde `Parameter Store`.

## Política de secretos y `DATABASE_URL`

`DATABASE_URL` debe tratarse siempre como secreto de infraestructura.

Reglas:

- en `prod` y en `staging` reales no debe vivir en el repo;
- no debe quedar hardcodeada en imágenes Docker;
- no debe quedar hardcodeada en task definitions de `ECS`;
- en AWS debe venir desde `SSM Parameter Store` como `SecureString`, inyectada al runtime.

Lo único aceptable fuera de ese esquema es un valor dummy en `CI`, siempre que:

- apunte a una base efímera del workflow;
- no represente una base compartida ni persistente;
- no sea una credencial real de staging ni de producción.

Ese caso de `CI` no cambia la política productiva. Es una excepción técnica limitada al runner temporal.

## Matriz por entorno

### `local/dev`

- puede seguir temporalmente con `prisma db push` mientras no exista una baseline de migraciones;
- puede usar seeds de QA/dev;
- no equivale todavía a un flujo listo para producción.

### `CI`

- puede usar una `DATABASE_URL` dummy si apunta a PostgreSQL efímero del job;
- puede inyectar secrets dummy sólo para validar build, tests y generación de client;
- no debe usarse como argumento para relajar la política de secretos de entornos reales.

### `prod`

- debe usar migraciones versionadas;
- debe usar `DATABASE_URL` y secretos externos;
- no debe usar `db push` como mecanismo de arranque;
- debe ejecutar migraciones en un paso controlado de release/deploy.

## Imágenes sin Cloudinary ni CloudFront

La primera fase debe ser simple:

- el backend genera una `presigned URL`
- el frontend sube directo a `S3`
- la app guarda el `object key` o la referencia del archivo

Recomendación importante:

- guardar el `key` del objeto en vez de una URL rígida

Así, cuando después se agregue `CloudFront`, no hace falta migrar datos ni reescribir referencias.

En esta etapa:

- `upload`: directo a `S3`
- `delivery`: desde `S3`
- `cache`: navegador + headers HTTP básicos

`CloudFront` se suma más adelante cuando el tráfico o la distribución global lo justifiquen.

## Email sin Brevo

La decisión es pasar a `Amazon SES`.

Se mantiene:

- envío desde backend
- misma lógica funcional
- mismos emails transaccionales

Lo que cambia:

- provider
- configuración del dominio remitente
- integración SDK

Antes de usar SES en serio hay que:

- verificar dominio o subdominio
- configurar `SPF`
- configurar `DKIM`
- definir política `DMARC`
- sacar la cuenta de `sandbox`

## Qué cambia del código actual

El impacto esperado es **moderado**, no una reescritura.

### Cambios reales de aplicación

- `Cloudinary -> S3`
- `Brevo -> SES`
- actualización de variables y dominios
- callbacks OAuth y webhooks con nuevas URLs
- despliegue y arranque adaptado a ECS
- endurecer Prisma para producción real:
  - recrear `prisma/migrations`;
  - generar una baseline migration inicial desde el schema actual;
  - usar `prisma migrate dev` para cambios futuros;
  - usar `prisma migrate deploy` en release/deploy;
  - `db push` no debe usarse como mecanismo de arranque en `prod`.

### Cambios que no hacen falta en esta fase

- no hace falta meter `Redis`
- no hace falta cambiar `PubSub` todavía
- no hace falta hacer backend multi-réplica
- no hace falta montar `staging` permanente
- no hace falta sumar `CloudFront`

## Estado actual del repo vs objetivo productivo

Hoy el repo está en un estado transicional.

Realidad actual:

- no existe `backend/prisma/migrations`;
- el flujo local vigente usa `prisma db push`;
- el seed actual es canónico para `QA/dev`;
- eso sirve para desarrollo rápido, pero no equivale todavía a un setup listo para producción real.

Conclusión:

- el repo hoy está preparado para desarrollo, QA manual y validación local;
- antes de un deploy productivo real todavía falta formalizar la capa de migraciones versionadas y alinear el arranque de servicios con ese modelo.

## Estado pre-prod unificado (sin migraciones todavía)

Decisión vigente mientras no haya salida a PROD: todo usa `prisma db push`, no hay `backend/prisma/migrations`.

- [`backend/Dockerfile`](../backend/Dockerfile) arranca con `prisma db push --skip-generate`;
- [`backend/Dockerfile.social-worker`](../backend/Dockerfile.social-worker) arranca con `prisma db push --skip-generate`;
- [`docker-compose.yml`](../docker-compose.yml) arranca con `prisma db push --skip-generate`;
- CI usa `prisma db push --skip-generate` sobre PostgreSQL efímero.

Antes del primer deploy productivo real habrá que:

- recrear `backend/prisma/migrations` con una baseline desde el schema actual;
- usar `prisma migrate dev` para cambios futuros;
- usar `prisma migrate deploy` en un paso controlado de release/deploy (nunca en el `CMD` del contenedor).

## Qué servicios aprovechan mejor free tier o créditos

En esta arquitectura inicial, los servicios donde más ayuda da el free tier o los créditos son:

- `ECR`
- `S3`
- `SES`
- `CloudWatch`
- `ACM`
- parte del uso inicial de `RDS`

Los servicios que hay que asumir como pago necesario desde temprano:

- `ECS Fargate`
- `ALB`
- `Route 53`
- `RDS PostgreSQL` cuando se pase del uso gratis o del crédito disponible

## Costos: criterio de diseño

La meta no es “todo gratis”.

La meta es:

- pagar sólo lo estrictamente necesario para tener un entorno real
- dejar fuera por ahora lo caro que no agrega valor inmediato

Por eso esta fase evita:

- `Redis`
- `CloudFront`
- `Multi-AZ`
- `WAF`
- un segundo entorno siempre encendido

## Infra como código

La recomendación sigue siendo usar `infra como código`, idealmente con `AWS CDK` en `TypeScript`.

Eso no significa serverless.

Significa describir infraestructura en código para no depender de crear todo a mano en consola.

Ese código puede vivir en una carpeta como:

- `infra/`

Y definir:

- networking
- ECS
- ALB
- RDS
- S3
- SES
- DNS
- certificados
- parámetros
- logs

## Plan por etapas

### Etapa 1: preparar AWS

- crear cuenta y región principal
- definir dominio
- preparar `Route 53` y `ACM`
- crear repos en `ECR`
- modelar infraestructura con `CDK`

### Etapa 2: mover cómputo y base

- desplegar `frontend`, `backend` y `worker` en `ECS Fargate`
- crear `RDS PostgreSQL Single-AZ`
- apuntar la app a la nueva base
- dejar logs en `CloudWatch`
- restaurar Prisma Migrate con baseline antes del primer deploy real
- ejecutar migraciones con `prisma migrate deploy`, no con `db push`

### Etapa 3: reemplazar proveedores externos

- migrar `Cloudinary -> S3`
- migrar `Brevo -> SES`
- actualizar variables, callbacks y webhooks

### Etapa 4: validar operación real

- probar login
- probar Google OAuth
- probar GraphQL
- probar pagos y webhooks
- probar upload de imágenes
- probar envío de emails
- probar social worker

### Etapa 5: endurecer cuando haya tracción

- agregar `CloudFront`
- agregar `Redis`
- pasar backend a múltiples réplicas
- reemplazar `PubSub` en memoria por backend compartido
- pasar `RDS` a `Multi-AZ`
- crear `staging` permanente

## Qué se deja decidido hoy

- AWS-only real
- un solo entorno real por ahora
- `prod` alcanza para esta etapa
- `Single-AZ` al inicio
- `S3` sin `CloudFront` al inicio
- `SES` para email
- `Parameter Store` en lugar de `Secrets Manager`
- `Redis` descartado por ahora
- Docker se mantiene

## Conclusión

La arquitectura recomendada para esta etapa es:

- `ECR`
- `ECS Fargate`
- `ALB`
- `RDS PostgreSQL Single-AZ`
- `S3`
- `SES`
- `CloudWatch`
- `Route 53`
- `ACM`
- `SSM Parameter Store`

Es una opción profesional, AWS-only y razonable para una app que todavía está en desarrollo, sin pagar todavía por alta disponibilidad, CDN y cache distribuido que aún no son imprescindibles.

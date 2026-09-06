# Social Promotions

## Resumen

La promoción social verificable permite que sellers publiquen una rifa en redes, registren el permalink y obtengan una bonificación promocional interna si la publicación cumple las reglas.

Hoy permite:

- generar drafts promocionales por rifa;
- publicar manualmente en redes sociales;
- registrar el `permalink` del post;
- validar que el post exista, siga público y conserve el `trackingUrl` o `promotionToken` de Luk;
- guardar snapshots de métricas visibles;
- atribuir clicks, registros y compras dentro de Luk;
- emitir bonificaciones promocionales para compras futuras dentro de la plataforma;
- notificar activamente por email e in-app cuando se emite una bonificación;
- revertir grants cuando una compra bonificada recibe un refund completo.

## Redes soportadas

Redes con validación real comprobada:

- `Facebook`
- `Instagram`
- `X`

La red permitida se controla además por configuración mediante `SOCIAL_PROMOTION_ALLOWED_NETWORKS`.

## Reglas funcionales vigentes

### Sobre drafts y publicaciones

- solo el dueño de una rifa puede iniciar un draft promocional;
- solo se pueden promocionar rifas `ACTIVA`;
- el draft tiene vencimiento configurable (`SOCIAL_PROMOTION_TOKEN_TTL_HOURS`);
- el permalink enviado debe corresponder a la misma red del draft;
- un draft no puede reutilizarse para múltiples publicaciones;
- el post debe conservar el `trackingUrl` o `promotionToken` de Luk para seguir siendo elegible.

### Sobre ownership y uso del beneficio

- solo el seller dueño puede registrar publicaciones sobre su rifa;
- la bonificación promocional pertenece al usuario que la ganó;
- una bonificación no puede aplicarse sobre una rifa propia;
- la bonificación se usa durante la compra con Saldo LUK y queda reservada dentro de esa transacción;
- no acumula con el pack simple global cuando el pack aplica.

## Arquitectura real

La solución corre en dos procesos.

### Backend

Responsable de:

- GraphQL y endpoints REST;
- creación de drafts promocionales;
- registro de permalinks;
- lectura de posts, grants y snapshots para la UI;
- integración de bonificaciones con compras de tickets usando Saldo LUK;
- persistencia de métricas atribuidas dentro de Luk.

### Social Worker

Proceso separado, sin endpoints públicos.

Responsable de:

- validar posts pendientes;
- volver a chequear posts activos;
- usar `fetch` y fallback a `Playwright` cuando hace falta;
- guardar snapshots;
- liquidar promociones cerradas y emitir bonificaciones.

Jobs actuales:

- validación periódica de posts debidos: cada `12 horas` por default, configurable con `SOCIAL_PROMOTION_CHECK_CRON` (el scraping es costoso y con riesgo de rate-limit, por eso no se valida más seguido);
- settlement de posts cerrados: cada `30 minutos` (sólo DB, sin scraping).

## Estrategia de validación y monitoreo

Por cada post promocional:

1. se intenta cargar el contenido público con `fetch`;
2. si el HTML no alcanza o no aparecen métricas visibles, se reintenta con `Playwright`;
3. el parser evalúa:
   - accesibilidad pública,
   - canonicalización del permalink,
   - presencia del `trackingUrl` o `promotionToken`,
   - métricas visibles;
4. se guarda un snapshot en base de datos;
5. si corresponde, el post sigue en monitoreo periódico hasta el cierre de la rifa.

Si hay falla técnica o lectura ambigua, el sistema puede mover el caso a `TECHNICAL_REVIEW`.

Si hay incumplimiento de negocio confirmado, el post pasa a `DISQUALIFIED`.

## Métricas y modelo mental

La feature separa dos fuentes de señal.

### Métricas públicas de la red social

- `likesCount`
- `commentsCount`
- `repostsOrSharesCount`
- `viewsCount`

### Métricas propias de Luk

- `clicksAttributed`
- `registrationsAttributed`
- `ticketPurchasesAttributed`

Las métricas públicas son visibles y frágiles. Las métricas de Luk son internas y más confiables para atribución.

## Estados activos

El estado operativo del post vive en `SocialPromotionPost`.

Estados vigentes:

- `PENDING_VALIDATION`
- `ACTIVE`
- `TECHNICAL_REVIEW`
- `DISQUALIFIED`
- `SETTLED`

Campos operativos más importantes:

- `canonicalPermalink`
- `lastCheckedAt`
- `nextCheckAt`
- `validatedAt`
- `disqualificationReason`

## Bonificación promocional y checkout

La feature emite `PromotionBonusGrant` para compras futuras dentro de Luk.

Comportamiento operativo actual:

- la bonificación se previsualiza antes de comprar;
- si el grant está disponible, se reserva;
- si la compra con saldo se confirma, el grant pasa a usado;
- si la compra falla antes de emitir tickets, el grant se libera;
- la bonificación reduce el Saldo LUK debitado al buyer;
- el seller no absorbe el descuento: se registra como subsidio de plataforma.

El cálculo del descuento se limita por:

- `discountPercent` del grant;
- `maxDiscountAmount` del grant;
- el subtotal de la compra con saldo.

## Reversión de grants por refund

Cuando una compra usó una `bonificación promocional`:

- si la compra recibe un `refund completo`, el grant vuelve a `AVAILABLE`;
- la `redemption` pasa a `REVERSED`;
- se crea una transacción contable `REVERSION_BONIFICACION_PROMOCIONAL`;
- el admin puede auditar esa reversión desde `/admin`, en la pestaña `Promoción Social`.

Si el refund es parcial:

- el grant no vuelve;
- la `redemption` permanece `USED`;
- no se genera reversión del beneficio.

El log admin de reversiones muestra:

- comprador;
- rifa;
- monto del grant devuelto;
- monto del refund acreditado a Saldo LUK;
- `purchaseReference`;
- `grantId`;
- `redemptionId`;
- tipo de refund.

## Limitaciones actuales

- se usan señales públicas, no métricas internas oficiales de las redes;
- `X` y `Facebook` pueden exigir `Playwright` para conseguir métricas visibles;
- algunas métricas pueden seguir viniendo como `null` si la red no las expone públicamente;
- el admin muestra cola de `TECHNICAL_REVIEW` y log de reversiones, pero no un historial completo de todos los posts promocionales.

## Comandos útiles

Ver [COMMANDS.md](../COMMANDS.md), especialmente la sección `Social Promotions Debugging`.

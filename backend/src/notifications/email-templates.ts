import { ConfigService } from '@nestjs/config';
import {
  BRAND_EXPLORE_CTA_LABEL,
  BRAND_NAME,
} from '../common/constants/brand.constants';

interface EmailTemplateOptions {
  showButton?: boolean;
  buttonText?: string;
  buttonUrl?: string;
}

const getColors = () => ({
  primary: '#0F766E', // Teal
  primaryDark: '#115E59',
  secondary: '#D97706', // Amber
  accent: '#F97316', // Orange
  background: '#FAFAF9', // Warm white
  card: '#FFFFFF',
  text: '#1F2937',
  muted: '#6B7280',
  border: '#E5E7EB',
  success: '#10B981',
  destructive: '#EF4444',
});

const getFrontendUrl = (configService: ConfigService): string => {
  return configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
};

const formatDateEsAr = (value: Date): string =>
  new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(value);

const formatAmountEsAr = (value: number): string =>
  new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const wrapEmailTemplate = (
  content: string,
  configService: ConfigService,
  options?: EmailTemplateOptions,
): string => {
  const frontendUrl = getFrontendUrl(configService);
  const colors = getColors();

  const buttonHtml =
    options?.showButton && options?.buttonText && options?.buttonUrl
      ? `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${options.buttonUrl}" style="
        display: inline-block;
        background-color: ${colors.primary};
        color: white;
        padding: 14px 32px;
        text-decoration: none;
        border-radius: 10px;
        font-family: 'DM Sans', sans-serif;
        font-weight: 500;
        font-size: 14px;
        box-shadow: 0 4px 6px -1px rgba(15, 118, 110, 0.2), 0 2px 4px -1px rgba(15, 118, 110, 0.1);
        transition: background-color 0.2s;
      ">${options.buttonText}</a>
    </div>
  `
      : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;500;700&family=Fraunces:opsz,wght@9..144,300;400;600;700&display=swap" rel="stylesheet">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;500;700&family=Fraunces:opsz,wght@9..144,300;400;600;700&display=swap');
          body { font-family: 'DM Sans', sans-serif; }
          h1, h2, h3 { font-family: 'Fraunces', serif; }
        </style>
      </head>
      <body style="
        margin: 0;
        padding: 0;
        background-color: ${colors.background};
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        -webkit-font-smoothing: antialiased;
        color: ${colors.text};
      ">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${colors.background}; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: ${colors.card}; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05); border: 1px solid ${colors.border};">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark}); padding: 32px 40px; text-align: center;">
                    <h1 style="margin: 0; color: white; font-family: 'Fraunces', serif; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                      ${BRAND_NAME}
                    </h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    ${content}
                    ${buttonHtml}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding: 24px 40px; background-color: #F8F8F7; border-top: 1px solid ${colors.border};">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="text-align: center;">
                          <p style="margin: 0 0 12px 0; color: ${colors.muted}; font-size: 12px;">
                            <a href="${frontendUrl}" style="color: ${colors.primary}; text-decoration: none; font-weight: 500;">Ir a la plataforma</a>
                            &nbsp;•&nbsp;
                            <a href="${frontendUrl}/legal/terminos" style="color: ${colors.primary}; text-decoration: none; fontWeight: 500;">Términos</a>
                            &nbsp;•&nbsp;
                            <a href="${frontendUrl}/legal/privacidad" style="color: ${colors.primary}; text-decoration: none; fontWeight: 500;">Privacidad</a>
                          </p>
                          <p style="margin: 0; color: #9CA3AF; font-size: 11px;">
                            © ${new Date().getFullYear()} ${BRAND_NAME}. Todos los derechos reservados.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

export const getWelcomeEmailContent = (
  data: { userName: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      ¡Bienvenido, ${data.userName}! 🎉
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Tu cuenta ha sido creada exitosamente. Ya podés empezar a participar en rifas increíbles.
    </p>
    <div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 20px; margin: 24px 0;">
      <p style="color: #0F766E; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">Ahora podés:</p>
      <ul style="color: #0F766E; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
        <li>Participar en rifas y ganar premios increíbles</li>
        <li>Crear tus propias rifas (configurá tu cuenta de cobros)</li>
        <li>Gestionar tus tickets y seguir tus premios</li>
      </ul>
    </div>
    <p style="color: #9CA3AF; font-size: 12px; margin: 24px 0 0 0;">
      Si no creaste esta cuenta, podés ignorar este mensaje.
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: BRAND_EXPLORE_CTA_LABEL,
    buttonUrl: frontendUrl,
  });
};

export const getEmailVerificationCodeContent = (
  data: { userName: string; code: string; expiresInMinutes: number },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      ¡Hola ${data.userName}!
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
      Para completar tu registro, ingresá este código:
    </p>
    <div style="background: linear-gradient(135deg, #F0FDFA, #E0F2FE); padding: 32px; text-align: center; border-radius: 12px; margin: 24px 0;">
      <div style="font-size: 42px; font-weight: 700; letter-spacing: 12px; color: #0F766E; font-family: monospace;">
        ${data.code}
      </div>
    </div>
    <p style="color: #6B7280; font-size: 14px; margin: 0;">
      Este código expira en <strong style="color: #1F2937;">${data.expiresInMinutes} minutos</strong>.
    </p>
    <p style="color: #9CA3AF; font-size: 12px; margin: 24px 0 0 0;">
      Si no solicitaste este código, podés ignorar este email.
    </p>
  `;
  return wrapEmailTemplate(content, configService);
};

export const getPasswordResetContent = (
  data: { userName: string; resetToken: string; expiresInMinutes: number },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const resetUrl = `${frontendUrl}/auth/reset-password?token=${encodeURIComponent(data.resetToken)}`;
  const escapedResetUrl = escapeHtml(resetUrl);
  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      Restablecé tu contraseña
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.userName}, recibimos un pedido para cambiar la contraseña de tu cuenta.
    </p>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Usá el botón de abajo o copiá este enlace en tu navegador:
    </p>
    <div style="background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 12px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0; color: #0F172A; font-size: 13px; line-height: 1.7; word-break: break-word;">
        ${escapedResetUrl}
      </p>
    </div>
    <p style="color: #6B7280; font-size: 14px; margin: 0;">
      Este enlace expira en <strong style="color: #1F2937;">${data.expiresInMinutes} minutos</strong> y solo se puede usar una vez.
    </p>
    <p style="color: #9CA3AF; font-size: 12px; margin: 24px 0 0 0;">
      Si no solicitaste este cambio, podés ignorar este email.
    </p>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Restablecer contraseña',
    buttonUrl: resetUrl,
  });
};

export const getPasswordResetConfirmationContent = (
  data: { userName: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const loginUrl = `${frontendUrl}/auth/login`;
  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      Tu contraseña fue actualizada
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.userName}, tu contraseña de LUK se cambió correctamente.
    </p>
    <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #92400E; font-size: 14px; line-height: 1.6; margin: 0;">
        Si no fuiste vos, te recomendamos volver a iniciar sesión y revisar la seguridad de tu cuenta cuanto antes.
      </p>
    </div>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Iniciar sesión',
    buttonUrl: loginUrl,
  });
};

export const getTwoFactorEnabledContent = (
  data: { userName: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #0F766E; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      La autenticación en dos pasos ya está activa 🔐
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.userName}, tu cuenta ahora requiere un segundo factor para iniciar sesión.
    </p>
    <div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #0F766E; font-size: 14px; margin: 0 0 12px 0; font-weight: 700;">
        Qué revisar ahora
      </p>
      <ul style="color: #0F766E; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
        <li>Guardá tus códigos de recuperación en un lugar seguro.</li>
        <li>Verificá que tu app autenticadora siga vinculada correctamente.</li>
      </ul>
    </div>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6; margin: 0;">
      Si no realizaste este cambio, revisá tu configuración de seguridad cuanto antes.
    </p>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Revisar seguridad',
    buttonUrl: `${frontendUrl}/dashboard/settings`,
  });
};

export const getTwoFactorDisabledContent = (
  data: { userName: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #D97706; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      La autenticación en dos pasos fue desactivada ⚠️
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.userName}, tu cuenta ya no requiere un segundo factor para iniciar sesión.
    </p>
    <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #92400E; font-size: 14px; line-height: 1.6; margin: 0;">
        Si no realizaste este cambio, te recomendamos revisar tu cuenta y volver a activar 2FA cuanto antes.
      </p>
    </div>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ir a seguridad',
    buttonUrl: `${frontendUrl}/dashboard/settings`,
  });
};

export const getTwoFactorRecoveryCodeUsedContent = (
  data: { userName: string; remainingRecoveryCodesCount: number },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const remainingCodesLabel =
    data.remainingRecoveryCodesCount === 1
      ? 'Te queda 1 código de recuperación.'
      : `Te quedan ${data.remainingRecoveryCodesCount} códigos de recuperación.`;

  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      Se usó un código de recuperación 🔐
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.userName}, ingresaste a tu cuenta usando un código de respaldo de 2FA.
    </p>
    <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #1D4ED8; font-size: 16px; font-weight: 700; margin: 0 0 8px 0;">
        ${remainingCodesLabel}
      </p>
      <p style="color: #1D4ED8; font-size: 14px; line-height: 1.6; margin: 0;">
        Revisá tu configuración de seguridad y asegurate de conservar los códigos restantes.
      </p>
    </div>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6; margin: 0;">
      Si no fuiste vos, cambiá tu contraseña y revisá tu cuenta inmediatamente.
    </p>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Revisar seguridad',
    buttonUrl: `${frontendUrl}/dashboard/settings`,
  });
};

export const getPromotionBonusGrantIssuedContent = (
  data: {
    userName: string;
    raffleName: string;
    discountPercent: number;
    maxDiscountAmount: number;
    expiresAt: Date;
  },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      ¡Ganaste una bonificación promocional! 🎁
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.userName}, tu publicación promocional para la rifa "<strong>${data.raffleName}</strong>" calificó para un nuevo beneficio.
    </p>
    <div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #0F766E; font-size: 16px; font-weight: 700; margin: 0 0 8px 0;">
        ${data.discountPercent}% off hasta $${formatAmountEsAr(data.maxDiscountAmount)}
      </p>
      <p style="color: #0F766E; font-size: 14px; line-height: 1.6; margin: 0;">
        Podés usarla comprando tickets en rifas de otros vendedores. Vence el <strong>${formatDateEsAr(data.expiresAt)}</strong>.
      </p>
    </div>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0;">
      Ya la podés ver en tu panel de comprador, dentro de tus bonificaciones promocionales disponibles.
    </p>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver mis bonificaciones',
    buttonUrl: `${frontendUrl}/dashboard/tickets`,
  });
};

export const getTicketPurchaseConfirmationContent = (
  data: {
    raffleName: string;
    purchaseReference: string;
    ticketNumbers: number[];
    amount: number;
    packApplied?: boolean;
    baseQuantity?: number;
    bonusQuantity?: number;
    grantedQuantity?: number;
    subsidyAmount?: number;
  },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const hasPackDetails =
    data.packApplied &&
    typeof data.baseQuantity === 'number' &&
    typeof data.bonusQuantity === 'number' &&
    typeof data.grantedQuantity === 'number' &&
    data.bonusQuantity > 0;
  const paidTicketCount = data.baseQuantity ?? data.ticketNumbers.length;
  const grantedTicketCount = data.grantedQuantity ?? data.ticketNumbers.length;
  const packDetailsHtml = hasPackDetails
    ? `
      <div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 20px; margin: 0 0 16px 0;">
        <p style="color: #0F766E; font-size: 14px; margin: 0 0 12px 0; font-weight: 700;">Pack simple aplicado</p>
        <p style="color: #0F766E; font-size: 14px; margin: 0 0 8px 0;">Pagaste <strong>${paidTicketCount}</strong> ticket(s).</p>
        <p style="color: #0F766E; font-size: 14px; margin: 0 0 8px 0;">Recibiste <strong>${data.bonusQuantity}</strong> ticket(s) bonus.</p>
        <p style="color: #0F766E; font-size: 14px; margin: 0 0 8px 0;">Total emitido: <strong>${grantedTicketCount}</strong> ticket(s).</p>
        <p style="color: #0F766E; font-size: 14px; margin: 0;">LUK subsidió <strong>$${(data.subsidyAmount ?? 0).toFixed(2)}</strong> de esta compra.</p>
      </div>
    `
    : '';
  const content = `
    <h2 style="color: #10B981; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      ¡Compra confirmada! ✅
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
      ${
        hasPackDetails
          ? `Pagaste ${paidTicketCount} ticket(s) y recibiste ${grantedTicketCount} en total para la rifa:`
          : `Has comprado ${data.ticketNumbers.length} ticket(s) para la rifa:`
      }
    </p>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <h3 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; margin: 0 0 16px 0;">${data.raffleName}</h3>
      ${packDetailsHtml}
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
        <p style="color: #4B5563; font-size: 14px; margin: 0;"><strong>Números:</strong> ${data.ticketNumbers.join(', ')}</p>
      </div>
      <p style="color: #64748B; font-size: 12px; margin: 0 0 16px 0;"><strong>Referencia:</strong> ${escapeHtml(data.purchaseReference)}</p>
      <div style="background: #ECFDF5; border-radius: 8px; padding: 12px; text-align: center;">
        <p style="color: #059669; font-size: 20px; font-weight: 700; margin: 0;">Total cobrado: $${data.amount.toFixed(2)}</p>
      </div>
    </div>
    <p style="color: #4B5563; font-size: 16px; text-align: center; margin: 0;">
      ¡Buena suerte! 🍀
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver comprobante',
    buttonUrl: `${frontendUrl}/dashboard/tickets/receipts/${encodeURIComponent(data.purchaseReference)}`,
  });
};

export const getRaffleCompletedNotificationContent = (
  data: { raffleName: string },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #0F766E; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      ¡Todos los tickets vendidos! 🎯
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      La rifa "<strong>${data.raffleName}</strong>" ha vendido todos sus tickets.
    </p>
    <div style="background: #F0FDFA; border-radius: 12px; padding: 20px; border: 1px solid #99F6E4;">
      <p style="color: #0F766E; font-size: 15px; margin: 0;">
        El sorteo se realizará pronto. ¡Mucha suerte!
      </p>
    </div>
  `;
  return wrapEmailTemplate(content, configService);
};

export const getWinnerNotificationContent = (
  data: {
    raffleName: string;
    productName: string;
    sellerEmail: string;
    winningTicketNumber: number;
  },
  configService: ConfigService,
) => {
  const content = `
    <div style="background: linear-gradient(135deg, #0F766E, #115E59); border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 24px;">
      <h2 style="color: white; font-family: 'Fraunces', serif; font-size: 28px; font-weight: 800; margin: 0;">🎉 ¡FELICITACIONES!</h2>
      <p style="color: rgba(255,255,255,0.9); font-size: 18px; margin: 8px 0 0 0;">¡Sos el ganador!</p>
    </div>
    <p style="color: #4B5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
      Has ganado la rifa <strong>"${data.raffleName}"</strong>.
    </p>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 12px 0; color: #4B5563;"><strong>Producto:</strong> ${data.productName}</p>
      <p style="margin: 0 0 12px 0; color: #4B5563;"><strong>Número ganador:</strong> #${data.winningTicketNumber}</p>
      <p style="margin: 0; color: #4B5563;"><strong>Email del vendedor:</strong> <a href="mailto:${data.sellerEmail}" style="color: #0F766E; text-decoration: none; font-weight: 600;">${data.sellerEmail}</a></p>
    </div>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6;">
      El vendedor se pondrá en contacto contigo pronto para coordinar el envío.
    </p>
    <div style="background: #FFFBEB; border: 1px solid #FEF3C7; border-radius: 8px; padding: 16px; margin-top: 24px;">
      <p style="color: #92400E; font-size: 14px; margin: 0;">
        <strong>Importante:</strong> Recordá confirmar la recepción del producto una vez que lo tengas para liberar el pago.
      </p>
    </div>
  `;
  return wrapEmailTemplate(content, configService);
};

export const getRaffleParticipantNotificationContent = (
  data: { raffleName: string; winnerName: string },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #1F2937; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Resultado del sorteo</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      La rifa "<strong>${data.raffleName}</strong>" ya tiene un ganador.
    </p>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Lamentablemente no fuiste el ganador esta vez, ¡pero hay muchas otras rifas activas en las que podés participar!
    </p>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0;">
      ¡Gracias por participar y suerte la próxima! 🍀
    </p>
  `;
  return wrapEmailTemplate(content, configService);
};

export const getRefundNotificationContent = (
  data: { raffleName: string; amount: number; reason: string },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #D94F4F; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Reembolso procesado 💰</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Se ha procesado exitosamente el reembolso para la rifa "<strong>${data.raffleName}</strong>".
    </p>
    <div style="background: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 12px 0; color: #4B5563; font-size: 18px;"><strong>Monto:</strong> <span style="color: #B91C1C; font-weight: 700;">$${data.amount.toFixed(2)}</span></p>
      <p style="margin: 0; color: #4B5563; font-size: 14px;"><strong>Motivo:</strong> ${data.reason}</p>
    </div>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      El monto fue acreditado nuevamente en tu Saldo LUK.
    </p>
  `;
  return wrapEmailTemplate(content, configService);
};

export const getCreditTopUpApprovedContent = (
  data: {
    amount: number;
    topUpSessionId: string;
    providerPaymentId?: string | null;
    providerOrderId?: string | null;
  },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const providerPaymentId = data.providerPaymentId
    ? `<p style="color: #64748B; font-size: 12px; margin: 8px 0 0 0;">Pago proveedor: ${escapeHtml(data.providerPaymentId)}</p>`
    : '';
  const providerOrderId = data.providerOrderId
    ? `<p style="color: #64748B; font-size: 12px; margin: 8px 0 0 0;">Orden proveedor: ${escapeHtml(data.providerOrderId)}</p>`
    : '';
  const content = `
    <h2 style="color: #10B981; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">Saldo acreditado ✅</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Tu carga de Saldo LUK fue aprobada y ya está disponible en tu wallet.
    </p>
    <div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #0F766E; font-size: 14px; margin: 0 0 8px 0;"><strong>Monto acreditado:</strong></p>
      <p style="color: #059669; font-size: 28px; font-weight: 800; margin: 0;">$${formatAmountEsAr(data.amount)}</p>
      <p style="color: #64748B; font-size: 12px; margin: 12px 0 0 0;">Operación: ${escapeHtml(data.topUpSessionId)}</p>
      ${providerPaymentId}
      ${providerOrderId}
    </div>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver comprobante',
    buttonUrl: `${frontendUrl}/dashboard/wallet/receipts/${encodeURIComponent(data.topUpSessionId)}`,
  });
};

export const getCreditTopUpFailedContent = (
  data: { amount: number; status: string; statusDetail?: string | null },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const detail = data.statusDetail
    ? `<p style="color: #B91C1C; font-size: 14px; margin: 8px 0 0 0;"><strong>Detalle:</strong> ${escapeHtml(data.statusDetail)}</p>`
    : '';
  const content = `
    <h2 style="color: #EF4444; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">No pudimos acreditar tu carga</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      La carga de Saldo LUK por <strong>$${formatAmountEsAr(data.amount)}</strong> quedó en estado <strong>${escapeHtml(data.status)}</strong>.
    </p>
    <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 20px; margin: 24px 0;">
      <p style="color: #B91C1C; font-size: 14px; margin: 0;">No se acreditó saldo en tu wallet.</p>
      ${detail}
    </div>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Volver a la wallet',
    buttonUrl: `${frontendUrl}/dashboard/wallet`,
  });
};

export const getCreditTopUpRefundedContent = (
  data: { amount: number; fullRefund: boolean },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">Reintegro de carga procesado</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Procesamos un reintegro ${data.fullRefund ? 'total' : 'parcial'} de una carga de Saldo LUK.
    </p>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #64748B; font-size: 14px; margin: 0 0 8px 0;"><strong>Monto reintegrado:</strong></p>
      <p style="color: #1E293B; font-size: 28px; font-weight: 800; margin: 0;">$${formatAmountEsAr(data.amount)}</p>
    </div>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver movimientos',
    buttonUrl: `${frontendUrl}/dashboard/wallet`,
  });
};

export const getSellerPaymentNotificationContent = (
  data: { raffleName: string; amount: number; fees: number },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #10B981; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">¡Pago recibido! 💰</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Has recibido el pago por tu rifa "<strong>${data.raffleName}</strong>".
    </p>
    <div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color: #64748B; font-size: 14px; padding-bottom: 8px;">Monto bruto:</td>
          <td align="right" style="color: #1E293B; font-size: 14px; padding-bottom: 8px;">$${(data.amount + data.fees).toFixed(2)}</td>
        </tr>
        <tr>
          <td style="color: #64748B; font-size: 14px; padding-bottom: 8px;">Comisiones:</td>
          <td align="right" style="color: #EF4444; font-size: 14px; padding-bottom: 8px;">-$${data.fees.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="color: #1E293B; font-size: 18px; font-weight: 700; border-top: 1px solid #E2E8F0; padding-top: 12px;">Monto neto:</td>
          <td align="right" style="color: #059669; font-size: 22px; font-weight: 800; border-top: 1px solid #E2E8F0; padding-top: 12px;">$${data.amount.toFixed(2)}</td>
        </tr>
      </table>
    </div>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      El monto neto ha sido acreditado en tu cuenta vinculada.
    </p>
  `;
  return wrapEmailTemplate(content, configService);
};

export const getPayoutFailedNotificationContent = (
  data: { raffleName: string; amount: number; reason: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #EF4444; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">No pudimos procesar tu pago</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hubo un problema procesando el pago de la rifa "<strong>${escapeHtml(data.raffleName)}</strong>" por <strong>$${formatAmountEsAr(data.amount)}</strong>.
    </p>
    <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 20px; margin: 24px 0;">
      <p style="color: #B91C1C; font-size: 14px; margin: 0;"><strong>Motivo:</strong> ${escapeHtml(data.reason)}</p>
    </div>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6;">
      Revisá tus datos de cobro o contactá soporte si el problema continúa.
    </p>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver payouts',
    buttonUrl: `${frontendUrl}/dashboard/payouts`,
  });
};

export const getPriceReductionSuggestionContent = (
  data: {
    raffleName: string;
    currentPrice: number;
    suggestedPrice: number;
    percentageSold: number;
    raffleId: string;
    priceReductionId: string;
  },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const relaunchUrl = `${frontendUrl}/dashboard/sales?action=relaunch&raffleId=${data.raffleId}&priceReductionId=${data.priceReductionId}`;
  const percentDiscount = (
    ((data.currentPrice - data.suggestedPrice) / data.currentPrice) *
    100
  ).toFixed(0);

  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Sugerencia de relanzamiento 📉</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Tu rifa "<strong>${data.raffleName}</strong>" no alcanzó el mínimo de ventas (${(data.percentageSold * 100).toFixed(0)}%). Todos los compradores fueron reembolsados.
    </p>
    <div style="background: #FFFBEB; border: 1px solid #FEF3C7; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color: #D97706; font-size: 14px; padding-bottom: 8px;">Tickets vendidos:</td>
          <td align="right" style="color: #D97706; font-size: 14px; font-weight: 600; padding-bottom: 8px;">${(data.percentageSold * 100).toFixed(1)}%</td>
        </tr>
        <tr>
          <td style="color: #D97706; font-size: 14px; padding-bottom: 8px;">Precio anterior:</td>
          <td align="right" style="color: #D97706; font-size: 14px; text-decoration: line-through; padding-bottom: 8px;">$${data.currentPrice.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="color: #D97706; font-size: 18px; font-weight: 700; border-top: 1px solid #FDE68A; padding-top: 12px;">Precio sugerido:</td>
          <td align="right" style="color: #10B981; font-size: 22px; font-weight: 800; border-top: 1 solid #FDE68A; padding-top: 12px;">$${data.suggestedPrice.toFixed(2)}</td>
        </tr>
      </table>
      <div style="background: #10B981; color: white; display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-top: 16px;">
        ${percentDiscount}% DE DESCUENTO
      </div>
    </div>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Basándonos en el rendimiento, te sugerimos relanzarla con este precio ajustado para asegurar el éxito.
    </p>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: '🚀 Relanzar con precio sugerido',
    buttonUrl: relaunchUrl,
  });
};

export const getRaffleExpirationReminderContent = (
  data: {
    raffleName: string;
    deadline: Date;
    soldTickets: number;
    totalTickets: number;
  },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #D97706; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">Tu rifa está por vencer</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      La rifa "<strong>${escapeHtml(data.raffleName)}</strong>" vence el <strong>${formatDateEsAr(data.deadline)}</strong>.
    </p>
    <div style="background: #FFFBEB; border: 1px solid #FEF3C7; border-radius: 12px; padding: 20px; margin: 24px 0;">
      <p style="color: #92400E; font-size: 14px; margin: 0;">
        Tickets vendidos: <strong>${data.soldTickets}/${data.totalTickets}</strong>
      </p>
    </div>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver rifa',
    buttonUrl: `${frontendUrl}/dashboard/sales`,
  });
};

export const getRaffleCancelledNotificationContent = (
  data: { raffleName: string; reason: string },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #EF4444; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Rifa cancelada ❌</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      La rifa "<strong>${data.raffleName}</strong>" ha sido cancelada.
    </p>
    <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 20px; margin: 24px 0;">
      <p style="color: #B91C1C; font-size: 14px; margin: 0;">
        <strong>Motivo:</strong> ${data.reason}
      </p>
    </div>
    <p style="color: #4B5563; font-size: 14px; line-height: 1.6;">
      Si realizaste una compra, el reembolso se procesará automáticamente y lo verás reflejado en tu cuenta en los próximos días.
    </p>
  `;
  return wrapEmailTemplate(content, configService);
};

export const getSellerMustContactWinnerContent = (
  data: {
    raffleName: string;
    winnerEmail: string;
    winningTicketNumber: number;
  },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #0F766E; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">¡Acción requerida! 🚀</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Tu rifa "<strong>${data.raffleName}</strong>" tiene un ganador.
    </p>
    <div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #0F766E; font-size: 14px; margin: 0 0 12px 0;"><strong>Número ganador:</strong></p>
      <p style="color: #1E293B; font-size: 18px; font-weight: 700; margin: 0 0 16px 0;">#${data.winningTicketNumber}</p>
      <p style="color: #0F766E; font-size: 14px; margin: 0 0 12px 0;"><strong>Email del ganador:</strong></p>
      <p style="color: #1E293B; font-size: 18px; font-weight: 700; margin: 0;">${data.winnerEmail}</p>
    </div>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6;">
      Tenés <strong>48 horas</strong> para contactar al ganador y coordinar el envío del producto. Una vez despachado, no olvides marcarlo como enviado en la plataforma.
    </p>
  `;
  return wrapEmailTemplate(content, configService);
};

export const getDeliveryReminderToWinnerContent = (
  data: { raffleName: string; daysSinceShipped: number },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">¿Recibiste tu producto? 📦</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Han pasado <strong>${data.daysSinceShipped} días</strong> desde que se envió tu producto de la rifa "<strong>${data.raffleName}</strong>".
    </p>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Por favor, recordá confirmar la recepción en la plataforma para que el vendedor pueda recibir su pago.
    </p>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin: 24px 0;">
      <p style="color: #64748B; font-size: 14px; margin: 0;">
        Si tenés algún problema con el producto, podés abrir una disputa desde el panel de tus tickets.
      </p>
    </div>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Confirmar recepción',
    buttonUrl: `${frontendUrl}/dashboard/tickets`,
  });
};

export const getPaymentWillBeReleasedNotificationContent = (
  data: { raffleName: string; daysRemaining: number },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">El pago se liberará pronto ⏰</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Te informamos que el pago por la rifa "<strong>${data.raffleName}</strong>" se liberará automáticamente en <strong>${data.daysRemaining} días</strong>.
    </p>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6;">
      Si ya recibiste el producto y está todo en orden, podés confirmarlo ahora mismo. Si hay algún problema, asegurate de abrir una disputa antes de que el pago se libere.
    </p>
  `;
  return wrapEmailTemplate(content, configService);
};

export const getPrizeShippedContent = (
  data: { raffleName: string; trackingNumber?: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const trackingInfo = data.trackingNumber
    ? `<div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <p style="color: #0F766E; font-size: 14px; margin: 0 0 8px 0;"><strong>Número de seguimiento:</strong></p>
        <p style="color: #1E293B; font-size: 18px; font-weight: 700; margin: 0;">${data.trackingNumber}</p>
      </div>`
    : '';
  const content = `
    <h2 style="color: #0F766E; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">¡Tu premio fue enviado! 📦</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      El vendedor ha despachado tu premio de la rifa "<strong>${data.raffleName}</strong>".
    </p>
    ${trackingInfo}
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6;">
      Una vez que lo recibas, por favor confirmá la recepción en la plataforma.
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver mis tickets',
    buttonUrl: `${frontendUrl}/dashboard/tickets`,
  });
};

export const getDeliveryConfirmedToSellerContent = (
  data: { raffleName: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #0F766E; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">¡Entrega confirmada! ✅</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      El ganador ha confirmado la recepción del premio de tu rifa "<strong>${data.raffleName}</strong>".
    </p>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6;">
      Los fondos serán liberados a tu cuenta de cobros próximamente.
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver mis ventas',
    buttonUrl: `${frontendUrl}/dashboard/sales`,
  });
};

export const getDisputeOpenedToSellerContent = (
  data: { raffleName: string; disputeType: string; disputeTitle: string },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #EF4444; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Se ha abierto una disputa ⚠️</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
      El ganador ha abierto una disputa por tu rifa "<strong>${data.raffleName}</strong>". El pago quedará retenido hasta que se resuelva la situación.
    </p>
    <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 12px 0; color: #4B5563; font-size: 14px;"><strong>Tipo de disputa:</strong> ${data.disputeType}</p>
      <p style="margin: 0; color: #1E293B; font-size: 16px; font-weight: 600;">"${data.disputeTitle}"</p>
    </div>
    <div style="background: #FFFBEB; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #D97706; font-size: 14px; margin: 0; font-weight: 600;">
        Tenés 48 horas para responder a esta disputa desde tu panel de ventas.
      </p>
    </div>
  `;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Responder Disputa',
    buttonUrl: `${frontendUrl}/dashboard/disputes`,
  });
};

export const getDisputeOpenedToBuyerContent = (
  data: { raffleName: string; disputeId: string },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Disputa registrada 📝</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hemos recibido tu disputa por la rifa "<strong>${data.raffleName}</strong>".
    </p>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
      <p style="color: #64748B; font-size: 12px; margin: 0 0 8px 0;">ID DE DISPUTA</p>
      <p style="color: #1E293B; font-size: 20px; font-weight: 700; margin: 0; font-family: monospace;">${data.disputeId}</p>
    </div>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6;">
      El vendedor tiene 48 horas para responder. Te mantendremos informado sobre cualquier novedad en el proceso.
    </p>
  `;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver Estado de Disputa',
    buttonUrl: `${frontendUrl}/dashboard/disputes`,
  });
};

export const getSellerMustRespondDisputeContent = (
  data: { raffleName: string; hoursRemaining: number },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #EF4444; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Responde a la disputa ⚠️</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
      Te recordamos que tenés una disputa abierta para la rifa "<strong>${data.raffleName}</strong>".
    </p>
    <div style="background: #FFFBEB; border: 1px solid #FEF3C7; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
      <p style="color: #D97706; font-size: 14px; margin: 0 0 8px 0;">TIEMPO RESTANTE</p>
      <p style="color: #B45309; font-size: 32px; font-weight: 800; margin: 0;">${data.hoursRemaining} horas</p>
    </div>
    <p style="color: #EF4444; font-size: 14px; font-weight: 600; line-height: 1.6;">
      Si no respondes dentro del plazo, la disputa podría resolverse automáticamente a favor del comprador y se realizará el reembolso.
    </p>
  `;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Responder Ahora',
    buttonUrl: `${frontendUrl}/dashboard/disputes`,
  });
};

export const getDisputeSellerRespondedContent = (
  data: { raffleName: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">El vendedor respondió a tu disputa 📩</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      El vendedor ha enviado su respuesta a la disputa por la rifa "<strong>${data.raffleName}</strong>".
    </p>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6;">
      Nuestro equipo de soporte revisará ambas partes y tomará una decisión. Te notificaremos cuando se resuelva.
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver Disputa',
    buttonUrl: `${frontendUrl}/dashboard/disputes`,
  });
};

export const getDisputeResolvedNotificationContent = (
  data: { raffleName: string; resolution: string; refundAmount?: number },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #0F766E; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Disputa resuelta ✅</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      La disputa por la rifa "<strong>${data.raffleName}</strong>" ha sido resuelta por nuestro equipo de soporte.
    </p>
    <div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #0F766E; font-size: 14px; margin: 0 0 8px 0;"><strong>Resolución:</strong></p>
      <p style="color: #1E293B; font-size: 16px; margin: 0 0 ${data.refundAmount ? '16px' : '0'} 0;">${data.resolution}</p>
      ${
        data.refundAmount
          ? `
        <p style="color: #0F766E; font-size: 14px; margin: 0 0 8px 0;"><strong>Reembolso:</strong></p>
        <p style="color: #B91C1C; font-size: 20px; font-weight: 700; margin: 0;">$${data.refundAmount.toFixed(2)}</p>
      `
          : ''
      }
    </div>
  `;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver Resolución',
    buttonUrl: `${frontendUrl}/dashboard/disputes`,
  });
};

export const getRefundDueToDisputeNotificationContent = (
  data: { raffleName: string; amount: number },
  configService: ConfigService,
) => {
  const content = `
    <h2 style="color: #EF4444; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">Reembolso procesado 💰</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Se ha procesado un reembolso de <strong>$${data.amount.toFixed(2)}</strong> para la rifa "<strong>${data.raffleName}</strong>" debido a la resolución de la disputa.
    </p>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      El dinero se verá reflejado en tu cuenta en los próximos días hábiles.
    </p>
  `;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver Detalles',
    buttonUrl: `${frontendUrl}/dashboard/disputes`,
  });
};

export const getStripeConnectSuccessNotificationContent = (
  data: { userName: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #0F766E; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">¡Cuenta conectada! ✅</h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.userName}, tu cuenta ha sido conectada exitosamente.
    </p>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6;">
      Ya estás listo para crear rifas y recibir los pagos directamente en tu cuenta. ¡Empezá a vender hoy mismo!
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Crear mi primera rifa',
    buttonUrl: `${frontendUrl}/dashboard/create`,
  });
};

export const getPriceDropAlertContent = (
  data: {
    raffleName: string;
    oldPrice: number;
    newPrice: number;
    dropPercent: number;
    raffleUrl: string;
  },
  configService: ConfigService,
) => {
  const content = `
    <div style="background: linear-gradient(135deg, #10B981, #059669); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <h2 style="color: white; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 800; margin: 0;">📉 ¡EL PRECIO BAJÓ ${data.dropPercent}%!</h2>
    </div>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Una rifa que tenés en favoritos tiene un nuevo precio:
    </p>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
      <h3 style="color: #1F2937; font-family: 'Fraunces', serif; font-size: 18px; font-weight: 700; margin: 0 0 16px 0;">${data.raffleName}</h3>
      <p style="color: #94A3B8; font-size: 16px; text-decoration: line-through; margin: 0 0 4px 0;">Antes: $${data.oldPrice.toFixed(2)}</p>
      <p style="color: #059669; font-size: 32px; font-weight: 800; margin: 0;">Ahora: $${data.newPrice.toFixed(2)}</p>
      <p style="color: #10B981; font-size: 14px; font-weight: 600; margin: 12px 0 0 0;">¡Ahorrás $${(data.oldPrice - data.newPrice).toFixed(2)} por ticket!</p>
    </div>
    <p style="color: #6B7280; font-size: 12px; text-align: center; margin-top: 24px;">
      Recibiste este email porque agregaste esta rifa a tus favoritos.
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver Rifa',
    buttonUrl: data.raffleUrl,
  });
};

// ==================== KYC Notifications ====================

export const getAdminNewKycSubmissionContent = (
  data: { userName: string; userEmail: string; submittedAt: Date },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const formattedDate = data.submittedAt.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const content = `
    <h2 style="color: #D97706; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      Nueva solicitud de KYC 📋
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
      Un usuario ha enviado su documentación de verificación de identidad para revisión.
    </p>
    <div style="background: #FFFBEB; border: 1px solid #FEF3C7; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color: #92400E; font-size: 14px; padding-bottom: 12px;"><strong>Usuario:</strong></td>
          <td align="right" style="color: #1E293B; font-size: 14px; padding-bottom: 12px;">${data.userName}</td>
        </tr>
        <tr>
          <td style="color: #92400E; font-size: 14px; padding-bottom: 12px;"><strong>Email:</strong></td>
          <td align="right" style="color: #1E293B; font-size: 14px; padding-bottom: 12px;">${data.userEmail}</td>
        </tr>
        <tr>
          <td style="color: #92400E; font-size: 14px;"><strong>Fecha de envío:</strong></td>
          <td align="right" style="color: #1E293B; font-size: 14px;">${formattedDate}</td>
        </tr>
      </table>
    </div>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      Por favor, revisá la documentación y aprobá o rechazá la solicitud.
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Revisar KYC',
    buttonUrl: `${frontendUrl}/admin?tab=kyc`,
  });
};

export const getKycApprovedContent = (
  data: { userName: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <div style="background: linear-gradient(135deg, #10B981, #059669); border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 24px;">
      <h2 style="color: white; font-family: 'Fraunces', serif; font-size: 28px; font-weight: 800; margin: 0;">✅ ¡KYC APROBADO!</h2>
    </div>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      ¡Felicitaciones, ${data.userName}! Tu verificación de identidad ha sido aprobada exitosamente.
    </p>
    <div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 20px; margin: 24px 0;">
      <p style="color: #0F766E; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">Ahora podés:</p>
      <ul style="color: #0F766E; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
        <li>Crear y publicar rifas en la plataforma</li>
        <li>Recibir pagos de tus ventas</li>
        <li>Acceder a todas las funcionalidades de vendedor</li>
      </ul>
    </div>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      Si aún no conectaste tu cuenta de cobros, hacelo desde la configuración para poder recibir tus pagos.
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ir a Configuración',
    buttonUrl: `${frontendUrl}/dashboard/settings?tab=verificacion`,
  });
};

export const getKycRejectedContent = (
  data: { userName: string; rejectionReason: string },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #EF4444; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      KYC Rechazado ❌
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.userName}, lamentamos informarte que tu verificación de identidad no pudo ser aprobada.
    </p>
    <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #B91C1C; font-size: 14px; margin: 0 0 8px 0;"><strong>Motivo del rechazo:</strong></p>
      <p style="color: #1E293B; font-size: 15px; margin: 0;">${data.rejectionReason}</p>
    </div>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Podés corregir los datos y volver a enviar tu documentación desde la configuración de tu cuenta.
    </p>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      Si tenés dudas, no dudes en contactarnos.
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Volver a Enviar KYC',
    buttonUrl: `${frontendUrl}/dashboard/settings?tab=verificacion`,
  });
};

// ==================== Question Notifications ====================

export const getNewQuestionNotificationContent = (
  data: {
    sellerName: string;
    raffleName: string;
    questionContent: string;
    askerName: string;
    raffleId: string;
  },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #0F766E; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      Nueva pregunta en tu rifa 💬
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.sellerName}, <strong>${data.askerName}</strong> hizo una pregunta en tu rifa "<strong>${data.raffleName}</strong>".
    </p>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #64748B; font-size: 12px; text-transform: uppercase; margin: 0 0 8px 0;">Pregunta:</p>
      <p style="color: #1E293B; font-size: 16px; font-style: italic; margin: 0;">"${data.questionContent}"</p>
    </div>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      Respondé rápido para aumentar las posibilidades de venta. Las respuestas rápidas generan más confianza.
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Responder Pregunta',
    buttonUrl: `${frontendUrl}/raffle/${data.raffleId}`,
  });
};

export const getQuestionAnsweredNotificationContent = (
  data: {
    buyerName: string;
    raffleName: string;
    questionContent: string;
    answerContent: string;
    sellerName: string;
    raffleId: string;
  },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const content = `
    <h2 style="color: #0F766E; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      Tu pregunta fue respondida ✅
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.buyerName}, <strong>${data.sellerName}</strong> respondió tu pregunta en la rifa "<strong>${data.raffleName}</strong>".
    </p>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #64748B; font-size: 12px; text-transform: uppercase; margin: 0 0 8px 0;">Tu pregunta:</p>
      <p style="color: #6B7280; font-size: 14px; font-style: italic; margin: 0 0 16px 0;">"${data.questionContent}"</p>
      <div style="border-top: 1px solid #E2E8F0; padding-top: 16px;">
        <p style="color: #64748B; font-size: 12px; text-transform: uppercase; margin: 0 0 8px 0;">Respuesta:</p>
        <p style="color: #1E293B; font-size: 16px; margin: 0;">"${data.answerContent}"</p>
      </div>
    </div>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver Rifa',
    buttonUrl: `${frontendUrl}/raffle/${data.raffleId}`,
  });
};

export const getSellerReviewReceivedContent = (
  data: {
    sellerName: string;
    sellerId: string;
    reviewerName: string;
    raffleName: string;
    rating: number;
    comentario?: string | null;
  },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const safeRating = Math.max(1, Math.min(5, data.rating));
  const stars = '★'.repeat(safeRating) + '☆'.repeat(5 - safeRating);
  const sellerName = escapeHtml(data.sellerName);
  const reviewerName = escapeHtml(data.reviewerName);
  const raffleName = escapeHtml(data.raffleName);
  const comment = data.comentario ? escapeHtml(data.comentario) : null;
  const commentHtml = data.comentario
    ? `
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <p style="color: #64748B; font-size: 12px; text-transform: uppercase; margin: 0 0 8px 0;">Comentario</p>
        <p style="color: #1F2937; font-size: 15px; line-height: 1.6; margin: 0;">"${comment}"</p>
      </div>
    `
    : '';

  const content = `
    <h2 style="color: #0F766E; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      Recibiste una nueva reseña
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${sellerName}, ${reviewerName} dejó una reseña sobre la rifa "<strong>${raffleName}</strong>".
    </p>
    <div style="background: #FFFBEB; border: 1px solid #FEF3C7; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
      <p style="color: #92400E; font-size: 28px; letter-spacing: 3px; margin: 0 0 8px 0;">${stars}</p>
      <p style="color: #92400E; font-size: 14px; margin: 0;">${safeRating} de 5 estrellas</p>
    </div>
    ${commentHtml}
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6; margin: 0;">
      Esta reseña ayuda a construir tu reputación como vendedor en ${BRAND_NAME}.
    </p>
  `;

  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver mi perfil público',
    buttonUrl: `${frontendUrl}/seller/${encodeURIComponent(data.sellerId)}`,
  });
};

// ==================== Seller Ticket Purchase Notification ====================

export const getSellerTicketPurchasedContent = (
  data: {
    sellerName: string;
    raffleName: string;
    ticketCount: number;
    amount: number;
    soldTickets: number;
    totalTickets: number;
    raffleId: string;
    packApplied?: boolean;
    baseQuantity?: number;
    bonusQuantity?: number;
    grantedQuantity?: number;
    subsidyAmount?: number;
  },
  configService: ConfigService,
) => {
  const frontendUrl = getFrontendUrl(configService);
  const progressPercent = Math.round(
    (data.soldTickets / data.totalTickets) * 100,
  );
  const hasPackDetails =
    data.packApplied &&
    typeof data.baseQuantity === 'number' &&
    typeof data.bonusQuantity === 'number' &&
    typeof data.grantedQuantity === 'number' &&
    data.bonusQuantity > 0;
  const content = `
    <h2 style="color: #10B981; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; margin: 0 0 16px 0;">
      ¡Nueva venta! 🎉
    </h2>
    <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
      Hola ${data.sellerName}, alguien compró tickets en tu rifa "<strong>${data.raffleName}</strong>".
    </p>
    <div style="background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color: #0F766E; font-size: 14px; padding-bottom: 12px;">${hasPackDetails ? 'Tickets emitidos:' : 'Tickets vendidos:'}</td>
          <td align="right" style="color: #1E293B; font-size: 14px; font-weight: 700; padding-bottom: 12px;">${hasPackDetails ? data.grantedQuantity : data.ticketCount}</td>
        </tr>
        ${
          hasPackDetails
            ? `
        <tr>
          <td style="color: #0F766E; font-size: 14px; padding-bottom: 12px;">Tickets bonus:</td>
          <td align="right" style="color: #1E293B; font-size: 14px; font-weight: 700; padding-bottom: 12px;">${data.bonusQuantity}</td>
        </tr>
        <tr>
          <td style="color: #0F766E; font-size: 14px; padding-bottom: 12px;">Subsidio LUK:</td>
          <td align="right" style="color: #1E293B; font-size: 14px; font-weight: 700; padding-bottom: 12px;">$${(data.subsidyAmount ?? 0).toFixed(2)}</td>
        </tr>
        `
            : ''
        }
        <tr>
          <td style="color: #0F766E; font-size: 14px; padding-bottom: 16px;">${hasPackDetails ? 'Monto bruto:' : 'Monto:'}</td>
          <td align="right" style="color: #059669; font-size: 18px; font-weight: 800; padding-bottom: 16px;">$${data.amount.toFixed(2)}</td>
        </tr>
        <tr>
          <td colspan="2">
            <div style="background: #E2E8F0; border-radius: 9999px; height: 8px; overflow: hidden;">
              <div style="background: linear-gradient(90deg, #10B981, #059669); height: 100%; width: ${progressPercent}%;"></div>
            </div>
            <p style="color: #64748B; font-size: 12px; text-align: center; margin: 8px 0 0 0;">
              Progreso: ${data.soldTickets}/${data.totalTickets} tickets (${progressPercent}%)
            </p>
          </td>
        </tr>
      </table>
    </div>
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      ${
        hasPackDetails
          ? 'Los tickets bonus fueron subsidiados por LUK y no reducen el cobro de esta venta.'
          : '¡Seguí así! Compartí tu rifa para vender más rápido.'
      }
    </p>
  `;
  return wrapEmailTemplate(content, configService, {
    showButton: true,
    buttonText: 'Ver mi Rifa',
    buttonUrl: `${frontendUrl}/raffle/${data.raffleId}`,
  });
};

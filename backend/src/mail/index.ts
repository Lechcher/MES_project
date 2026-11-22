/**
 * Outbound mail.
 *
 * `sender` is the transport port, `reset-message` composes the password-reset
 * message, and `delivery` records the outcome of each attempt.
 */

export {
	type DeliverMailDeps,
	type DeliverMailMeta,
	deliverMail,
	EMAIL_CHANGE_VERIFICATION_TEMPLATE,
	MAIL_CHANNEL,
	type MailOutcome,
	PASSWORD_RESET_TEMPLATE,
} from "./delivery";
export {
	buildResetUrl,
	composePasswordResetMessage,
	RESET_ROUTE_PATH,
	type ResetMessageInput,
} from "./reset-message";
export {
	createCredentialScrubber,
	createRecordingMailSender,
	createSmtpMailSender,
	MailDeliveryError,
	type MailMessage,
	type MailSender,
	type RecordingMailSender,
	type SmtpMailSender,
	toDeliveryError,
} from "./sender";
export {
	buildConfirmEmailUrl,
	CONFIRM_EMAIL_ROUTE_PATH,
	composeEmailChangeMessage,
	type EmailChangeMessageInput,
} from "./verify-email-message";

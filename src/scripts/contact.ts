import {
  validateContact,
  type ContactErrors,
  type ContactField,
} from '../lib/contact';
type Turnstile = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: string;
      callback: () => void;
      'error-callback': () => void;
      'expired-callback': () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  getResponse: (widgetId: string) => string;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
const form = document.querySelector<HTMLFormElement>('#contact-form');
if (form?.dataset.enabled === 'true') initialize(form);
function initialize(form: HTMLFormElement) {
  form.querySelector('#contact-js-note')?.setAttribute('hidden', '');
  const submit = form.querySelector<HTMLButtonElement>('#contact-submit')!;
  const fieldset = form.querySelector('fieldset')!;
  const status = form.querySelector<HTMLElement>('#contact-status')!;
  const widget = form.querySelector<HTMLElement>('#turnstile-widget')!;
  let widgetId: string | undefined,
    busy = false,
    mounted = false;
  submit.disabled = true;
  const showStatus = (message: string, error = false) => {
    status.textContent = message;
    status.setAttribute('role', error ? 'alert' : 'status');
  };
  const showErrors = (errors: ContactErrors) => {
    const fields: ContactField[] = [
      'name',
      'email',
      'category',
      'message',
      'verification',
    ];
    for (const field of fields) {
      form.querySelector<HTMLElement>(`#${field}-error`)!.textContent =
        errors[field] ?? '';
      form
        .querySelector<HTMLInputElement>(`#${field}`)
        ?.setAttribute('aria-invalid', String(Boolean(errors[field])));
    }
  };
  const mount = () => {
    if (mounted || !window.turnstile) return;
    mounted = true;
    try {
      widgetId = window.turnstile.render(widget, {
        sitekey: form.dataset.sitekey!,
        action: 'contact',
        theme: 'light',
        callback: () => {
          if (!busy) submit.disabled = false;
        },
        'error-callback': () => {
          submit.disabled = true;
          showStatus(
            'Security verification could not load. Please refresh and try again.',
            true,
          );
        },
        'expired-callback': () => {
          submit.disabled = true;
          showStatus(
            'Security verification expired. Complete it again before submitting.',
            true,
          );
        },
      });
    } catch {
      submit.disabled = true;
      showStatus(
        'Security verification could not load. Please refresh and try again.',
        true,
      );
    }
  };
  const script = document.createElement('script');
  script.src =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.defer = true;
  script.addEventListener('load', mount);
  script.addEventListener('error', () =>
    showStatus(
      'Security verification could not load. Please refresh and try again.',
      true,
    ),
  );
  document.head.append(script);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(form));
    values['cf-turnstile-response'] =
      widgetId && window.turnstile
        ? window.turnstile.getResponse(widgetId)
        : '';
    const validation = validateContact(values);
    showErrors(validation.valid ? {} : validation.errors);
    if (!validation.valid) {
      showStatus('Please check the highlighted fields.', true);
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    busy = true;
    fieldset.disabled = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    showStatus('Sending your inquiry…');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(values),
        signal: AbortSignal.timeout(25_000),
      });
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('message' in result) ||
        typeof result.message !== 'string'
      )
        throw new Error('Invalid server response');
      if (response.ok && 'ok' in result && result.ok === true) {
        form.reset();
        showStatus(result.message);
      } else {
        if (
          'errors' in result &&
          result.errors &&
          typeof result.errors === 'object'
        )
          showErrors(result.errors as ContactErrors);
        showStatus(result.message, true);
      }
    } catch {
      showStatus(
        'We could not confirm email acceptance. Please wait before trying again.',
        true,
      );
    } finally {
      busy = false;
      fieldset.disabled = false;
      form.removeAttribute('aria-busy');
      submit.disabled = true;
      if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
      status.focus();
    }
  });
}

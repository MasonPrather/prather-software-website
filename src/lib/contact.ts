/** Shared, browser-safe validation. Secrets and delivery code belong in worker/. */
export const inquiryCategories = [
  { value: 'project', label: 'Project consultation' },
  { value: 'product-support', label: 'Product support' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'general', label: 'General inquiry' },
] as const;
export type InquiryCategory = (typeof inquiryCategories)[number]['value'];
export type ContactField =
  'name' | 'email' | 'category' | 'message' | 'verification';
export type ContactErrors = Partial<Record<ContactField, string>>;
export interface ContactSubmission {
  name: string;
  email: string;
  category: InquiryCategory;
  message: string;
  token: string;
}
export type ValidationResult =
  | { valid: true; value: ContactSubmission }
  | { valid: false; errors: ContactErrors };
const singleLine = (value: string) => !/[\r\n\u0000-\u001f\u007f]/.test(value);
export function validateContact(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return {
      valid: false,
      errors: { message: 'Please complete the inquiry form.' },
    };
  const data = input as Record<string, unknown>;
  const read = (key: string) =>
    typeof data[key] === 'string' ? data[key].trim() : '';
  const name = read('name'),
    email = read('email'),
    category = read('category'),
    message = read('message'),
    token = read('cf-turnstile-response');
  const errors: ContactErrors = {};
  if (name.length < 2 || name.length > 100 || !singleLine(name))
    errors.name = 'Enter a name between 2 and 100 characters.';
  if (
    email.length > 254 ||
    !singleLine(email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    errors.email = 'Enter a valid email address.';
  if (!inquiryCategories.some((item) => item.value === category))
    errors.category = 'Choose an inquiry type from the list.';
  if (
    message.length < 20 ||
    message.length > 5000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)
  )
    errors.message = 'Enter details between 20 and 5,000 characters.';
  if (token.length === 0 || token.length > 2048)
    errors.verification = 'Complete the security verification and try again.';
  if (Object.keys(errors).length) return { valid: false, errors };
  return {
    valid: true,
    value: {
      name,
      email,
      category: category as InquiryCategory,
      message,
      token,
    },
  };
}
